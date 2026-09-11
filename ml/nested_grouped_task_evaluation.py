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
    "exercise_id", "exercise_name", "subject_id", "label", "source_file",
    "source_correctness", "repetition", "session_id", "view", "camera",
    "camera_id", "position", "site", "site_id", "cohort", "recording_id",
    "annotator_count", "error_type_count",
}


def features_for(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in NON_FEATURE_COLUMNS and pd.api.types.is_numeric_dtype(df[c]) and df[c].notna().any()]


def make_pipeline(name: str, features: list[str]) -> Pipeline:
    if name == "logistic_l2":
        prep = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
        model = LogisticRegression(class_weight="balanced", max_iter=5000, random_state=42)
    elif name == "random_forest":
        prep = Pipeline([("impute", SimpleImputer(strategy="median"))])
        model = RandomForestClassifier(
            n_estimators=700, min_samples_leaf=2, max_features="sqrt",
            class_weight="balanced_subsample", random_state=42, n_jobs=-1,
        )
    elif name == "extra_trees":
        prep = Pipeline([("impute", SimpleImputer(strategy="median"))])
        model = ExtraTreesClassifier(
            n_estimators=700, min_samples_leaf=2, max_features="sqrt",
            class_weight="balanced", random_state=42, n_jobs=-1,
        )
    else:
        raise ValueError(name)
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", prep, features)], remainder="drop")),
        ("classifier", model),
    ])


def choose_threshold(y: np.ndarray, p: np.ndarray) -> float:
    best = (-1.0, 0.5)
    candidates = np.unique(np.concatenate(([0.05, 0.5, 0.95], p)))
    for threshold in candidates:
        score = float(balanced_accuracy_score(y, (p >= threshold).astype(int)))
        if score > best[0] or (score == best[0] and abs(float(threshold) - 0.5) < abs(best[1] - 0.5)):
            best = (score, float(threshold))
    return best[1]


def safe_auroc(y: np.ndarray, p: np.ndarray) -> float:
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else float("nan")


def summarize(y: np.ndarray, p: np.ndarray, pred: np.ndarray) -> dict:
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "auroc": safe_auroc(y, p),
        "auprc": float(average_precision_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "balancedAccuracy": float(balanced_accuracy_score(y, pred)),
        "sensitivity": float(tp / (tp + fn)) if tp + fn else None,
        "specificity": float(tn / (tn + fp)) if tn + fp else None,
        "confusionMatrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def evaluate_task(df: pd.DataFrame) -> dict:
    exercise_id = int(df["exercise_id"].iloc[0])
    exercise_name = str(df["exercise_name"].iloc[0])
    features = features_for(df)
    groups = df["subject_id"].astype(str).to_numpy()
    y = df["label"].astype(int).to_numpy()
    unique_groups = np.unique(groups)
    if len(unique_groups) < 10 or len(np.unique(y)) < 2 or len(features) < 4:
        return {"exerciseId": exercise_id, "exerciseName": exercise_name, "status": "skipped", "reason": "nested evaluation requires >=10 subjects, two classes, and >=4 features"}

    X = df[features].reset_index(drop=True)
    y = np.asarray(y)
    groups = np.asarray(groups)
    outer = GroupKFold(n_splits=min(5, len(unique_groups)))
    probabilities = np.full(len(df), np.nan, dtype=float)
    predictions = np.full(len(df), -1, dtype=int)
    fold_records = []
    model_names = ["logistic_l2", "random_forest", "extra_trees"]

    for fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups), start=1):
        train_groups = groups[train_idx]
        train_y = y[train_idx]
        train_X = X.iloc[train_idx]
        test_X = X.iloc[test_idx]
        inner_group_count = len(np.unique(train_groups))
        inner = GroupKFold(n_splits=min(4, inner_group_count))

        candidates = []
        for name in model_names:
            pipeline = make_pipeline(name, features)
            inner_p = cross_val_predict(
                pipeline, train_X, train_y, groups=train_groups,
                cv=inner, method="predict_proba",
            )[:, 1]
            threshold = choose_threshold(train_y, inner_p)
            inner_pred = (inner_p >= threshold).astype(int)
            candidates.append({
                "model": name,
                "threshold": threshold,
                "auroc": safe_auroc(train_y, inner_p),
                "balancedAccuracy": float(balanced_accuracy_score(train_y, inner_pred)),
                "brier": float(brier_score_loss(train_y, inner_p)),
            })

        selected = sorted(
            candidates,
            key=lambda row: (row["auroc"], row["balancedAccuracy"], -row["brier"]),
            reverse=True,
        )[0]
        final_model = make_pipeline(selected["model"], features)
        final_model.fit(train_X, train_y)
        test_p = final_model.predict_proba(test_X)[:, 1]
        test_pred = (test_p >= selected["threshold"]).astype(int)
        probabilities[test_idx] = test_p
        predictions[test_idx] = test_pred
        fold_records.append({
            "fold": fold,
            "trainSubjects": int(len(np.unique(train_groups))),
            "testSubjects": int(len(np.unique(groups[test_idx]))),
            "selectedModel": selected["model"],
            "thresholdSelectedInsideTrainingFold": float(selected["threshold"]),
            "innerSelection": candidates,
        })

    if np.isnan(probabilities).any() or (predictions < 0).any():
        raise RuntimeError("Nested evaluation did not produce predictions for every row")

    return {
        "exerciseId": exercise_id,
        "exerciseName": exercise_name,
        "status": "nested-evaluated",
        "nRows": int(len(df)),
        "nSubjects": int(len(unique_groups)),
        "nFeatures": int(len(features)),
        "protocol": "outer participant-grouped CV; model family and threshold selected only within each outer training fold",
        "metrics": summarize(y, probabilities, predictions),
        "outerFolds": fold_records,
        "selectedModelCounts": {
            name: sum(1 for fold in fold_records if fold["selectedModel"] == name)
            for name in model_names
        },
    }


def main(input_csv: Path, output_json: Path) -> None:
    df = pd.read_csv(input_csv)
    required = {"exercise_id", "exercise_name", "subject_id", "label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    results = [evaluate_task(group.copy()) for _, group in df.groupby("exercise_id", sort=True)]
    payload = {
        "schemaVersion": "1.0.0",
        "evaluation": "nested-participant-grouped-model-and-threshold-selection",
        "clinicalClaim": "none",
        "tasks": results,
        "warning": "Nested internal validation reduces model-selection optimism but is still not independent external or webcam-domain clinical validation.",
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
