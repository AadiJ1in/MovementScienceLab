from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

CANDIDATE_FEATURES = [
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


def build_pipeline(features: list[str]) -> Pipeline:
    numeric = Pipeline(steps=[("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    preprocess = ColumnTransformer(transformers=[("numeric", numeric, features)], remainder="drop")
    classifier = LogisticRegression(penalty="l2", class_weight="balanced", max_iter=5000, random_state=42)
    return Pipeline(steps=[("preprocess", preprocess), ("classifier", classifier)])


def validate_columns(df: pd.DataFrame) -> list[str]:
    required = {"subject_id", "label", *CANDIDATE_FEATURES}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    labels = set(df["label"].dropna().astype(int).unique().tolist())
    if not labels.issubset({0, 1}) or len(labels) < 2:
        raise ValueError("label must contain both 0 (reference/correct) and 1 (deviation/non-optimal).")
    if df["subject_id"].nunique() < 6:
        raise ValueError("At least 6 distinct subjects are required for grouped validation.")

    observed = [feature for feature in CANDIDATE_FEATURES if df[feature].notna().any()]
    if len(observed) < 3:
        raise ValueError("At least three observed biomechanical features are required.")
    return observed


def confusion_stats(y_true: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    predictions = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predictions, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) else None
    specificity = tn / (tn + fp) if (tn + fp) else None
    balanced_accuracy = None
    if sensitivity is not None and specificity is not None:
        balanced_accuracy = (sensitivity + specificity) / 2.0
    return {
        "threshold": float(threshold),
        "sensitivity": None if sensitivity is None else float(sensitivity),
        "specificity": None if specificity is None else float(specificity),
        "balancedAccuracy": None if balanced_accuracy is None else float(balanced_accuracy),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def select_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.unique(np.concatenate(([0.0, 0.5, 1.0], probabilities)))
    scored: list[tuple[float, float, float]] = []
    for threshold in candidates:
        stats = confusion_stats(y_true, probabilities, float(threshold))
        balanced = stats["balancedAccuracy"]
        if balanced is None:
            continue
        # Maximize balanced accuracy. On ties, prefer the threshold closest to
        # 0.5 to avoid choosing an unnecessarily extreme operating point.
        scored.append((float(balanced), -abs(float(threshold) - 0.5), float(threshold)))
    if not scored:
        raise ValueError("Could not select a development threshold.")
    return max(scored)[2]


def metrics(y_true: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    result = {
        "auroc": float(roc_auc_score(y_true, probabilities)),
        "auprc": float(average_precision_score(y_true, probabilities)),
        "brier": float(brier_score_loss(y_true, probabilities)),
    }
    result.update(confusion_stats(y_true, probabilities, threshold))
    return result


def prob_to_logit(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    return np.log(clipped / (1 - clipped))


def fit_and_export(input_csv: Path, output_json: Path) -> None:
    df = pd.read_csv(input_csv)
    features = validate_columns(df)
    unavailable_features = [feature for feature in CANDIDATE_FEATURES if feature not in features]

    X = df[features]
    y = df["label"].astype(int).to_numpy()
    groups = df["subject_id"].astype(str).to_numpy()

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y, groups))
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    groups_train = groups[train_idx]

    unique_train_groups = np.unique(groups_train)
    folds = min(5, len(unique_train_groups))
    if folds < 3:
        raise ValueError("Training split needs at least 3 distinct subjects for grouped calibration.")

    grouped_cv = GroupKFold(n_splits=folds)
    base = build_pipeline(features)
    development_raw = cross_val_predict(
        base, X_train, y_train, groups=groups_train, cv=grouped_cv, method="predict_proba"
    )[:, 1]

    calibration_model = LogisticRegression(penalty=None, max_iter=2000, random_state=42)
    calibration_model.fit(prob_to_logit(development_raw).reshape(-1, 1), y_train)
    development_probabilities = calibration_model.predict_proba(
        prob_to_logit(development_raw).reshape(-1, 1)
    )[:, 1]

    # The operating point is selected only from out-of-fold development
    # predictions. The held-out subjects do not influence the threshold.
    decision_threshold = select_threshold(y_train, development_probabilities)

    interpretable = build_pipeline(features)
    interpretable.fit(X_train, y_train)
    test_raw = interpretable.predict_proba(X_test)[:, 1]
    test_probabilities = calibration_model.predict_proba(prob_to_logit(test_raw).reshape(-1, 1))[:, 1]

    scaler = interpretable.named_steps["preprocess"].named_transformers_["numeric"].named_steps["scale"]
    imputer = interpretable.named_steps["preprocess"].named_transformers_["numeric"].named_steps["impute"]
    classifier = interpretable.named_steps["classifier"]

    standardized_train = interpretable.named_steps["preprocess"].transform(X_train)
    per_row_max_abs_z = np.max(np.abs(standardized_train), axis=1)
    max_abs_z_gate = float(np.quantile(per_row_max_abs_z, 0.99))

    artifact = {
        "schemaVersion": "1.1.0",
        "modelType": "movement-quality-deviation-classifier",
        "clinicalClaim": "none",
        "positiveClass": "training-set deviation/non-optimal movement",
        "negativeClass": "training-set reference/correct movement",
        "features": features,
        "unavailableSourceFeatures": unavailable_features,
        "preprocessing": {
            "imputation": "median",
            "medians": [float(x) for x in imputer.statistics_],
            "means": [float(x) for x in scaler.mean_],
            "scales": [float(x) for x in scaler.scale_],
        },
        "interpretableBaseline": {
            "intercept": float(classifier.intercept_[0]),
            "coefficients": {feature: float(value) for feature, value in zip(features, classifier.coef_[0], strict=True)},
        },
        "calibration": {
            "method": "platt-logistic-on-subject-grouped-oof-logits",
            "intercept": float(calibration_model.intercept_[0]),
            "coefficient": float(calibration_model.coef_[0, 0]),
        },
        "decisionPolicy": {
            "threshold": float(decision_threshold),
            "selectionMethod": "maximize-balanced-accuracy-on-subject-grouped-oof-development-predictions",
            # Engineering uncertainty band, not a clinical/biomechanical cutoff.
            "uncertaintyHalfWidth": 0.10,
        },
        "domainGate": {
            "method": "max-absolute-standardized-feature",
            "maxAbsStandardizedValue": max_abs_z_gate,
            "trainingQuantile": 0.99,
            "maxMissingFraction": 0.25,
        },
        "validation": {
            "splitUnit": "subject",
            "development": metrics(y_train, development_probabilities, decision_threshold),
            "untouchedTest": metrics(y_test, test_probabilities, decision_threshold),
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
