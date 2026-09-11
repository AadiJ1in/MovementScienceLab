from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
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
    "repetition",
    "session_id",
    "view",
    "camera",
    "camera_id",
    "position",
    "site",
    "site_id",
    "cohort",
    "recording_id",
    "annotator_count",
    "error_type_count",
}


def candidate_features(df: pd.DataFrame) -> list[str]:
    return [
        column
        for column in df.columns
        if column not in NON_FEATURE_COLUMNS
        and pd.api.types.is_numeric_dtype(df[column])
        and df[column].notna().any()
    ]


def logistic(features: list[str]) -> Pipeline:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, features)], remainder="drop")),
        ("classifier", LogisticRegression(class_weight="balanced", max_iter=5000, random_state=42)),
    ])


def tree(features: list[str], estimator) -> Pipeline:
    numeric = Pipeline([("impute", SimpleImputer(strategy="median"))])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, features)], remainder="drop")),
        ("classifier", estimator),
    ])


def choose_threshold(y: np.ndarray, probability: np.ndarray) -> float:
    best_score = -1.0
    best_threshold = 0.5
    for threshold in np.unique(np.concatenate(([0.05, 0.5, 0.95], probability))):
        prediction = (probability >= threshold).astype(int)
        score = float(balanced_accuracy_score(y, prediction))
        if score > best_score or (score == best_score and abs(threshold - 0.5) < abs(best_threshold - 0.5)):
            best_score = score
            best_threshold = float(threshold)
    return best_threshold


def evaluate(name: str, model: Pipeline, X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, cv: GroupKFold) -> dict:
    probability = cross_val_predict(model, X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    threshold = choose_threshold(y, probability)
    prediction = (probability >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, prediction, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if tp + fn else None
    specificity = tn / (tn + fp) if tn + fp else None
    return {
        "model": name,
        "auroc": float(roc_auc_score(y, probability)),
        "auprc": float(average_precision_score(y, probability)),
        "brier": float(brier_score_loss(y, probability)),
        "balancedAccuracy": float(balanced_accuracy_score(y, prediction)),
        "sensitivity": None if sensitivity is None else float(sensitivity),
        "specificity": None if specificity is None else float(specificity),
        "threshold": threshold,
    }


def benchmark_group(df: pd.DataFrame) -> dict:
    exercise_id = int(df["exercise_id"].iloc[0])
    exercise_name = str(df["exercise_name"].iloc[0])
    features = candidate_features(df)
    groups = df["subject_id"].astype(str).to_numpy()
    y = df["label"].astype(int).to_numpy()
    subjects = len(np.unique(groups))

    if subjects < 6 or len(np.unique(y)) < 2 or len(features) < 4:
        return {
            "exerciseId": exercise_id,
            "exerciseName": exercise_name,
            "status": "skipped",
            "reason": "insufficient groups, labels, or observed features",
        }

    X = df[features]
    cv = GroupKFold(n_splits=min(5, subjects))
    candidates = {
        "logistic_l2": logistic(features),
        "random_forest": tree(
            features,
            RandomForestClassifier(
                n_estimators=900,
                min_samples_leaf=2,
                max_features="sqrt",
                class_weight="balanced_subsample",
                random_state=42,
                n_jobs=-1,
            ),
        ),
        "extra_trees": tree(
            features,
            ExtraTreesClassifier(
                n_estimators=900,
                min_samples_leaf=2,
                max_features="sqrt",
                class_weight="balanced",
                random_state=42,
                n_jobs=-1,
            ),
        ),
    }
    results = [evaluate(name, model, X, y, groups, cv) for name, model in candidates.items()]
    ranking = sorted(
        results,
        key=lambda result: (result["auroc"], result["balancedAccuracy"], -result["brier"]),
        reverse=True,
    )
    return {
        "exerciseId": exercise_id,
        "exerciseName": exercise_name,
        "status": "benchmarked",
        "nRows": int(len(df)),
        "nSubjects": int(subjects),
        "nFeatures": len(features),
        "excludedMetadataColumns": sorted(column for column in NON_FEATURE_COLUMNS if column in df.columns),
        "results": results,
        "recommendedResearchModel": ranking[0]["model"],
        "recommendedMetrics": ranking[0],
    }


def main(input_csv: Path, output_json: Path) -> None:
    df = pd.read_csv(input_csv)
    required = {"exercise_id", "exercise_name", "subject_id", "label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    tasks = [benchmark_group(group.copy()) for _, group in df.groupby("exercise_id", sort=True)]
    payload = {
        "schemaVersion": "1.1.0",
        "protocol": "subject-grouped out-of-fold per-task model-family benchmark",
        "positiveClass": "deviation/non-optimal movement",
        "tasks": tasks,
        "warning": "Internal grouped validation is not external or webcam-domain clinical validation.",
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    main(args.input_csv, args.output_json)
