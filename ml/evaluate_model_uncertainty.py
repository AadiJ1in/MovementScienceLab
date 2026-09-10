from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict

from train_multiexercise_models import NON_FEATURE_COLUMNS, pipeline, threshold_for


BOOTSTRAP_REPLICATES = 1000
RNG_SEED = 20260910


def percentile_interval(values: list[float]) -> dict[str, float] | None:
    finite = np.asarray([value for value in values if np.isfinite(value)], dtype=float)
    if not len(finite):
        return None
    low, median, high = np.quantile(finite, [0.025, 0.5, 0.975])
    return {"low": float(low), "median": float(median), "high": float(high)}


def clustered_bootstrap(
    y: np.ndarray,
    probability: np.ndarray,
    groups: np.ndarray,
    threshold: float,
) -> dict[str, object]:
    rng = np.random.default_rng(RNG_SEED)
    subjects = np.unique(groups)
    aurocs: list[float] = []
    balanced: list[float] = []
    sensitivity: list[float] = []
    specificity: list[float] = []

    group_indices = {subject: np.flatnonzero(groups == subject) for subject in subjects}

    for _ in range(BOOTSTRAP_REPLICATES):
        sampled_subjects = rng.choice(subjects, size=len(subjects), replace=True)
        indices = np.concatenate([group_indices[subject] for subject in sampled_subjects])
        y_boot = y[indices]
        p_boot = probability[indices]
        pred_boot = (p_boot >= threshold).astype(int)

        if len(np.unique(y_boot)) == 2:
            aurocs.append(float(roc_auc_score(y_boot, p_boot)))

        balanced.append(float(balanced_accuracy_score(y_boot, pred_boot)))

        positives = y_boot == 1
        negatives = y_boot == 0
        if positives.any():
            sensitivity.append(float(np.mean(pred_boot[positives] == 1)))
        if negatives.any():
            specificity.append(float(np.mean(pred_boot[negatives] == 0)))

    return {
        "method": "subject-cluster bootstrap",
        "replicates": BOOTSTRAP_REPLICATES,
        "seed": RNG_SEED,
        "auroc95CI": percentile_interval(aurocs),
        "balancedAccuracy95CI": percentile_interval(balanced),
        "sensitivity95CI": percentile_interval(sensitivity),
        "specificity95CI": percentile_interval(specificity),
    }


def reliability_bins(y: np.ndarray, p: np.ndarray, bins: int = 5) -> list[dict[str, object]]:
    edges = np.linspace(0.0, 1.0, bins + 1)
    output: list[dict[str, object]] = []
    for index in range(bins):
        low = edges[index]
        high = edges[index + 1]
        if index == bins - 1:
            mask = (p >= low) & (p <= high)
        else:
            mask = (p >= low) & (p < high)
        if not mask.any():
            continue
        output.append(
            {
                "range": [float(low), float(high)],
                "n": int(mask.sum()),
                "meanPredicted": float(np.mean(p[mask])),
                "observedDeviationRate": float(np.mean(y[mask])),
            }
        )
    return output


def evaluate_exercise(df: pd.DataFrame) -> dict[str, object]:
    exercise_name = str(df["exercise_name"].iloc[0])
    groups = df["subject_id"].astype(str).to_numpy()
    y = df["label"].astype(int).to_numpy()
    n_subjects = len(np.unique(groups))

    features = [
        column
        for column in df.columns
        if column not in NON_FEATURE_COLUMNS
        and pd.api.types.is_numeric_dtype(df[column])
        and df[column].notna().any()
    ]

    if len(np.unique(y)) < 2 or n_subjects < 3 or len(features) < 4:
        return {
            "exercise": exercise_name,
            "status": "skipped",
            "reason": "insufficient classes, subjects, or numeric features",
        }

    X = df[features]
    cv = GroupKFold(n_splits=min(5, n_subjects))
    probabilities = cross_val_predict(
        pipeline(features),
        X,
        y,
        groups=groups,
        cv=cv,
        method="predict_proba",
    )[:, 1]
    threshold = threshold_for(y, probabilities)

    return {
        "exercise": exercise_name,
        "status": "evaluated",
        "nSubjects": int(n_subjects),
        "nRepetitions": int(len(df)),
        "threshold": float(threshold),
        "uncertainty": clustered_bootstrap(y, probabilities, groups, threshold),
        "calibration": {
            "type": "out-of-fold reliability summary",
            "bins": reliability_bins(y, probabilities),
            "warning": "Small subject counts make calibration estimates unstable; these bins are descriptive research diagnostics only.",
        },
    }


def evaluate_file(input_csv: Path, representation: str) -> dict[str, object]:
    df = pd.read_csv(input_csv)
    required = {"exercise_name", "subject_id", "label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {input_csv}: {sorted(missing)}")

    return {
        "representation": representation,
        "exercises": [
            evaluate_exercise(group.copy())
            for _, group in df.groupby("exercise_id", sort=True)
        ],
    }


def main(static_csv: Path, temporal_csv: Path, output_json: Path) -> None:
    payload = {
        "schemaVersion": "1.0.0",
        "purpose": "Quantify uncertainty around subject-grouped research validation metrics",
        "bootstrapUnit": "subject",
        "warning": "Confidence intervals from very small research cohorts do not establish clinical validity and must not be interpreted as patient-level injury-risk uncertainty.",
        "representations": [
            evaluate_file(static_csv, "static-summary"),
            evaluate_file(temporal_csv, "phase-normalized-temporal"),
        ],
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("static_csv", type=Path)
    parser.add_argument("temporal_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    main(args.static_csv, args.temporal_csv, args.output_json)
