"""ACL-only prospective machine-learning benchmark.

The primary target is a medically confirmed future noncontact/indirect-contact
ACL rupture. Direct-contact ACL events are excluded from the primary target.
All validation is participant-grouped; model family, calibration and threshold
selection are nested within training folds through the shared benchmark engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from prospective_injury_benchmark import (
    RANDOM_SEED,
    _final_portable_logistic,
    _final_research_model,
    cluster_bootstrap_intervals,
    internal_gate,
    missingness_report,
    nested_grouped_evaluation,
    subgroup_audit,
)

TARGET = "acl_tear_within_horizon"
GROUP = "participant_id"
PRIMARY_MECHANISMS = {"noncontact", "indirect-contact"}
QUALITY_ONLY = {
    "mean_pose_confidence",
    "camera_measurement_frame_fraction",
    "lighting_quality",
    "image_sharpness",
    "camera_fps",
}

ACL_FEATURE_DOMAINS: dict[str, tuple[str, ...]] = {
    "acl_history": (
        "prior_acl_rupture",
        "prior_acl_reconstruction",
        "days_since_last_acl_event",
    ),
    "strength": (
        "hip_adductor_strength_norm",
        "hip_abductor_strength_norm",
        "hip_adductor_abductor_ratio",
        "eccentric_knee_flexor_strength_norm",
    ),
    "jump_kinetics": (
        "cmj_peak_takeoff_force_bw",
        "peak_landing_force_bw",
        "force_asymmetry_pct",
    ),
    "video_biomechanics": (
        "dynamic_knee_valgus_deg",
        "ipsilateral_trunk_flexion_deg",
        "knee_flexion_at_initial_contact_deg",
        "landing_knee_flexion_excursion_deg",
        "hip_adduction_proxy_deg",
        "interlimb_landing_asymmetry_deg",
        "rep_to_rep_variability",
    ),
    "exposure_fatigue": (
        "sport_exposure_hours_7d",
        "sport_exposure_hours_28d",
        "session_rpe_load_7d",
        "session_rpe_load_28d",
        "high_speed_distance_7d",
        "deceleration_or_cut_exposures_7d",
        "acute_fatigue_score",
    ),
    "longitudinal_change": (
        "dynamic_knee_valgus_change_30d",
        "trunk_flexion_change_30d",
        "landing_asymmetry_change_30d",
        "training_load_change_28d",
    ),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def available_acl_features(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    features: list[str] = []
    domains: list[str] = []
    for domain, candidates in ACL_FEATURE_DOMAINS.items():
        present = [
            feature
            for feature in candidates
            if feature in df.columns and feature not in QUALITY_ONLY
        ]
        if present:
            domains.append(domain)
            features.extend(present)
    return features, domains


def validate_acl_dataset(df: pd.DataFrame) -> tuple[list[str], list[str], dict[str, Any]]:
    required = {
        GROUP,
        TARGET,
        "index_time",
        "feature_cutoff_time",
        "outcome_window_end",
        "acl_event_time",
        "injury_mechanism",
        "medical_confirmation",
        "sport_exposure_hours_28d",
    }
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError("Missing ACL research columns: " + ", ".join(missing))

    if df[GROUP].isna().any():
        raise ValueError("participant_id cannot be missing.")

    labels = pd.to_numeric(df[TARGET], errors="coerce")
    if labels.isna().any() or set(labels.astype(int).unique()) != {0, 1}:
        raise ValueError(f"{TARGET} must contain both 0 and 1 and cannot be missing.")
    labels = labels.astype(int)

    index_time = pd.to_datetime(df["index_time"], utc=True, errors="coerce")
    cutoff = pd.to_datetime(df["feature_cutoff_time"], utc=True, errors="coerce")
    window_end = pd.to_datetime(df["outcome_window_end"], utc=True, errors="coerce")
    if index_time.isna().any() or cutoff.isna().any() or window_end.isna().any():
        raise ValueError("ACL prediction timing columns must contain parseable timestamps.")
    if (cutoff > index_time).any():
        raise ValueError("ACL predictors cannot be timestamped after the prediction index.")
    if (window_end <= index_time).any():
        raise ValueError("ACL outcome windows must end after the prediction index.")

    positive = labels == 1
    event_time = pd.to_datetime(df["acl_event_time"], utc=True, errors="coerce")
    if event_time[positive].isna().any():
        raise ValueError("Every positive ACL row must have a time-verifiable acl_event_time.")
    if ((event_time[positive] <= index_time[positive]) | (event_time[positive] > window_end[positive])).any():
        raise ValueError("Positive ACL event times must fall strictly inside the future outcome window.")

    confirmation = df["medical_confirmation"].astype("string").str.strip().str.lower()
    accepted_confirmation = {"mri", "surgery", "medical-staff-confirmed", "physician-confirmed"}
    bad_confirmation = positive & ~confirmation.isin(accepted_confirmation)
    if bad_confirmation.any():
        raise ValueError("Every positive ACL outcome requires a recognized medical confirmation method.")

    mechanism = df["injury_mechanism"].astype("string").str.strip().str.lower()
    bad_mechanism = positive & ~mechanism.isin(PRIMARY_MECHANISMS)
    if bad_mechanism.any():
        raise ValueError(
            "Primary ACL target accepts only noncontact or indirect-contact positive events; direct-contact tears must be excluded."
        )

    exposure = pd.to_numeric(df["sport_exposure_hours_28d"], errors="coerce")
    if exposure.isna().any() or (exposure < 0).any():
        raise ValueError("sport_exposure_hours_28d must be observed and non-negative.")

    participant_outcomes = pd.DataFrame({GROUP: df[GROUP], TARGET: labels}).groupby(GROUP)[TARGET].max()
    if len(participant_outcomes) < 30:
        raise ValueError("ACL modeling requires at least 30 distinct participants for an engineering run.")
    positive_participants = int(participant_outcomes.sum())
    negative_participants = int((participant_outcomes == 0).sum())
    if positive_participants < 5 or negative_participants < 5:
        raise ValueError("ACL grouped validation requires at least 5 positive and 5 negative participants.")

    features, domains = available_acl_features(df)
    if "video_biomechanics" not in domains:
        raise ValueError("ACL benchmark requires at least one validated video-biomechanics candidate feature.")
    if "acl_history" not in domains:
        raise ValueError("ACL benchmark requires ACL-specific injury history.")
    if "exposure_fatigue" not in domains:
        raise ValueError("ACL benchmark requires exposure/fatigue information.")
    if len(domains) < 4:
        raise ValueError(
            "ACL benchmark requires at least four predictor domains; present: " + ", ".join(domains)
        )

    audit = {
        "primaryOutcome": "future medically confirmed noncontact/indirect-contact ACL rupture",
        "directContactExcluded": True,
        "nParticipants": int(len(participant_outcomes)),
        "nPositiveParticipants": positive_participants,
        "nNegativeParticipants": negative_participants,
        "nRows": int(len(df)),
        "nPositiveRows": int(labels.sum()),
        "predictorTimingVerified": True,
        "positiveEventTimingVerified": True,
        "medicalConfirmationVerified": True,
        "mechanismVerified": True,
        "exposureObserved": True,
    }
    return features, domains, audit


def benchmark_acl(
    input_csv: Path,
    output_json: Path,
    output_model: Path,
    *,
    bootstrap_samples: int = 500,
) -> None:
    df = pd.read_csv(input_csv)
    features, domains, acl_audit = validate_acl_dataset(df)
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
            "researchOnly": True,
            "aclOnly": True,
            "primaryMechanisms": sorted(PRIMARY_MECHANISMS),
            "eligibleForUserFacingAclProbability": False,
        },
        output_model,
    )

    validation_metrics = dict(nested["metrics"])
    artifact = {
        "schemaVersion": "1.0.0",
        "modelType": "prospective-noncontact-acl-research",
        "clinicalClaim": "research-risk-estimation-only",
        "target": TARGET,
        "primaryOutcome": acl_audit["primaryOutcome"],
        "featureDomains": domains,
        "features": features,
        "aclCohortAudit": acl_audit,
        "modeling": {
            "candidateFamilies": ["logistic_regression", "random_forest", "extra_trees"],
            "nestedParticipantGrouped": True,
            "championFamily": champion_name,
            "finalThreshold": final_threshold,
            "candidateDevelopmentMetrics": final_candidates,
            "portableTransparentLogistic": {
                "threshold": portable_threshold,
                "groupedDevelopmentMetrics": portable_metrics,
            },
        },
        "validation": {
            "splitUnit": "participant",
            "nOuterFolds": nested["nOuterFolds"],
            "nParticipants": acl_audit["nParticipants"],
            "nRows": acl_audit["nRows"],
            "metrics": validation_metrics,
            "confidenceIntervals": intervals,
            "subgroupAudit": subgroup_report,
            "foldReports": nested["folds"],
            "selectedModelFrequency": nested["selectedModelFrequency"],
            "externalValidated": False,
            "sameCameraDomainValidated": False,
        },
        "dataQuality": missingness_report(df, features),
        "deploymentGate": {
            "internalEngineeringGate": internal_gate(validation_metrics, intervals),
            "eligibleForUserFacingAclProbability": False,
            "requiresProspectiveAclLabels": True,
            "requiresIndependentExternalCohort": True,
            "requiresSameCameraMeasurementValidation": True,
            "requiresClinicalGovernanceReview": True,
        },
        "mathematicalTarget": {
            "form": "P(ACL within horizon) = 1 - exp(-E * h0 * exp(beta0 + sum(beta_j*z_j)))",
            "note": "Exposure-adjusted hazard is the target calibrated formulation. This fixed-horizon classifier benchmark is an engineering model-comparison layer; final h0 and beta values require prospective ACL outcomes.",
        },
        "provenance": {
            "inputSha256": _sha256(input_csv),
            "randomSeed": RANDOM_SEED,
        },
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(artifact, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="ACL-only prospective machine-learning research benchmark")
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    if args.bootstrap_samples < 100:
        raise SystemExit("--bootstrap-samples must be at least 100")
    benchmark_acl(
        args.input_csv,
        args.output_json,
        args.output_model,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
