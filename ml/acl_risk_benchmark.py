"""Prospective ACL-tear research benchmark.

This module intentionally predicts one outcome only: a future primary noncontact
or indirect-contact ACL tear within a pre-specified horizon. Internet injury
videos may inform mechanism hypotheses or camera measurement tests, but they are
not valid prospective outcome labels and are never accepted here as training
rows.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from prospective_injury_benchmark import (
    RANDOM_SEED,
    candidate_models,
    cluster_bootstrap_intervals,
    fit_calibrator,
    apply_calibrator,
    choose_threshold,
    nested_grouped_evaluation,
    _valid_group_splits,
)

TARGET = "acl_tear_within_horizon"
GROUP = "participant_id"

ACL_FEATURE_DOMAINS: dict[str, tuple[str, ...]] = {
    "history": (
        "prior_acl_injury_count",
        "previous_lower_extremity_injury_count",
    ),
    "anthropometry": (
        "body_mass_kg",
        "tibia_length_cm",
    ),
    "strength_neuromuscular": (
        "quadriceps_hamstring_ratio",
        "hip_abductor_strength_norm",
        "hamstring_strength_norm",
    ),
    "exposure_fatigue": (
        "weekly_exposure_minutes",
        "acute_chronic_load_ratio",
        "fatigue_score_0_10",
        "high_speed_distance_7d",
        "cutting_exposure_count_7d",
    ),
    "camera_biomechanics": (
        "knee_valgus_motion_proxy_deg",
        "knee_flexion_rom_deg",
        "peak_trunk_lean_deg",
        "peak_pelvic_obliquity_deg",
        "bilateral_knee_flexion_asymmetry_deg",
    ),
    "clinical_structure": (
        "generalized_joint_laxity_score",
        "posterior_tibial_slope_deg",
        "intercondylar_notch_width_index",
        "family_history_acl",
    ),
    "mechanism_interactions": (
        "valgus_low_flexion_interaction",
        "valgus_trunk_interaction",
        "fatigue_valgus_interaction",
    ),
}

REQUIRED_DOMAINS = {
    "camera_biomechanics",
    "exposure_fatigue",
    "strength_neuromuscular",
}


def add_mechanism_interactions(df: pd.DataFrame) -> pd.DataFrame:
    frame = df.copy()
    if {"knee_valgus_motion_proxy_deg", "knee_flexion_rom_deg"}.issubset(frame.columns):
        frame["valgus_low_flexion_interaction"] = (
            frame["knee_valgus_motion_proxy_deg"]
            * np.maximum(0.0, 60.0 - frame["knee_flexion_rom_deg"])
            / 60.0
        )
    if {"knee_valgus_motion_proxy_deg", "peak_trunk_lean_deg"}.issubset(frame.columns):
        frame["valgus_trunk_interaction"] = (
            frame["knee_valgus_motion_proxy_deg"]
            * frame["peak_trunk_lean_deg"].abs()
            / 20.0
        )
    if {"knee_valgus_motion_proxy_deg", "fatigue_score_0_10"}.issubset(frame.columns):
        frame["fatigue_valgus_interaction"] = (
            frame["knee_valgus_motion_proxy_deg"]
            * frame["fatigue_score_0_10"]
            / 10.0
        )
    return frame


def available_acl_features(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    features: list[str] = []
    domains: list[str] = []
    for domain, candidates in ACL_FEATURE_DOMAINS.items():
        present = [name for name in candidates if name in df.columns]
        if present:
            domains.append(domain)
            features.extend(present)
    return features, domains


def validate_acl_dataset(
    df: pd.DataFrame,
    *,
    minimum_participants: int,
    minimum_acl_events: int,
) -> tuple[list[str], list[str]]:
    missing = sorted({TARGET, GROUP} - set(df.columns))
    if missing:
        raise ValueError("Missing ACL benchmark columns: " + ", ".join(missing))
    if df[GROUP].isna().any():
        raise ValueError("participant_id cannot be missing.")
    labels = pd.to_numeric(df[TARGET], errors="coerce")
    if labels.isna().any() or set(labels.astype(int).unique()) != {0, 1}:
        raise ValueError(f"{TARGET} must contain non-missing 0/1 labels with both classes.")

    participant_outcome = df.assign(_target=labels.astype(int)).groupby(GROUP)["_target"].max()
    if len(participant_outcome) < minimum_participants:
        raise ValueError(
            f"ACL protocol requires at least {minimum_participants} participants; got {len(participant_outcome)}."
        )
    positive_participants = int(participant_outcome.sum())
    if positive_participants < minimum_acl_events:
        raise ValueError(
            f"ACL protocol requires at least {minimum_acl_events} participants with ACL events; got {positive_participants}."
        )

    features, domains = available_acl_features(df)
    missing_domains = sorted(REQUIRED_DOMAINS - set(domains))
    if missing_domains:
        raise ValueError(
            "ACL benchmark is missing required predictor domains: " + ", ".join(missing_domains)
        )
    if len(domains) < 4:
        raise ValueError("ACL benchmark requires at least four predictor domains.")
    return features, domains


def fit_transparent_acl_formula(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    features: list[str],
) -> dict[str, object]:
    model = candidate_models(features)["logistic_regression"]
    splits = _valid_group_splits(X, y, groups)
    raw = np.asarray(
        __import__("sklearn.model_selection", fromlist=["cross_val_predict"]).cross_val_predict(
            model,
            X,
            y,
            groups=groups,
            cv=splits,
            method="predict_proba",
            n_jobs=1,
        )[:, 1],
        dtype=float,
    )
    calibrator = fit_calibrator(raw, y)
    calibrated = apply_calibrator(calibrator, raw)
    threshold = choose_threshold(y, calibrated)
    model.fit(X, y)

    preprocess = model.named_steps["preprocess"].named_transformers_["numeric"]
    classifier = model.named_steps["classifier"]
    return {
        "model": model,
        "calibrator": calibrator,
        "threshold": float(threshold),
        "features": features,
        "formula": {
            "intercept": float(classifier.intercept_[0]),
            "coefficients": [float(value) for value in classifier.coef_[0]],
            "medians": [float(value) for value in preprocess.named_steps["impute"].statistics_],
            "means": [float(value) for value in preprocess.named_steps["scale"].mean_],
            "scales": [float(value) for value in preprocess.named_steps["scale"].scale_],
            "calibrationIntercept": float(calibrator.intercept_[0]),
            "calibrationCoefficient": float(calibrator.coef_[0][0]),
            "equation": "P = sigmoid(a + c * logit(sigmoid(beta0 + sum(beta_j * z_j))))",
        },
        "groupedDevelopmentMetrics": {
            "auroc": float(roc_auc_score(y, calibrated)),
            "auprc": float(average_precision_score(y, calibrated)),
            "brier": float(brier_score_loss(y, calibrated)),
        },
    }


def benchmark_acl(
    input_csv: Path,
    output_json: Path,
    output_model: Path,
    *,
    horizon_days: int,
    population: str,
    minimum_participants: int,
    minimum_acl_events: int,
    bootstrap_samples: int,
) -> None:
    frame = add_mechanism_interactions(pd.read_csv(input_csv))
    features, domains = validate_acl_dataset(
        frame,
        minimum_participants=minimum_participants,
        minimum_acl_events=minimum_acl_events,
    )
    X = frame[features]
    y = frame[TARGET].astype(int).to_numpy()
    groups = frame[GROUP].astype(str).to_numpy()

    nested = nested_grouped_evaluation(X, y, groups, features)
    intervals = cluster_bootstrap_intervals(
        y,
        nested["probabilities"],
        nested["predictions"],
        groups,
        samples=bootstrap_samples,
    )
    transparent = fit_transparent_acl_formula(X, y, groups, features)
    n_acl_participants = int(frame.groupby(GROUP)[TARGET].max().sum())

    output_model.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "researchOnly": True,
            "outcome": TARGET,
            "horizonDays": horizon_days,
            "population": population,
            "mechanismScope": "primary-noncontact-or-indirect-contact-acl-tear",
            "eligibleForClinicalAclProbability": False,
            **transparent,
        },
        output_model,
    )

    artifact = {
        "schemaVersion": "1.0.0",
        "modelType": "acl-tear-prospective-research",
        "outcome": {
            "label": TARGET,
            "horizonDays": horizon_days,
            "mechanismScope": "primary-noncontact-or-indirect-contact-acl-tear",
        },
        "population": population,
        "features": features,
        "featureDomains": domains,
        "nParticipants": int(frame[GROUP].nunique()),
        "nParticipantsWithAclEvent": n_acl_participants,
        "nestedParticipantGroupedMetrics": nested["metrics"],
        "confidenceIntervals": intervals,
        "selectedModelFrequency": dict(Counter(nested["selectedModelFrequency"])),
        "transparentAclFormula": transparent["formula"],
        "transparentFormulaDevelopmentMetrics": transparent["groupedDevelopmentMetrics"],
        "deploymentGate": {
            "eligibleForClinicalAclProbability": False,
            "requiresIndependentExternalValidation": True,
            "requiresSameCameraProtocolValidation": True,
            "requiresProspectiveOutcomeAdjudication": True,
            "requiresClinicalGovernance": True,
        },
        "videoPolicy": {
            "onlineInjuryVideosMayTrainMechanismOrMeasurementModels": True,
            "onlineInjuryVideosMayServeAsProspectiveAclRiskLabels": False,
            "reason": "Videos of injuries show mechanisms after/at the event and do not provide pre-injury prospective labels for future ACL tear risk.",
        },
        "formulaInterpretation": (
            "The fitted logistic equation is a research prediction model, not a biomechanical law. "
            "Its coefficients are cohort-specific and must be externally validated before clinical use."
        ),
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(artifact, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="ACL-specific participant-grouped prospective ML benchmark")
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--horizon-days", type=int, default=180)
    parser.add_argument("--population", required=True)
    parser.add_argument("--minimum-participants", type=int, required=True)
    parser.add_argument("--minimum-acl-events", type=int, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    benchmark_acl(
        args.input_csv,
        args.output_json,
        args.output_model,
        horizon_days=args.horizon_days,
        population=args.population,
        minimum_participants=args.minimum_participants,
        minimum_acl_events=args.minimum_acl_events,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
