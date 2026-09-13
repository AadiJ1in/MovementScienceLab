from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
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
        "mean_pose_confidence",
    ),
    "longitudinal_change": (
        "sls_knee_change_30d",
        "sls_asymmetry_change_30d",
        "training_minutes_change_28d",
        "pain_change_14d",
    ),
}

MIN_PARTICIPANTS = 20
MIN_DOMAINS = 3


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

    labels = set(df[TARGET].dropna().astype(int).unique().tolist())
    if labels != {0, 1}:
        raise ValueError(f"{TARGET} must contain both 0 and 1.")

    n_participants = int(df[GROUP].astype(str).nunique())
    if n_participants < MIN_PARTICIPANTS:
        raise ValueError(
            f"At least {MIN_PARTICIPANTS} distinct participants are required for this research benchmark; got {n_participants}."
        )

    features, domains = available_features(df)
    if len(domains) < MIN_DOMAINS:
        raise ValueError(
            f"At least {MIN_DOMAINS} predictor domains are required. Present domains: {', '.join(domains) or 'none'}."
        )
    if "camera_biomechanics" not in domains:
        raise ValueError(
            "At least one camera_biomechanics feature is required because this benchmark is intended to validate the application's assessment data."
        )

    # Group splitting prevents repeated observations from one person from
    # appearing in both training and validation folds. Feature engineering must
    # separately guarantee every predictor is available before the index time.
    if df[GROUP].isna().any():
        raise ValueError("participant_id cannot be missing.")

    return features, domains


def numeric_preprocessor(features: list[str], *, scale: bool) -> ColumnTransformer:
    steps: list[tuple[str, object]] = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        steps.append(("scale", StandardScaler()))
    numeric = Pipeline(steps=steps)
    return ColumnTransformer([("numeric", numeric, features)], remainder="drop")


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
                        random_state=42,
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
                        random_state=42,
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
                        random_state=42,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
    }


def logit(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    return np.log(clipped / (1 - clipped)).reshape(-1, 1)


def calibrated_group_oof(
    raw_oof: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[np.ndarray, LogisticRegression]:
    calibrated = np.zeros_like(raw_oof, dtype=float)
    for train_idx, test_idx in splits:
        calibrator = LogisticRegression(max_iter=2000, random_state=42)
        calibrator.fit(logit(raw_oof[train_idx]), y[train_idx])
        calibrated[test_idx] = calibrator.predict_proba(logit(raw_oof[test_idx]))[:, 1]

    final_calibrator = LogisticRegression(max_iter=2000, random_state=42)
    final_calibrator.fit(logit(raw_oof), y)
    return calibrated, final_calibrator


def choose_threshold(y: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.unique(np.quantile(probabilities, np.linspace(0.05, 0.95, 91)))
    best_threshold = 0.5
    best_score = -1.0
    for threshold in candidates:
        predictions = (probabilities >= threshold).astype(int)
        score = balanced_accuracy_score(y, predictions)
        if score > best_score:
            best_score = float(score)
            best_threshold = float(threshold)
    return best_threshold


def metrics(y: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict[str, object]:
    predictions = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predictions, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    prevalence = float(np.mean(y))
    auprc = float(average_precision_score(y, probabilities))
    no_skill_brier = prevalence * (1 - prevalence)
    brier = float(brier_score_loss(y, probabilities))
    return {
        "auroc": float(roc_auc_score(y, probabilities)),
        "auprc": auprc,
        "prevalence": prevalence,
        "auprcLiftOverPrevalence": None if prevalence == 0 else auprc / prevalence,
        "brier": brier,
        "prevalenceOnlyBrier": no_skill_brier,
        "brierSkill": None if no_skill_brier == 0 else 1 - (brier / no_skill_brier),
        "sensitivity": float(sensitivity),
        "specificity": float(specificity),
        "balancedAccuracy": float(balanced_accuracy_score(y, predictions)),
        "threshold": float(threshold),
        "confusionMatrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
    }


def internal_gate(result: dict[str, object]) -> dict[str, object]:
    # Research engineering guardrails only. These are not clinical efficacy
    # cut-points and passing them does not authorize patient-facing risk claims.
    minimums = {
        "auroc": 0.70,
        "auprcLiftOverPrevalence": 1.25,
        "sensitivity": 0.70,
        "specificity": 0.60,
        "brierSkillGreaterThan": 0.0,
    }
    checks = {
        "auroc": float(result["auroc"]) >= minimums["auroc"],
        "auprcLiftOverPrevalence": float(result["auprcLiftOverPrevalence"] or 0) >= minimums["auprcLiftOverPrevalence"],
        "sensitivity": float(result["sensitivity"]) >= minimums["sensitivity"],
        "specificity": float(result["specificity"]) >= minimums["specificity"],
        "brierSkill": float(result["brierSkill"] or -1) > minimums["brierSkillGreaterThan"],
    }
    return {
        "minimums": minimums,
        "checks": checks,
        "passed": all(checks.values()),
        "note": "Internal product-development gate only; not a clinical validation standard.",
    }


def benchmark(
    input_csv: Path,
    output_json: Path,
    output_model: Path,
    *,
    horizon_days: int,
    population: str,
    index_time_definition: str,
) -> None:
    df = pd.read_csv(input_csv)
    features, domains = validate_dataset(df)
    X = df[features]
    y = df[TARGET].astype(int).to_numpy()
    groups = df[GROUP].astype(str).to_numpy()

    n_participants = int(pd.Series(groups).nunique())
    n_splits = min(5, n_participants)
    cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=42)
    splits = list(cv.split(X, y, groups))

    results: dict[str, dict[str, object]] = {}
    calibrated_predictions: dict[str, np.ndarray] = {}
    calibrators: dict[str, LogisticRegression] = {}
    models = candidate_models(features)

    for name, model in models.items():
        raw_oof = cross_val_predict(
            model,
            X,
            y,
            groups=groups,
            cv=splits,
            method="predict_proba",
            n_jobs=1,
        )[:, 1]
        calibrated, calibrator = calibrated_group_oof(raw_oof, y, groups, splits)
        threshold = choose_threshold(y, calibrated)
        model_metrics = metrics(y, calibrated, threshold)
        results[name] = {
            "metrics": model_metrics,
            "internalEngineeringGate": internal_gate(model_metrics),
        }
        calibrated_predictions[name] = calibrated
        calibrators[name] = calibrator

    # Discrimination is the primary development selector; AUPRC breaks ties.
    champion_name = max(
        results,
        key=lambda name: (
            float(results[name]["metrics"]["auroc"]),
            float(results[name]["metrics"]["auprc"]),
        ),
    )
    champion = models[champion_name]
    champion.fit(X, y)
    champion_metrics = results[champion_name]["metrics"]
    champion_calibrator = calibrators[champion_name]

    output_model.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": champion,
            "calibrator": champion_calibrator,
            "features": features,
            "target": TARGET,
            "participantGroupColumn": GROUP,
            "researchOnly": True,
        },
        output_model,
    )

    artifact = {
        "schemaVersion": "1.0.0",
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
        "candidateModels": results,
        "championModel": champion_name,
        "validation": {
            "splitUnit": "participant",
            "method": f"{n_splits}-fold stratified grouped out-of-fold evaluation with grouped Platt calibration",
            "nParticipants": n_participants,
            "nRows": int(len(df)),
            "metrics": champion_metrics,
            "externalValidated": False,
            "externalCohort": None,
            "cameraDomainValidated": False,
            "calibrationReported": True,
        },
        "deploymentGate": {
            "internalEngineeringGate": results[champion_name]["internalEngineeringGate"],
            "requiresIndependentExternalCohort": True,
            "requiresSameCameraPoseDomainValidation": True,
            "eligibleForUserFacingInjuryProbability": False,
        },
        "leakageControls": {
            "participantGroupedSplits": True,
            "predictionRowsFromSameParticipantNeverCrossValidationFolds": True,
            "featureTimeRequirement": "Every predictor must be available before the index time; this must be verified during cohort-specific feature construction.",
        },
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Leakage-resistant research benchmark for prospectively labeled injury outcomes."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--population", required=True)
    parser.add_argument("--index-time-definition", required=True)
    args = parser.parse_args()

    benchmark(
        args.input_csv,
        args.output_json,
        args.output_model,
        horizon_days=args.horizon_days,
        population=args.population,
        index_time_definition=args.index_time_definition,
    )
