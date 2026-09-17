from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
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
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

TARGET = "injury_within_horizon"
GROUP = "participant_id"
RANDOM_SEED = 42
MIN_PARTICIPANTS = 20
MIN_DOMAINS = 3
OPTIONAL_SUBGROUP_COLUMNS = ("sex", "age_group", "sport", "site_id")

FEATURE_DOMAINS: dict[str, tuple[str, ...]] = {
    "history": (
        "previous_injury_count",
        "days_since_last_injury",
    ),
    "symptoms_readiness": (
        "pain_score",
        "soreness_score",
        "sleep_quality_score",
        "readiness_score",
    ),
    "training_exposure": (
        "training_minutes_7d",
        "training_minutes_28d",
        "session_rpe_load_7d",
        "session_rpe_load_28d",
        "high_speed_distance_7d",
        "high_speed_distance_28d",
    ),
    "strength_balance": (
        "y_balance_asymmetry_cm",
        "knee_extensor_strength_norm",
        "hip_abductor_strength_norm",
    ),
    "camera_biomechanics": (
        "left_sls_stable_knee_deg",
        "right_sls_stable_knee_deg",
        "sls_knee_asymmetry_deg",
        "left_sls_robust_peak_knee_deg",
        "right_sls_robust_peak_knee_deg",
        "sls_rep_variability_deg",
        "sls_robust_trunk_lean_deg",
        "camera_knee_flexion_asymmetry_deg",
        "camera_peak_knee_frontal_deviation_deg",
        "camera_peak_trunk_lean_deg",
        "camera_peak_pelvic_obliquity_deg",
        "camera_rep_excursion_variability_deg",
        "camera_rep_duration_cv_pct",
        "mean_pose_confidence",
    ),
    "longitudinal_change": (
        "sls_knee_change_30d",
        "sls_asymmetry_change_30d",
        "training_minutes_change_28d",
        "pain_change_14d",
    ),
}


def available_features(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    features: list[str] = []
    domains: list[str] = []
    for domain, candidates in FEATURE_DOMAINS.items():
        present = [column for column in candidates if column in df.columns]
        if present:
            domains.append(domain)
            features.extend(present)
    return features, domains


def validate_dataset(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    missing = sorted({TARGET, GROUP} - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    if df[GROUP].isna().any():
        raise ValueError("participant_id cannot be missing.")
    if df[TARGET].isna().any():
        raise ValueError(f"{TARGET} cannot be missing.")

    labels = set(df[TARGET].astype(int).unique().tolist())
    if labels != {0, 1}:
        raise ValueError(f"{TARGET} must contain both 0 and 1.")

    participant_outcomes = df.groupby(GROUP, dropna=False)[TARGET].max().astype(int)
    if len(participant_outcomes) < MIN_PARTICIPANTS:
        raise ValueError(
            f"At least {MIN_PARTICIPANTS} distinct participants are required; got {len(participant_outcomes)}."
        )
    positive_participants = int(participant_outcomes.sum())
    negative_participants = int((participant_outcomes == 0).sum())
    if positive_participants < 3 or negative_participants < 3:
        raise ValueError(
            "At least 3 participants with and 3 without the outcome are required for grouped validation."
        )

    features, domains = available_features(df)
    if len(domains) < MIN_DOMAINS:
        raise ValueError(
            f"At least {MIN_DOMAINS} predictor domains are required. Present: {', '.join(domains) or 'none'}."
        )
    if "camera_biomechanics" not in domains:
        raise ValueError(
            "At least one camera_biomechanics feature is required to validate the application's assessment domain."
        )
    return features, domains


def numeric_preprocessor(features: list[str], *, scale: bool) -> ColumnTransformer:
    steps: list[tuple[str, Any]] = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        steps.append(("scale", StandardScaler()))
    return ColumnTransformer(
        [("numeric", Pipeline(steps=steps), features)],
        remainder="drop",
    )


def candidate_models(features: list[str]) -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline(
            [
                ("preprocess", numeric_preprocessor(features, scale=True)),
                (
                    "classifier",
                    LogisticRegression(
                        penalty="l2",
                        class_weight="balanced",
                        max_iter=5000,
                        random_state=RANDOM_SEED,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("preprocess", numeric_preprocessor(features, scale=False)),
                (
                    "classifier",
                    RandomForestClassifier(
                        n_estimators=500,
                        min_samples_leaf=5,
                        max_features="sqrt",
                        class_weight="balanced_subsample",
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
        "extra_trees": Pipeline(
            [
                ("preprocess", numeric_preprocessor(features, scale=False)),
                (
                    "classifier",
                    ExtraTreesClassifier(
                        n_estimators=500,
                        min_samples_leaf=5,
                        max_features="sqrt",
                        class_weight="balanced",
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
    }


def _logit(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    return np.log(clipped / (1 - clipped)).reshape(-1, 1)


def fit_calibrator(probabilities: np.ndarray, y: np.ndarray) -> LogisticRegression:
    calibrator = LogisticRegression(max_iter=2000, random_state=RANDOM_SEED)
    calibrator.fit(_logit(probabilities), y)
    return calibrator


def apply_calibrator(calibrator: LogisticRegression, probabilities: np.ndarray) -> np.ndarray:
    return calibrator.predict_proba(_logit(probabilities))[:, 1]


def choose_threshold(y: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.unique(np.quantile(probabilities, np.linspace(0.05, 0.95, 91)))
    if candidates.size == 0:
        return 0.5
    best_threshold = 0.5
    best_score = -1.0
    for threshold in candidates:
        score = balanced_accuracy_score(y, (probabilities >= threshold).astype(int))
        if score > best_score:
            best_score = float(score)
            best_threshold = float(threshold)
    return best_threshold


def expected_calibration_error(y: np.ndarray, probabilities: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(y)
    ece = 0.0
    for index in range(bins):
        left, right = edges[index], edges[index + 1]
        mask = (probabilities >= left) & (probabilities < right if index < bins - 1 else probabilities <= right)
        if not np.any(mask):
            continue
        observed = float(np.mean(y[mask]))
        predicted = float(np.mean(probabilities[mask]))
        ece += (float(mask.sum()) / total) * abs(observed - predicted)
    return float(ece)


def calibration_intercept_slope(y: np.ndarray, probabilities: np.ndarray) -> tuple[float | None, float | None]:
    if len(np.unique(y)) < 2:
        return None, None
    regression = LogisticRegression(penalty=None, max_iter=2000, random_state=RANDOM_SEED)
    regression.fit(_logit(probabilities), y)
    return float(regression.intercept_[0]), float(regression.coef_[0][0])


def metrics(
    y: np.ndarray,
    probabilities: np.ndarray,
    *,
    threshold: float | None = None,
    predictions: np.ndarray | None = None,
) -> dict[str, object]:
    if predictions is None:
        if threshold is None:
            raise ValueError("threshold is required when predictions are not supplied")
        predictions = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predictions, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    prevalence = float(np.mean(y))
    auprc = float(average_precision_score(y, probabilities))
    brier = float(brier_score_loss(y, probabilities))
    baseline_brier = prevalence * (1 - prevalence)
    intercept, slope = calibration_intercept_slope(y, probabilities)
    return {
        "auroc": float(roc_auc_score(y, probabilities)),
        "auprc": auprc,
        "prevalence": prevalence,
        "auprcLiftOverPrevalence": None if prevalence == 0 else auprc / prevalence,
        "brier": brier,
        "prevalenceOnlyBrier": baseline_brier,
        "brierSkill": None if baseline_brier == 0 else 1 - (brier / baseline_brier),
        "sensitivity": float(sensitivity),
        "specificity": float(specificity),
        "balancedAccuracy": float(balanced_accuracy_score(y, predictions)),
        "threshold": None if threshold is None else float(threshold),
        "meanPredictedRisk": float(np.mean(probabilities)),
        "calibrationIntercept": intercept,
        "calibrationSlope": slope,
        "expectedCalibrationError": expected_calibration_error(y, probabilities),
        "confusionMatrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def _valid_group_splits(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    *,
    preferred_splits: int = 5,
) -> list[tuple[np.ndarray, np.ndarray]]:
    unique_groups = len(np.unique(groups))
    for n_splits in range(min(preferred_splits, unique_groups), 2, -1):
        cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
        splits = list(cv.split(X, y, groups))
        if all(len(np.unique(y[train])) == 2 and len(np.unique(y[test])) == 2 for train, test in splits):
            return splits
    raise ValueError(
        "Could not construct at least 3 participant-grouped folds containing both outcome classes in train and validation."
    )


def _inner_model_selection(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    features: list[str],
) -> dict[str, object]:
    splits = _valid_group_splits(X, y, groups)
    results: dict[str, dict[str, object]] = {}

    for name, model in candidate_models(features).items():
        raw = cross_val_predict(
            model,
            X,
            y,
            groups=groups,
            cv=splits,
            method="predict_proba",
            n_jobs=1,
        )[:, 1]
        calibrator = fit_calibrator(raw, y)
        calibrated = apply_calibrator(calibrator, raw)
        threshold = choose_threshold(y, calibrated)
        model_metrics = metrics(y, calibrated, threshold=threshold)
        results[name] = {
            "metrics": model_metrics,
            "calibrator": calibrator,
            "threshold": threshold,
        }

    champion_name = max(
        results,
        key=lambda name: (
            float(results[name]["metrics"]["auroc"]),
            float(results[name]["metrics"]["auprc"]),
            float(results[name]["metrics"]["brierSkill"] or -1),
        ),
    )
    return {
        "name": champion_name,
        "threshold": float(results[champion_name]["threshold"]),
        "calibrator": results[champion_name]["calibrator"],
        "candidates": {name: value["metrics"] for name, value in results.items()},
    }


def nested_grouped_evaluation(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    features: list[str],
) -> dict[str, object]:
    outer_splits = _valid_group_splits(X, y, groups)
    probabilities = np.full(len(y), np.nan, dtype=float)
    predictions = np.full(len(y), -1, dtype=int)
    thresholds = np.full(len(y), np.nan, dtype=float)
    fold_reports: list[dict[str, object]] = []
    selected_models: list[str] = []

    for fold_index, (train_idx, test_idx) in enumerate(outer_splits, start=1):
        inner = _inner_model_selection(
            X.iloc[train_idx],
            y[train_idx],
            groups[train_idx],
            features,
        )
        selected_name = str(inner["name"])
        selected_models.append(selected_name)
        model = candidate_models(features)[selected_name]
        model.fit(X.iloc[train_idx], y[train_idx])
        raw_test = model.predict_proba(X.iloc[test_idx])[:, 1]
        calibrated_test = apply_calibrator(inner["calibrator"], raw_test)
        threshold = float(inner["threshold"])
        fold_predictions = (calibrated_test >= threshold).astype(int)

        probabilities[test_idx] = calibrated_test
        predictions[test_idx] = fold_predictions
        thresholds[test_idx] = threshold
        fold_reports.append(
            {
                "fold": fold_index,
                "nTrainRows": int(len(train_idx)),
                "nValidationRows": int(len(test_idx)),
                "nTrainParticipants": int(len(np.unique(groups[train_idx]))),
                "nValidationParticipants": int(len(np.unique(groups[test_idx]))),
                "selectedModel": selected_name,
                "thresholdSelectedInsideOuterTraining": threshold,
                "validationMetrics": metrics(
                    y[test_idx],
                    calibrated_test,
                    predictions=fold_predictions,
                ),
            }
        )

    if np.isnan(probabilities).any() or np.any(predictions < 0):
        raise RuntimeError("Nested grouped evaluation did not produce predictions for every row.")

    overall = metrics(y, probabilities, predictions=predictions)
    overall["threshold"] = float(np.median(thresholds))
    return {
        "probabilities": probabilities,
        "predictions": predictions,
        "metrics": overall,
        "folds": fold_reports,
        "selectedModelFrequency": dict(Counter(selected_models)),
        "nOuterFolds": len(outer_splits),
    }


def _bootstrap_metric_sample(
    y: np.ndarray,
    probabilities: np.ndarray,
    predictions: np.ndarray,
) -> dict[str, float] | None:
    if len(np.unique(y)) < 2:
        return None
    report = metrics(y, probabilities, predictions=predictions)
    return {
        key: float(report[key])
        for key in ("auroc", "auprc", "brier", "sensitivity", "specificity", "balancedAccuracy")
    }


def cluster_bootstrap_intervals(
    y: np.ndarray,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    groups: np.ndarray,
    *,
    samples: int,
) -> dict[str, dict[str, float | int] | None]:
    unique_groups = np.unique(groups)
    rng = np.random.default_rng(RANDOM_SEED)
    collected: dict[str, list[float]] = {
        key: [] for key in ("auroc", "auprc", "brier", "sensitivity", "specificity", "balancedAccuracy")
    }

    for _ in range(samples):
        sampled_groups = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        sampled_indices = np.concatenate([np.flatnonzero(groups == group) for group in sampled_groups])
        report = _bootstrap_metric_sample(
            y[sampled_indices],
            probabilities[sampled_indices],
            predictions[sampled_indices],
        )
        if report is None:
            continue
        for key, value in report.items():
            collected[key].append(value)

    intervals: dict[str, dict[str, float | int] | None] = {}
    for key, values in collected.items():
        if not values:
            intervals[key] = None
            continue
        intervals[key] = {
            "lower95": float(np.quantile(values, 0.025)),
            "upper95": float(np.quantile(values, 0.975)),
            "bootstrapSamplesUsed": int(len(values)),
        }
    return intervals


def subgroup_audit(
    df: pd.DataFrame,
    y: np.ndarray,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    groups: np.ndarray,
) -> dict[str, object]:
    report: dict[str, object] = {}
    for column in OPTIONAL_SUBGROUP_COLUMNS:
        if column not in df.columns:
            continue
        column_report: dict[str, object] = {}
        values = df[column].astype("string").fillna("missing")
        for value in sorted(values.unique().tolist()):
            mask = (values == value).to_numpy()
            n_rows = int(mask.sum())
            n_participants = int(len(np.unique(groups[mask])))
            if n_rows < 20 or n_participants < 10:
                column_report[str(value)] = {
                    "status": "insufficient-sample",
                    "nRows": n_rows,
                    "nParticipants": n_participants,
                }
                continue
            if len(np.unique(y[mask])) < 2:
                column_report[str(value)] = {
                    "status": "single-outcome-class",
                    "nRows": n_rows,
                    "nParticipants": n_participants,
                }
                continue
            subgroup_metrics = metrics(
                y[mask],
                probabilities[mask],
                predictions=predictions[mask],
            )
            subgroup_metrics.pop("threshold", None)
            column_report[str(value)] = {
                "status": "reported",
                "nRows": n_rows,
                "nParticipants": n_participants,
                "metrics": subgroup_metrics,
            }
        report[column] = column_report
    return report


def missingness_report(df: pd.DataFrame, features: list[str]) -> dict[str, object]:
    missingness = {feature: float(df[feature].isna().mean()) for feature in features}
    warnings = [feature for feature, rate in missingness.items() if rate > 0.5]
    return {
        "fractionMissingByFeature": missingness,
        "featuresOver50PercentMissing": warnings,
    }


def internal_gate(result: dict[str, object], intervals: dict[str, object]) -> dict[str, object]:
    auroc_interval = intervals.get("auroc")
    auroc_lower = (
        float(auroc_interval["lower95"])
        if isinstance(auroc_interval, dict) and "lower95" in auroc_interval
        else -1.0
    )
    minimums = {
        "auroc": 0.70,
        "aurocLower95": 0.60,
        "auprcLiftOverPrevalence": 1.25,
        "sensitivity": 0.70,
        "specificity": 0.60,
        "brierSkillGreaterThan": 0.0,
    }
    checks = {
        "auroc": float(result["auroc"]) >= minimums["auroc"],
        "aurocLower95": auroc_lower >= minimums["aurocLower95"],
        "auprcLiftOverPrevalence": float(result["auprcLiftOverPrevalence"] or 0)
        >= minimums["auprcLiftOverPrevalence"],
        "sensitivity": float(result["sensitivity"]) >= minimums["sensitivity"],
        "specificity": float(result["specificity"]) >= minimums["specificity"],
        "brierSkill": float(result["brierSkill"] or -1) > minimums["brierSkillGreaterThan"],
    }
    return {
        "minimums": minimums,
        "checks": checks,
        "passed": all(checks.values()),
        "note": "Internal research engineering guardrail only; not a clinical efficacy standard.",
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _final_research_model(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    features: list[str],
) -> tuple[str, Pipeline, LogisticRegression, float, dict[str, object]]:
    selection = _inner_model_selection(X, y, groups, features)
    name = str(selection["name"])
    model = candidate_models(features)[name]
    model.fit(X, y)
    return (
        name,
        model,
        selection["calibrator"],
        float(selection["threshold"]),
        selection["candidates"],
    )


def _final_portable_logistic(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    features: list[str],
) -> tuple[Pipeline, LogisticRegression, float, dict[str, object]]:
    """Fit the transparent browser-deployable research candidate.

    The portable candidate is always logistic regression so its exact fitted
    preprocessing and coefficients can be exported to TypeScript/JSON. Its
    grouped out-of-fold metrics are reported separately from the nested champion
    model and are never substituted for the nested benchmark performance.
    """
    model = candidate_models(features)["logistic_regression"]
    splits = _valid_group_splits(X, y, groups)
    raw = cross_val_predict(
        model,
        X,
        y,
        groups=groups,
        cv=splits,
        method="predict_proba",
        n_jobs=1,
    )[:, 1]
    calibrator = fit_calibrator(raw, y)
    calibrated = apply_calibrator(calibrator, raw)
    threshold = choose_threshold(y, calibrated)
    development_metrics = metrics(y, calibrated, threshold=threshold)
    model.fit(X, y)
    return model, calibrator, threshold, development_metrics


def benchmark(
    input_csv: Path,
    output_json: Path,
    output_model: Path,
    *,
    horizon_days: int,
    population: str,
    index_time_definition: str,
    camera_measurement_version: str,
    feature_timing_audited: bool,
    bootstrap_samples: int,
) -> None:
    if horizon_days <= 0:
        raise ValueError("horizon_days must be positive")
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")

    df = pd.read_csv(input_csv)
    features, domains = validate_dataset(df)
    X = df[features]
    y = df[TARGET].astype(int).to_numpy()
    groups = df[GROUP].astype(str).to_numpy()

    nested = nested_grouped_evaluation(X, y, groups, features)
    intervals = cluster_bootstrap_intervals(
        y,
        nested["probabilities"],
        nested["predictions"],
        groups,
        samples=bootstrap_samples,
    )
    subgroup_report = subgroup_audit(
        df,
        y,
        nested["probabilities"],
        nested["predictions"],
        groups,
    )
    champion_name, final_model, final_calibrator, final_threshold, final_candidates = _final_research_model(
        X, y, groups, features
    )
    portable_model, portable_calibrator, portable_threshold, portable_metrics = _final_portable_logistic(
        X, y, groups, features
    )

    participant_outcomes = df.groupby(GROUP)[TARGET].max().astype(int)
    n_positive_participants = int(participant_outcomes.sum())
    output_model.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": final_model,
            "calibrator": final_calibrator,
            "threshold": final_threshold,
            "portableLogisticModel": portable_model,
            "portableLogisticCalibrator": portable_calibrator,
            "portableLogisticThreshold": portable_threshold,
            "portableLogisticDevelopmentMetrics": portable_metrics,
            "features": features,
            "target": TARGET,
            "participantGroupColumn": GROUP,
            "cameraMeasurementVersion": camera_measurement_version,
            "researchOnly": True,
            "eligibleForUserFacingInjuryProbability": False,
        },
        output_model,
    )

    validation_metrics = dict(nested["metrics"])
    artifact = {
        "schemaVersion": "2.0.0",
        "modelType": "prospective-injury-risk-research",
        "clinicalClaim": "research-risk-estimation-only",
        "outcome": {
            "label": TARGET,
            "horizonDays": int(horizon_days),
            "indexTimeDefinition": index_time_definition,
        },
        "population": population,
        "features": features,
        "featureDomains": domains,
        "cameraMeasurementVersion": camera_measurement_version,
        "finalResearchModel": {
            "modelFamily": champion_name,
            "threshold": final_threshold,
            "candidateDevelopmentMetrics": final_candidates,
            "note": "Fitted on all available data only after nested evaluation. Not used to claim internal test performance.",
        },
        "portableResearchModel": {
            "modelFamily": "logistic_regression",
            "threshold": portable_threshold,
            "groupedDevelopmentMetrics": portable_metrics,
            "browserExportSupported": True,
            "note": (
                "Transparent secondary logistic candidate fitted for browser export. "
                "Its grouped development metrics are not a replacement for the nested champion evaluation."
            ),
        },
        "validation": {
            "splitUnit": "participant",
            "method": (
                f"{nested['nOuterFolds']}-fold nested stratified participant-grouped evaluation; "
                "model family, Platt calibration, and threshold selected only inside each outer training fold"
            ),
            "nestedEvaluation": True,
            "nParticipants": int(len(np.unique(groups))),
            "nRows": int(len(df)),
            "nParticipantsWithPositiveOutcome": n_positive_participants,
            "metrics": validation_metrics,
            "confidenceIntervals": intervals,
            "confidenceIntervalsReported": True,
            "subgroupAuditReported": True,
            "subgroupMetadataAvailable": bool(subgroup_report),
            "subgroupAudit": subgroup_report,
            "foldReports": nested["folds"],
            "selectedModelFrequency": nested["selectedModelFrequency"],
            "featureTimingAudited": bool(feature_timing_audited),
            "externalValidated": False,
            "externalCohort": None,
            "cameraDomainValidated": False,
            "calibrationReported": True,
        },
        "dataQuality": missingness_report(df, features),
        "deploymentGate": {
            "internalEngineeringGate": internal_gate(validation_metrics, intervals),
            "requiresIndependentExternalCohort": True,
            "requiresSameCameraPoseDomainValidation": True,
            "requiresClinicalGovernanceReview": True,
            "eligibleForUserFacingInjuryProbability": False,
        },
        "leakageControls": {
            "participantGroupedOuterSplits": True,
            "modelSelectionInsideOuterTrainingOnly": True,
            "calibrationInsideOuterTrainingOnly": True,
            "thresholdSelectionInsideOuterTrainingOnly": True,
            "featureTimingAuditRequiredForReadiness": True,
        },
        "reportingAlignment": {
            "TRIPODplusAI": "engineering intent; not a formal compliance assessment",
            "PROBASTplusAI": "engineering intent; not a formal risk-of-bias assessment",
        },
        "provenance": {
            "inputSha256": _sha256(input_csv),
            "randomSeed": RANDOM_SEED,
            "numpyVersion": np.__version__,
            "pandasVersion": pd.__version__,
            "scikitLearnVersion": sklearn.__version__,
        },
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(artifact, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Nested, participant-grouped research benchmark for prospectively labeled injury outcomes."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--population", required=True)
    parser.add_argument("--index-time-definition", required=True)
    parser.add_argument("--camera-measurement-version", required=True)
    parser.add_argument(
        "--feature-timing-audited",
        action="store_true",
        help="Assert that every predictor was verified to exist before each prediction index time.",
    )
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    benchmark(
        args.input_csv,
        args.output_json,
        args.output_model,
        horizon_days=args.horizon_days,
        population=args.population,
        index_time_definition=args.index_time_definition,
        camera_measurement_version=args.camera_measurement_version,
        feature_timing_audited=args.feature_timing_audited,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
