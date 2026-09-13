#!/usr/bin/env python3
"""Nested, leakage-resistant research benchmark for weekly running-related injury.

Source: Wu et al., npj Digital Medicine (2026), DOI 10.1038/s41746-026-02413-y.
The processed public workbook omits direct participant IDs. To prevent participant-week
leakage, a conservative pseudogroup is derived from invariant genotype + sex + age
fields. This produces 141 groups for the 142-runner cohort; the output is therefore
explicitly an internal fingerprint-grouped research validation, never external or
clinical validation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RANDOM_STATE = 20260913
TARGET = "RRI"
FINGERPRINT_SUFFIXES = ("sex", "Age")
PROMOTION_GATES = {
    "auroc": 0.70,
    "balanced_accuracy": 0.65,
    "sensitivity": 0.60,
    "specificity": 0.60,
    "expected_calibration_error_max": 0.15,
}


def participant_fingerprint(frame: pd.DataFrame) -> pd.Series:
    snps = [column for column in frame.columns if column.lower().startswith("rs")]
    columns = snps + [column for column in FINGERPRINT_SUFFIXES if column in frame.columns]
    if len(snps) < 10:
        raise ValueError("Expected at least 10 invariant SNP columns for conservative grouping.")
    normalized = frame[columns].fillna("<NA>").astype(str)
    return normalized.apply(
        lambda row: hashlib.sha256("|".join(row.tolist()).encode("utf-8")).hexdigest()[:20],
        axis=1,
    )


def build_models() -> dict[str, Pipeline]:
    return {
        "logistic_l2": Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scale", StandardScaler()),
                (
                    "model",
                    LogisticRegression(
                        C=1.0,
                        class_weight="balanced",
                        max_iter=4000,
                        solver="liblinear",
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=350,
                        min_samples_leaf=3,
                        max_features="sqrt",
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "extra_trees": Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "model",
                    ExtraTreesClassifier(
                        n_estimators=350,
                        min_samples_leaf=3,
                        max_features="sqrt",
                        class_weight="balanced",
                        n_jobs=-1,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def group_balanced_weights(groups: np.ndarray) -> np.ndarray:
    unique, counts = np.unique(groups, return_counts=True)
    lookup = dict(zip(unique.tolist(), counts.tolist()))
    weights = np.array([1.0 / lookup[group] for group in groups], dtype=float)
    return weights / weights.mean()


def choose_threshold(y: np.ndarray, probability: np.ndarray, sample_weight: np.ndarray) -> float:
    candidates = np.unique(np.quantile(probability, np.linspace(0.05, 0.95, 181)))
    best = (0.5, -np.inf)
    for threshold in candidates:
        prediction = (probability >= threshold).astype(int)
        score = balanced_accuracy_score(y, prediction, sample_weight=sample_weight)
        if score > best[1]:
            best = (float(threshold), float(score))
    return best[0]


def metric_bundle(
    y: np.ndarray,
    probability: np.ndarray,
    threshold: float,
    sample_weight: np.ndarray | None = None,
) -> dict[str, float]:
    prediction = (probability >= threshold).astype(int)
    cm = confusion_matrix(y, prediction, labels=[0, 1], sample_weight=sample_weight)
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    return {
        "auroc": float(roc_auc_score(y, probability, sample_weight=sample_weight)),
        "auprc": float(average_precision_score(y, probability, sample_weight=sample_weight)),
        "brier": float(brier_score_loss(y, probability, sample_weight=sample_weight)),
        "balanced_accuracy": float(
            balanced_accuracy_score(y, prediction, sample_weight=sample_weight)
        ),
        "sensitivity": float(sensitivity),
        "specificity": float(specificity),
        "threshold": float(threshold),
    }


def calibration_error(
    y: np.ndarray, probability: np.ndarray, sample_weight: np.ndarray, bins: int = 10
) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = float(sample_weight.sum())
    error = 0.0
    for low, high in zip(edges[:-1], edges[1:]):
        mask = (probability >= low) & (probability < high if high < 1 else probability <= high)
        if not mask.any():
            continue
        weights = sample_weight[mask]
        observed = np.average(y[mask], weights=weights)
        predicted = np.average(probability[mask], weights=weights)
        error += weights.sum() / total * abs(observed - predicted)
    return float(error)


def cluster_bootstrap_ci(
    y: np.ndarray,
    probability: np.ndarray,
    groups: np.ndarray,
    threshold: float,
    iterations: int = 400,
) -> dict[str, list[float]]:
    """Participant-cluster bootstrap with each sampled cluster copy treated separately."""
    rng = np.random.default_rng(RANDOM_STATE)
    unique_groups = np.unique(groups)
    samples: dict[str, list[float]] = {key: [] for key in [
        "auroc", "auprc", "brier", "balanced_accuracy", "sensitivity", "specificity"
    ]}
    for _ in range(iterations):
        chosen = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        copied_indices: list[np.ndarray] = []
        copied_group_labels: list[np.ndarray] = []
        for bootstrap_copy, group in enumerate(chosen):
            group_indices = np.flatnonzero(groups == group)
            copied_indices.append(group_indices)
            copied_group_labels.append(
                np.full(len(group_indices), bootstrap_copy, dtype=int)
            )
        indices = np.concatenate(copied_indices)
        bootstrap_groups = np.concatenate(copied_group_labels)
        yy = y[indices]
        if np.unique(yy).size < 2:
            continue
        pp = probability[indices]
        weights = group_balanced_weights(bootstrap_groups)
        metrics = metric_bundle(yy, pp, threshold, weights)
        for key in samples:
            samples[key].append(metrics[key])
    return {
        key: [float(np.quantile(values, 0.025)), float(np.quantile(values, 0.975))]
        for key, values in samples.items()
        if values
    }


def promotion_status(metrics: dict[str, float]) -> dict:
    checks = {
        "auroc": metrics["auroc"] >= PROMOTION_GATES["auroc"],
        "balanced_accuracy": metrics["balanced_accuracy"] >= PROMOTION_GATES["balanced_accuracy"],
        "sensitivity": metrics["sensitivity"] >= PROMOTION_GATES["sensitivity"],
        "specificity": metrics["specificity"] >= PROMOTION_GATES["specificity"],
        "calibration": metrics["expected_calibration_error"] <= PROMOTION_GATES["expected_calibration_error_max"],
    }
    return {
        "research_candidate": all(checks.values()),
        "checks": checks,
        "gates": PROMOTION_GATES,
        "interpretation": (
            "Eligible only for further external research validation. Clinical deployment remains blocked."
            if all(checks.values())
            else "Failed internal prognostic promotion gate; do not expose as an individual injury-risk probability."
        ),
    }


def nested_evaluate(frame: pd.DataFrame) -> dict:
    groups = participant_fingerprint(frame).to_numpy()
    unique_groups = np.unique(groups)
    if not 130 <= len(unique_groups) <= 142:
        raise ValueError(f"Unsafe pseudogroup count: {len(unique_groups)}")

    y = frame[TARGET].astype(int).to_numpy()
    feature_columns = [column for column in frame.columns if column != TARGET]
    X = frame[feature_columns]
    models = build_models()

    outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    oof = np.full(len(frame), np.nan, dtype=float)
    fold_thresholds: list[float] = []
    fold_records: list[dict] = []
    selected_models: list[str] = []

    for outer_fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups), start=1):
        X_train = X.iloc[train_idx]
        y_train = y[train_idx]
        g_train = groups[train_idx]
        inner = StratifiedGroupKFold(
            n_splits=4, shuffle=True, random_state=RANDOM_STATE + outer_fold
        )
        train_weights = group_balanced_weights(g_train)

        candidate_results: dict[str, dict] = {}
        for name, estimator in models.items():
            inner_probability = np.full(len(train_idx), np.nan, dtype=float)
            for inner_train_rel, inner_val_rel in inner.split(X_train, y_train, g_train):
                fitted = clone(estimator)
                fitted.fit(X_train.iloc[inner_train_rel], y_train[inner_train_rel])
                inner_probability[inner_val_rel] = fitted.predict_proba(X_train.iloc[inner_val_rel])[:, 1]
            if np.isnan(inner_probability).any():
                raise RuntimeError(f"Incomplete inner OOF probabilities for {name}")
            candidate_results[name] = {
                "auroc": float(
                    roc_auc_score(y_train, inner_probability, sample_weight=train_weights)
                ),
                "probability": inner_probability,
            }

        selected_name = max(candidate_results, key=lambda name: candidate_results[name]["auroc"])
        selected_models.append(selected_name)
        selected_inner = candidate_results[selected_name]["probability"]
        threshold = choose_threshold(y_train, selected_inner, train_weights)
        fold_thresholds.append(threshold)

        final_model = clone(models[selected_name])
        final_model.fit(X_train, y_train)
        test_probability = final_model.predict_proba(X.iloc[test_idx])[:, 1]
        oof[test_idx] = test_probability
        test_weights = group_balanced_weights(groups[test_idx])
        fold_records.append(
            {
                "fold": outer_fold,
                "selected_model": selected_name,
                "inner_group_weighted_auroc": candidate_results[selected_name]["auroc"],
                "threshold": threshold,
                "test_groups": int(np.unique(groups[test_idx]).size),
                "test_rows": int(len(test_idx)),
                "test_positive_rows": int(y[test_idx].sum()),
                "metrics_group_weighted": metric_bundle(
                    y[test_idx], test_probability, threshold, test_weights
                ),
            }
        )

    if np.isnan(oof).any():
        raise RuntimeError("Incomplete outer OOF predictions")

    global_threshold = float(np.median(fold_thresholds))
    weights = group_balanced_weights(groups)
    sample_metrics = metric_bundle(y, oof, global_threshold)
    group_metrics = metric_bundle(y, oof, global_threshold, weights)
    group_metrics["expected_calibration_error"] = calibration_error(y, oof, weights)
    ci = cluster_bootstrap_ci(y, oof, groups, global_threshold)
    promotion = promotion_status(group_metrics)

    return {
        "validation_design": {
            "name": "nested-stratified-pseudoparticipant-grouped",
            "outer_folds": 5,
            "inner_folds": 4,
            "group_definition": "SHA-256 fingerprint of published invariant SNP + sex + age fields",
            "pseudogroups": int(len(unique_groups)),
            "published_participants": 142,
            "limitation": "Direct participant IDs are absent from the public processed workbook. Fingerprint grouping produced 141 conservative groups and may merge participants; this is not external validation.",
        },
        "prediction_target": "RRI occurrence within a week using information preceding that week",
        "rows": int(len(frame)),
        "positive_rows": int(y.sum()),
        "features": feature_columns,
        "models_considered": list(models),
        "selected_model_by_outer_fold": selected_models,
        "folds": fold_records,
        "aggregate_sample_weighted_by_week": sample_metrics,
        "aggregate_participant_balanced": group_metrics,
        "participant_cluster_bootstrap_95_ci": ci,
        "promotion": promotion,
        "clinical_deployment_blocked": True,
        "blockers": [
            "No independent external validation cohort",
            "Public workbook omits direct participant IDs; validation uses conservative pseudogroups",
            "Running-injury model is not interchangeable with webcam squat biomechanics",
            "Published authors state the models are not ready for clinical application",
            "No randomized trial showing model-derived feedback reduces injuries",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    frame = pd.read_excel(args.workbook, sheet_name=0, engine="openpyxl")
    frame.columns = [str(column).strip() for column in frame.columns]
    if TARGET not in frame.columns:
        raise ValueError("RRI target column not found")
    if len(frame) != 6181 or int(frame[TARGET].sum()) != 564:
        raise ValueError(
            f"Unexpected source dimensions/target count: rows={len(frame)} positives={int(frame[TARGET].sum())}"
        )

    report = nested_evaluate(frame)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps({
        "validation": report["validation_design"],
        "sample_metrics": report["aggregate_sample_weighted_by_week"],
        "participant_balanced_metrics": report["aggregate_participant_balanced"],
        "promotion": report["promotion"],
        "selected_models": report["selected_model_by_outer_fold"],
        "clinical_deployment_blocked": report["clinical_deployment_blocked"],
    }, indent=2))


if __name__ == "__main__":
    main()
