from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from prospective_cohort_audit import audit_csv
from prospective_injury_benchmark import (
    GROUP,
    TARGET,
    apply_calibrator,
    cluster_bootstrap_intervals,
    metrics,
    subgroup_audit,
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_model_bundle(bundle: dict[str, Any]) -> None:
    required = {
        "model",
        "calibrator",
        "threshold",
        "features",
        "cameraMeasurementVersion",
        "researchOnly",
        "eligibleForUserFacingInjuryProbability",
        "developmentInputSha256",
        "developmentCohortId",
    }
    missing = sorted(required - set(bundle))
    if missing:
        raise ValueError(
            "Model bundle predates the external-validation contract or is incomplete. "
            f"Missing: {', '.join(missing)}"
        )
    if bundle["researchOnly"] is not True:
        raise ValueError("External evaluator accepts only research-only model bundles.")
    if bundle["eligibleForUserFacingInjuryProbability"] is not False:
        raise ValueError("Model bundle must remain ineligible for a patient-facing injury probability.")


def validate_external_identity(
    *,
    bundle: dict[str, Any],
    external_input_sha256: str,
    external_cohort_id: str,
    camera_measurement_version: str,
    participant_independence_attested: bool,
) -> list[str]:
    blockers: list[str] = []
    if not external_cohort_id.strip():
        blockers.append("External cohort ID must be non-empty.")
    if external_cohort_id == str(bundle["developmentCohortId"]):
        blockers.append("External cohort ID matches the development cohort ID.")
    if external_input_sha256 == str(bundle["developmentInputSha256"]):
        blockers.append("External dataset file is byte-identical to the development dataset.")
    if camera_measurement_version != str(bundle["cameraMeasurementVersion"]):
        blockers.append(
            "Camera measurement version differs from the model's development measurement version. "
            "Treat this as a separate measurement-domain study rather than same-domain external evaluation."
        )
    if not participant_independence_attested:
        blockers.append(
            "Participant independence has not been attested; external evaluation must not reuse development participants."
        )
    return blockers


def evaluate_external_cohort(
    model_path: Path,
    input_csv: Path,
    output_json: Path,
    *,
    horizon_days: int,
    external_cohort_id: str,
    external_population: str,
    camera_measurement_version: str,
    participant_independence_attested: bool,
    allow_overlapping_windows: bool,
    bootstrap_samples: int,
) -> dict[str, Any]:
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")

    bundle = joblib.load(model_path)
    if not isinstance(bundle, dict):
        raise ValueError("Model artifact must contain the expected research bundle dictionary.")
    validate_model_bundle(bundle)

    audit = audit_csv(
        input_csv,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    if not audit["passed"]:
        details = "\n".join(f"- {message}" for message in audit["errors"])
        raise ValueError(f"External cohort timing/leakage audit failed:\n{details}")

    external_hash = sha256_file(input_csv)
    identity_blockers = validate_external_identity(
        bundle=bundle,
        external_input_sha256=external_hash,
        external_cohort_id=external_cohort_id,
        camera_measurement_version=camera_measurement_version,
        participant_independence_attested=participant_independence_attested,
    )

    df = pd.read_csv(input_csv)
    features = [str(feature) for feature in bundle["features"]]
    missing_features = sorted(set(features) - set(df.columns))
    if missing_features:
        raise ValueError(
            "External cohort is missing model predictors: " + ", ".join(missing_features)
        )
    missing_required = sorted({TARGET, GROUP} - set(df.columns))
    if missing_required:
        raise ValueError("External cohort is missing: " + ", ".join(missing_required))

    if "camera_measurement_version" in df.columns:
        versions = set(df["camera_measurement_version"].dropna().astype(str).unique().tolist())
        if versions != {camera_measurement_version}:
            identity_blockers.append(
                "Row-level camera_measurement_version does not uniformly match the declared external camera version."
            )

    y = df[TARGET].astype(int).to_numpy()
    if set(np.unique(y).tolist()) != {0, 1}:
        raise ValueError("External cohort must contain both outcome classes to estimate discrimination.")
    groups = df[GROUP].astype(str).to_numpy()

    # Deliberately no fit/refit operation exists in this evaluator. The frozen
    # development model, frozen calibration map, frozen feature contract, and
    # frozen threshold are applied exactly as exported.
    raw_probabilities = bundle["model"].predict_proba(df[features])[:, 1]
    probabilities = apply_calibrator(bundle["calibrator"], raw_probabilities)
    threshold = float(bundle["threshold"])
    predictions = (probabilities >= threshold).astype(int)

    external_metrics = metrics(
        y,
        probabilities,
        threshold=threshold,
        predictions=predictions,
    )
    intervals = cluster_bootstrap_intervals(
        y,
        probabilities,
        predictions,
        groups,
        samples=bootstrap_samples,
    )
    subgroup_report = subgroup_audit(df, y, probabilities, predictions, groups)

    report = {
        "schemaVersion": "1.0.0",
        "reportType": "frozen-model-external-evaluation",
        "modelRefitDuringEvaluation": False,
        "development": {
            "cohortId": bundle["developmentCohortId"],
            "inputSha256": bundle["developmentInputSha256"],
            "cameraMeasurementVersion": bundle["cameraMeasurementVersion"],
        },
        "external": {
            "cohortId": external_cohort_id,
            "population": external_population,
            "inputSha256": external_hash,
            "cameraMeasurementVersion": camera_measurement_version,
            "participantIndependenceAttested": bool(participant_independence_attested),
            "nParticipants": int(len(np.unique(groups))),
            "nRows": int(len(df)),
            "nParticipantsWithPositiveOutcome": int(df.groupby(GROUP)[TARGET].max().sum()),
            "cohortAudit": audit,
        },
        "evaluation": {
            "featuresFrozenFromDevelopment": True,
            "modelFrozenFromDevelopment": True,
            "calibrationFrozenFromDevelopment": True,
            "thresholdFrozenFromDevelopment": True,
            "threshold": threshold,
            "metrics": external_metrics,
            "confidenceIntervals": intervals,
            "subgroupAudit": subgroup_report,
        },
        "externalValidationGate": {
            "passedIdentityAndDomainChecks": not identity_blockers,
            "blockers": identity_blockers,
            "note": (
                "Passing identity/domain checks means this report used a distinct attested cohort and the frozen model. "
                "It does not by itself establish clinical utility, regulatory clearance, or patient-facing suitability."
            ),
        },
        "productGate": {
            "eligibleForUserFacingInjuryProbability": False,
            "requiresClinicalGovernanceReview": True,
        },
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate a frozen prospective injury research model on a distinct cohort without refitting."
    )
    parser.add_argument("model_path", type=Path)
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--external-cohort-id", required=True)
    parser.add_argument("--external-population", required=True)
    parser.add_argument("--camera-measurement-version", required=True)
    parser.add_argument(
        "--participant-independence-attested",
        action="store_true",
        help="Attest that no participant in this evaluation cohort was used for model development/internal validation.",
    )
    parser.add_argument("--allow-overlapping-windows", action="store_true")
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()

    evaluate_external_cohort(
        args.model_path,
        args.input_csv,
        args.output_json,
        horizon_days=args.horizon_days,
        external_cohort_id=args.external_cohort_id,
        external_population=args.external_population,
        camera_measurement_version=args.camera_measurement_version,
        participant_independence_attested=args.participant_independence_attested,
        allow_overlapping_windows=args.allow_overlapping_windows,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
