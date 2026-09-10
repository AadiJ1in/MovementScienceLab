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
from sklearn.metrics import average_precision_score, balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from train_interpretable_model import CANDIDATE_FEATURES, validate_columns


def logistic(features: list[str]) -> Pipeline:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, features)], remainder="drop")),
        ("classifier", LogisticRegression(class_weight="balanced", max_iter=5000, random_state=42)),
    ])


def tree_model(features: list[str], estimator) -> Pipeline:
    numeric = Pipeline([("impute", SimpleImputer(strategy="median"))])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, features)], remainder="drop")),
        ("classifier", estimator),
    ])


def select_threshold(y: np.ndarray, p: np.ndarray) -> float:
    best = (float("-inf"), 0.5)
    for threshold in np.unique(np.concatenate(([0.05, 0.5, 0.95], p))):
        score = balanced_accuracy_score(y, (p >= threshold).astype(int))
        candidate = (float(score) - 1e-6 * abs(float(threshold) - 0.5), float(threshold))
        if candidate[0] > best[0]:
            best = candidate
    return best[1]


def evaluate(name: str, model: Pipeline, X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, cv: GroupKFold) -> dict:
    p = cross_val_predict(model, X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    threshold = select_threshold(y, p)
    pred = (p >= threshold).astype(int)
    return {
        "model": name,
        "auroc": float(roc_auc_score(y, p)),
        "auprc": float(average_precision_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "balancedAccuracy": float(balanced_accuracy_score(y, pred)),
        "threshold": float(threshold),
    }


def main(input_csv: Path, output_json: Path) -> None:
    df = pd.read_csv(input_csv)
    features = validate_columns(df)
    X = df[features]
    y = df["label"].astype(int).to_numpy()
    groups = df["subject_id"].astype(str).to_numpy()
    folds = min(5, len(np.unique(groups)))
    if folds < 3:
        raise ValueError("At least 3 subject groups are required.")
    cv = GroupKFold(n_splits=folds)

    candidates = {
        "logistic_l2": logistic(features),
        "random_forest": tree_model(
            features,
            RandomForestClassifier(
                n_estimators=800,
                min_samples_leaf=2,
                class_weight="balanced_subsample",
                max_features="sqrt",
                random_state=42,
                n_jobs=-1,
            ),
        ),
        "extra_trees": tree_model(
            features,
            ExtraTreesClassifier(
                n_estimators=800,
                min_samples_leaf=2,
                class_weight="balanced",
                max_features="sqrt",
                random_state=42,
                n_jobs=-1,
            ),
        ),
    }

    results = [evaluate(name, model, X, y, groups, cv) for name, model in candidates.items()]
    # Prefer discrimination first, then calibration, then balanced accuracy.
    ranking = sorted(
        results,
        key=lambda r: (r["auroc"], -r["brier"], r["balancedAccuracy"]),
        reverse=True,
    )
    payload = {
        "protocol": "subject-grouped out-of-fold model benchmark",
        "positiveClass": "deviation/non-optimal movement",
        "nRows": int(len(df)),
        "nSubjects": int(df["subject_id"].nunique()),
        "features": features,
        "results": results,
        "recommendedResearchModel": ranking[0]["model"],
        "warning": "Model selection performance is research evidence only. Independent webcam-domain and external-site validation are still required before clinical deployment.",
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
