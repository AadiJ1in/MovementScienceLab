from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, balanced_accuracy_score, brier_score_loss, confusion_matrix, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

NON_FEATURE_COLUMNS = {
    "exercise_id",
    "exercise_name",
    "subject_id",
    "label",
    "source_file",
    "source_correctness",
    "session_id",
    "repetition",
    "position",
    "camera_id",
    "view",
    "site_id",
    "cohort",
}


def pipeline(features: list[str]) -> Pipeline:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, features)], remainder="drop")),
        ("classifier", LogisticRegression(class_weight="balanced", max_iter=5000, random_state=42)),
    ])


def threshold_for(y: np.ndarray, p: np.ndarray) -> float:
    best_score = -1.0
    best_threshold = 0.5
    for threshold in np.unique(np.concatenate(([0.05, 0.5, 0.95], p))):
        score = balanced_accuracy_score(y, (p >= threshold).astype(int))
        if score > best_score or (score == best_score and abs(threshold - 0.5) < abs(best_threshold - 0.5)):
            best_score = float(score)
            best_threshold = float(threshold)
    return best_threshold


def metrics(y: np.ndarray, p: np.ndarray, threshold: float) -> dict:
    pred = (p >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) else None
    specificity = tn / (tn + fp) if (tn + fp) else None
    return {
        "auroc": float(roc_auc_score(y, p)),
        "auprc": float(average_precision_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "threshold": float(threshold),
        "balancedAccuracy": float(balanced_accuracy_score(y, pred)),
        "sensitivity": None if sensitivity is None else float(sensitivity),
        "specificity": None if specificity is None else float(specificity),
        "confusionMatrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def fit_exercise(df: pd.DataFrame, commercial_use_blocked: bool) -> dict:
    exercise_name = str(df["exercise_name"].iloc[0])
    exercise_id = int(df["exercise_id"].iloc[0])
    groups = df["subject_id"].astype(str).to_numpy()
    y = df["label"].astype(int).to_numpy()

    if len(np.unique(y)) < 2:
        return {"exerciseId": exercise_id, "exerciseName": exercise_name, "status": "skipped", "reason": "only one label class"}
    n_subjects = len(np.unique(groups))
    if n_subjects < 6:
        return {"exerciseId": exercise_id, "exerciseName": exercise_name, "status": "skipped", "reason": "fewer than 6 subjects"}

    candidate_features = [
        col for col in df.columns
        if col not in NON_FEATURE_COLUMNS and pd.api.types.is_numeric_dtype(df[col]) and df[col].notna().any()
    ]
    if len(candidate_features) < 4:
        return {"exerciseId": exercise_id, "exerciseName": exercise_name, "status": "skipped", "reason": "insufficient observed features"}

    X = df[candidate_features]
    cv = GroupKFold(n_splits=min(5, n_subjects))
    model = pipeline(candidate_features)
    p = cross_val_predict(model, X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    threshold = threshold_for(y, p)
    model.fit(X, y)

    preprocess = model.named_steps["preprocess"].named_transformers_["numeric"]
    imputer = preprocess.named_steps["impute"]
    scaler = preprocess.named_steps["scale"]
    classifier = model.named_steps["classifier"]
    standardized = model.named_steps["preprocess"].transform(X)
    max_abs_z = np.max(np.abs(standardized), axis=1)

    return {
        "exerciseId": exercise_id,
        "exerciseName": exercise_name,
        "status": "trained-research-only",
        "positiveClass": "deviation/non-optimal movement",
        "negativeClass": "reference/correct movement",
        "nRepetitions": int(len(df)),
        "nSubjects": int(n_subjects),
        "nDeviations": int(np.sum(y == 1)),
        "nReference": int(np.sum(y == 0)),
        "features": candidate_features,
        "excludedMetadataColumns": sorted(col for col in NON_FEATURE_COLUMNS if col in df.columns),
        "preprocessing": {
            "medians": [float(x) for x in imputer.statistics_],
            "means": [float(x) for x in scaler.mean_],
            "scales": [float(x) for x in scaler.scale_],
        },
        "model": {
            "type": "logistic-regression-l2-balanced",
            "intercept": float(classifier.intercept_[0]),
            "coefficients": {
                feature: float(coef)
                for feature, coef in zip(candidate_features, classifier.coef_[0], strict=True)
            },
        },
        "decisionPolicy": {
            "threshold": float(threshold),
            "selection": "max-balanced-accuracy-on-subject-grouped-oof",
            "uncertaintyHalfWidth": 0.10,
        },
        "domainGate": {
            "method": "max-absolute-standardized-feature",
            "maxAbsStandardizedValue": float(np.quantile(max_abs_z, 0.99)),
            "trainingQuantile": 0.99,
            "maxMissingFraction": 0.25,
        },
        "validation": metrics(y, p, threshold),
        "deploymentGate": {
            "requiresIndependentExternalValidation": True,
            "requiresWebcamDomainValidation": True,
            "commercialUseBlockedBySourceLicense": commercial_use_blocked,
            "mayBeDisplayedAsInjuryProbability": False,
        },
    }


def main(input_csv: Path, output_json: Path, source_dataset: str, commercial_use_blocked: bool) -> None:
    df = pd.read_csv(input_csv)
    required = {"exercise_id", "exercise_name", "subject_id", "label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    models = [fit_exercise(group.copy(), commercial_use_blocked) for _, group in df.groupby("exercise_id", sort=True)]
    payload = {
        "schemaVersion": "1.1.0",
        "modelFamily": "task-specific-rehab-movement-quality",
        "sourceDataset": source_dataset,
        "clinicalClaim": "none",
        "models": models,
        "warning": "These models classify resemblance to source-dataset correct/deviation examples. They are not injury predictors and are not cleared for hospital production.",
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "sourceDataset": source_dataset,
        "trained": [m["exerciseName"] for m in models if m["status"] == "trained-research-only"],
        "skipped": [m for m in models if m["status"] == "skipped"],
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--source-dataset", default="REHAB24-6")
    parser.add_argument("--commercial-use-blocked", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()
    main(args.input_csv, args.output_json, args.source_dataset, args.commercial_use_blocked)
