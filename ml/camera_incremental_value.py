from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from prospective_cohort_audit import audit_csv
from prospective_injury_benchmark import (
    FEATURE_DOMAINS,
    GROUP,
    RANDOM_SEED,
    TARGET,
    _valid_group_splits,
    nested_grouped_evaluation,
    validate_dataset,
)

CAMERA_LONGITUDINAL_FEATURES = {
    "sls_knee_change_30d",
    "sls_asymmetry_change_30d",
}
PRIMARY_INCREMENTAL_METRICS = (
    "deltaAuROC",
    "deltaAuPRC",
    "brierImprovement",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scientific_feature_sets(df: pd.DataFrame) -> dict[str, list[str]]:
    """Create pre-specified feature sets for testing camera incremental value.

    The reference model contains every available eligible predictor that does not
    depend on the camera assessment. The expanded model is the exact same set
    plus camera-derived predictors. Camera-derived longitudinal changes are
    treated as camera predictors even though they live in the generic
    longitudinal domain.
    """
    all_features, _ = validate_dataset(df)
    camera_present = [
        feature
        for feature in FEATURE_DOMAINS["camera_biomechanics"]
        if feature in all_features
    ]
    camera_longitudinal = [
        feature for feature in CAMERA_LONGITUDINAL_FEATURES if feature in all_features
    ]
    camera_features = list(dict.fromkeys(camera_present + camera_longitudinal))
    non_camera_features = [
        feature for feature in all_features if feature not in set(camera_features)
    ]

    if not camera_features:
        raise ValueError("At least one camera-derived predictor is required for incremental-value analysis.")
    if not non_camera_features:
        raise ValueError("At least one non-camera predictor is required to define the reference model.")

    history_training = [
        feature
        for domain in ("history", "training_exposure")
        for feature in FEATURE_DOMAINS[domain]
        if feature in all_features
    ]

    return {
        "historyTrainingBaseline": history_training,
        "cameraOnly": camera_features,
        "nonCameraReference": non_camera_features,
        "expandedMultimodal": non_camera_features + camera_features,
    }


def outer_split_fingerprint(
    df: pd.DataFrame,
    features: list[str],
) -> dict[str, Any]:
    y = df[TARGET].astype(int).to_numpy()
    groups = df[GROUP].astype(str).to_numpy()
    splits = _valid_group_splits(df[features], y, groups)
    fold_payload: list[dict[str, Any]] = []
    for fold, (_, test_idx) in enumerate(splits, start=1):
        participants = sorted(np.unique(groups[test_idx]).tolist())
        payload = "|".join(participants).encode("utf-8")
        fold_payload.append(
            {
                "fold": fold,
                "nValidationRows": int(len(test_idx)),
                "nValidationParticipants": int(len(participants)),
                "participantSha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    return {
        "nOuterFolds": len(splits),
        "folds": fold_payload,
        "note": (
            "All compared feature sets use the same target, participant groups, random seed, and deterministic "
            "StratifiedGroupKFold contract. The participant hashes make accidental fold changes auditable."
        ),
    }


def _safe_delta_metrics(
    y: np.ndarray,
    reference_probabilities: np.ndarray,
    expanded_probabilities: np.ndarray,
) -> dict[str, float] | None:
    if len(np.unique(y)) < 2:
        return None
    return {
        "deltaAuROC": float(
            roc_auc_score(y, expanded_probabilities)
            - roc_auc_score(y, reference_probabilities)
        ),
        "deltaAuPRC": float(
            average_precision_score(y, expanded_probabilities)
            - average_precision_score(y, reference_probabilities)
        ),
        # Positive values mean the expanded model has the lower (better) Brier score.
        "brierImprovement": float(
            brier_score_loss(y, reference_probabilities)
            - brier_score_loss(y, expanded_probabilities)
        ),
    }


def paired_cluster_bootstrap_incremental_value(
    y: np.ndarray,
    reference_probabilities: np.ndarray,
    expanded_probabilities: np.ndarray,
    groups: np.ndarray,
    *,
    samples: int = 1000,
    seed: int = RANDOM_SEED,
) -> dict[str, Any]:
    if samples < 100:
        raise ValueError("samples must be at least 100")
    if not (
        len(y)
        == len(reference_probabilities)
        == len(expanded_probabilities)
        == len(groups)
    ):
        raise ValueError("Paired incremental-value arrays must have the same length.")

    point = _safe_delta_metrics(y, reference_probabilities, expanded_probabilities)
    if point is None:
        raise ValueError("Incremental-value analysis requires both outcome classes.")

    unique_groups = np.unique(groups)
    rng = np.random.default_rng(seed)
    collected: dict[str, list[float]] = {
        metric: [] for metric in PRIMARY_INCREMENTAL_METRICS
    }

    for _ in range(samples):
        sampled_groups = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        sampled_indices = np.concatenate(
            [np.flatnonzero(groups == group) for group in sampled_groups]
        )
        sample_report = _safe_delta_metrics(
            y[sampled_indices],
            reference_probabilities[sampled_indices],
            expanded_probabilities[sampled_indices],
        )
        if sample_report is None:
            continue
        for metric, value in sample_report.items():
            collected[metric].append(value)

    intervals: dict[str, dict[str, float | int] | None] = {}
    for metric, values in collected.items():
        if not values:
            intervals[metric] = None
            continue
        intervals[metric] = {
            "lower95": float(np.quantile(values, 0.025)),
            "upper95": float(np.quantile(values, 0.975)),
            "bootstrapSamplesUsed": int(len(values)),
            "fractionExpandedBetter": float(np.mean(np.asarray(values) > 0)),
        }

    return {
        "pointEstimates": point,
        "confidenceIntervals": intervals,
        "bootstrapUnit": "participant",
        "bootstrapSamplesRequested": int(samples),
        "directionConvention": {
            "deltaAuROC": "expanded minus reference; positive favors camera-expanded model",
            "deltaAuPRC": "expanded minus reference; positive favors camera-expanded model",
            "brierImprovement": "reference Brier minus expanded Brier; positive favors camera-expanded model",
        },
    }


def classify_internal_camera_added_value(
    incremental: dict[str, Any],
) -> dict[str, Any]:
    points = incremental["pointEstimates"]
    intervals = incremental["confidenceIntervals"]

    lower_positive = 0
    upper_negative = 0
    for metric in PRIMARY_INCREMENTAL_METRICS:
        interval = intervals.get(metric)
        if not isinstance(interval, dict):
            continue
        if float(interval["lower95"]) > 0:
            lower_positive += 1
        if float(interval["upper95"]) < 0:
            upper_negative += 1

    all_points_nonnegative = all(float(points[metric]) >= 0 for metric in PRIMARY_INCREMENTAL_METRICS)
    all_points_nonpositive = all(float(points[metric]) <= 0 for metric in PRIMARY_INCREMENTAL_METRICS)

    if lower_positive >= 2 and all_points_nonnegative and upper_negative == 0:
        status = "internal-evidence-supported"
    elif upper_negative >= 2 and all_points_nonpositive and lower_positive == 0:
        status = "internal-evidence-against"
    elif lower_positive > 0 and upper_negative > 0:
        status = "mixed"
    else:
        status = "inconclusive"

    return {
        "status": status,
        "metricsWith95IntervalAboveZero": int(lower_positive),
        "metricsWith95IntervalBelowZero": int(upper_negative),
        "allPrimaryPointEstimatesNonnegative": bool(all_points_nonnegative),
        "allPrimaryPointEstimatesNonpositive": bool(all_points_nonpositive),
        "interpretation": (
            "This is an internal research classification of incremental predictive information, not evidence of "
            "clinical utility, causality, treatment benefit, or permission to display an individual injury probability."
        ),
    }


def _serializable_model_report(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "metrics": result["metrics"],
        "foldReports": result["folds"],
        "selectedModelFrequency": result["selectedModelFrequency"],
        "nOuterFolds": result["nOuterFolds"],
    }


def evaluate_camera_incremental_value(
    df: pd.DataFrame,
    *,
    bootstrap_samples: int = 1000,
) -> dict[str, Any]:
    feature_sets = scientific_feature_sets(df)
    y = df[TARGET].astype(int).to_numpy()
    groups = df[GROUP].astype(str).to_numpy()

    evaluations: dict[str, dict[str, Any]] = {}
    raw_results: dict[str, dict[str, Any]] = {}
    for name in ("nonCameraReference", "expandedMultimodal", "cameraOnly"):
        features = feature_sets[name]
        result = nested_grouped_evaluation(df[features], y, groups, features)
        raw_results[name] = result
        evaluations[name] = _serializable_model_report(result)

    if feature_sets["historyTrainingBaseline"]:
        features = feature_sets["historyTrainingBaseline"]
        result = nested_grouped_evaluation(df[features], y, groups, features)
        raw_results["historyTrainingBaseline"] = result
        evaluations["historyTrainingBaseline"] = _serializable_model_report(result)

    reference = raw_results["nonCameraReference"]
    expanded = raw_results["expandedMultimodal"]
    if reference["nOuterFolds"] != expanded["nOuterFolds"]:
        raise RuntimeError("Reference and expanded models did not use the same number of outer folds.")

    incremental = paired_cluster_bootstrap_incremental_value(
        y,
        np.asarray(reference["probabilities"], dtype=float),
        np.asarray(expanded["probabilities"], dtype=float),
        groups,
        samples=bootstrap_samples,
    )
    conclusion = classify_internal_camera_added_value(incremental)

    return {
        "schemaVersion": "1.0.0",
        "reportType": "paired-camera-incremental-value-internal-evaluation",
        "validationClaim": "internal-incremental-value-only",
        "externalValidation": False,
        "featureSets": feature_sets,
        "outerSplitAudit": outer_split_fingerprint(df, feature_sets["expandedMultimodal"]),
        "modelEvaluations": evaluations,
        "pairedIncrementalValue": incremental,
        "cameraAddedValueConclusion": conclusion,
        "scientificRules": {
            "sameParticipantsCompared": True,
            "sameOutcomeAndPredictionHorizonRequired": True,
            "participantGroupedOuterEvaluation": True,
            "modelFamilyCalibrationAndThresholdSelectedInsideOuterTrainingOnly": True,
            "incrementalUncertaintyClusteredByParticipant": True,
            "cameraOnlyPerformanceNotTreatedAsIncrementalValue": True,
            "nriUsed": False,
            "reasonNriNotPrimary": (
                "The analysis prioritizes paired changes in AUROC, AUPRC, and a proper scoring rule (Brier score) "
                "instead of relying on reclassification statistics alone."
            ),
        },
        "productGate": {
            "eligibleForUserFacingInjuryProbability": False,
            "cameraAddedValueAloneEnablesClinicalUse": False,
        },
    }


def run_incremental_value_report(
    input_csv: Path,
    output_json: Path,
    *,
    horizon_days: int,
    allow_overlapping_windows: bool,
    bootstrap_samples: int,
) -> dict[str, Any]:
    cohort_audit = audit_csv(
        input_csv,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    if not cohort_audit["passed"]:
        raise ValueError("Prospective cohort audit failed: " + "; ".join(cohort_audit["errors"]))

    df = pd.read_csv(input_csv)
    report = evaluate_camera_incremental_value(
        df,
        bootstrap_samples=bootstrap_samples,
    )
    report["cohortAudit"] = cohort_audit
    report["provenance"] = {
        "inputSha256": _sha256(input_csv),
        "randomSeed": RANDOM_SEED,
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Test whether camera-derived biomechanics add predictive information beyond an otherwise identical "
            "non-camera prospective injury model."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--allow-overlapping-windows", action="store_true")
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    args = parser.parse_args()

    run_incremental_value_report(
        args.input_csv,
        args.output_json,
        horizon_days=args.horizon_days,
        allow_overlapping_windows=args.allow_overlapping_windows,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
