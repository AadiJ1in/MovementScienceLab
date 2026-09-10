from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "left_knee_flexion_min",
    "left_knee_flexion_max",
    "left_knee_flexion_range",
    "right_knee_flexion_min",
    "right_knee_flexion_max",
    "right_knee_flexion_range",
    "peak_abs_left_knee_frontal_deviation",
    "peak_abs_right_knee_frontal_deviation",
    "peak_trunk_lean",
    "peak_abs_pelvic_line_obliquity",
    "left_shoulder_elevation_peak",
    "right_shoulder_elevation_peak",
    "knee_flexion_asymmetry",
    "shoulder_elevation_asymmetry",
    "rep_duration_ms",
    "mean_pose_confidence",
    "min_pose_confidence",
]


def build_pipeline() -> Pipeline:
    numeric = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    preprocess = ColumnTransformer(
        transformers=[("numeric", numeric, FEATURES)], remainder="drop"
    )
    classifier = LogisticRegression(
        penalty="l2",
        class_weight="balanced",
        max_iter=5000,
        random_state=42,
    )
    return Pipeline(steps=[("preprocess", preprocess), ("classifier", classifier)])


def validate_columns(df: pd.DataFrame) -> None:
    required = {"subject_id", "label", *FEATURES}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    labels = set(df["label"].dropna().astype(int).unique().tolist())
    if not labels.issubset({0, 1}) or len(labels) < 2:
        raise ValueError("label must contain both 0 (reference/correct) and 1 (deviation/non-optimal).")
    if df["subject_id"].nunique() < 6:
        raise ValueError("At least 6 distinct subjects are required for grouped validation.")


def metrics(y_true: np.ndarray, probabilities: np.ndarray, threshold: float = 0.5) -> dict:
    predictions = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predictions, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) else None
    specificity = tn / (tn + fp) if (tn + fp) else None
    return {
        "auroc": float(roc_auc_score(y_true, probabilities)),
        "auprc": float(average_precision_score(y_true, probabilities)),
        "brier": float(brier_score_loss(y_true, probabilities)),
        "sensitivity_at_0_5": None if sensitivity is None else float(sensitivity),
        "specificity_at_0_5": None if specificity is None else float(specificity),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def platt_fit(raw_probabilities: np.ndarray, y: np.ndarray) -> LogisticRegression:
    eps = 1e-6
    clipped = np.clip(raw_probabilities, eps, 1 - eps)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    calibrator = LogisticRegression(max_iter=2000, random_state=42)
    calibrator.fit(logits, y)
    return calibrator


def platt_apply(calibrator: LogisticRegression, raw_probabilities: np.ndarray) -> np.ndarray:
    eps = 1e-6
    clipped = np.clip(raw_probabilities, eps, 1 - eps)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    return calibrator.predict_proba(logits)[:, 1]


def fit_and_export(input_csv: Path, output_json: Path) -> None:
    df = pd.read_csv(input_csv)
    validate_columns(df)

    X = df[FEATURES]
    y = df["label"].astype(int).to_numpy()
    groups = df["subject_id"].astype(str).to_numpy()

    # Untouched subject-level holdout. No frame/rep from a held-out subject may
    # appear in training, preventing the most common movement-AI leakage mode.
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y, groups))
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    groups_train = groups[train_idx]

    folds = min(5, len(np.unique(groups_train)))
    if folds < 3:
        raise ValueError("Training split needs at least 3 distinct subjects for grouped validation.")

    base = build_pipeline()
    grouped_cv = GroupKFold(n_splits=folds)

    # Out-of-fold probabilities come only from models that did not train on the
    # held-out subject. These are used both for development metrics and to fit
    # a separate Platt calibrator without subject leakage.
    oof_raw = cross_val_predict(
        base,
        X_train,
        y_train,
        groups=groups_train,
        cv=grouped_cv,
        method="predict_proba",
    )[:, 1]
    calibrator = platt_fit(oof_raw, y_train)
    development_probabilities = platt_apply(calibrator, oof_raw)

    # Fit the deployable baseline on all training subjects, then apply only the
    # calibrator learned from grouped out-of-fold predictions to the untouched
    # subject-level test set.
    interpretable = build_pipeline()
    interpretable.fit(X_train, y_train)
    test_raw = interpretable.predict_proba(X_test)[:, 1]
    test_probabilities = platt_apply(calibrator, test_raw)

    scaler = interpretable.named_steps["preprocess"].named_transformers_["numeric"].named_steps["scale"]
    imputer = interpretable.named_steps["preprocess"].named_transformers_["numeric"].named_steps["impute"]
    classifier = interpretable.named_steps["classifier"]

    artifact = {
        "schemaVersion": "1.0.0",
        "modelType": "movement-quality-deviation-classifier",
        "clinicalClaim": "none",
        "positiveClass": "training-set deviation/non-optimal movement",
        "negativeClass": "training-set reference/correct movement",
        "features": FEATURES,
        "preprocessing": {
            "imputation": "median",
            "medians": [float(x) for x in imputer.statistics_],
            "means": [float(x) for x in scaler.mean_],
            "scales": [float(x) for x in scaler.scale_],
        },
        "interpretableBaseline": {
            "intercept": float(classifier.intercept_[0]),
            "coefficients": {
                feature: float(value)
                for feature, value in zip(FEATURES, classifier.coef_[0], strict=True)
            },
        },
        "calibration": {
            "method": "Platt scaling from subject-grouped out-of-fold predictions",
            "intercept": float(calibrator.intercept_[0]),
            "coefficient": float(calibrator.coef_[0][0]),
        },
        "validation": {
            "splitUnit": "subject",
            "development": metrics(y_train, development_probabilities),
            "untouchedTest": metrics(y_test, test_probabilities),
            "nSubjectsTotal": int(df["subject_id"].nunique()),
            "nSubjectsTrain": int(len(np.unique(groups_train))),
            "nSubjectsTest": int(len(np.unique(groups[test_idx]))),
            "nRowsTrain": int(len(train_idx)),
            "nRowsTest": int(len(test_idx)),
        },
        "deploymentGate": {
            "requiresExternalDatasetValidation": True,
            "requiresCameraDomainValidation": True,
            "mayBeDisplayedAsInjuryProbability": False,
        },
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    fit_and_export(args.input_csv, args.output_json)
