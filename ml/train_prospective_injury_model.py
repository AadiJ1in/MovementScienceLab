"""Strict entry point for prospective injury-model research.

Cohort timing/leakage, pre-specified data adequacy, an outcome-specific
scientific protocol, a frozen feature/model-family plan, and predictor evidence
metadata must pass before the nested benchmark is allowed to run.

Measurement-quality variables such as pose confidence remain available in the
source cohort for quality auditing but are removed from the injury-prediction
feature matrix so the model cannot exploit camera/setup shortcuts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import joblib
import pandas as pd

from feature_evidence_registry import (
    evidence_snapshot,
    prohibited_predictor_columns,
    validate_registry_completeness,
)
from feature_plan import load_and_validate_feature_plan
from prospective_cohort_audit import audit_csv
from prospective_data_adequacy import audit_csv as audit_data_adequacy_csv
from prospective_injury_benchmark import (
    available_features,
    benchmark,
    candidate_models,
)
from scientific_protocol import load_and_validate_protocol


def _quality_audit(df: pd.DataFrame, columns: list[str]) -> dict[str, object]:
    report: dict[str, object] = {}
    for column in columns:
        numeric = pd.to_numeric(df[column], errors="coerce")
        finite = numeric.dropna()
        report[column] = {
            "role": "measurement-quality-only",
            "excludedFromInjuryPrediction": True,
            "nRows": int(len(df)),
            "nObserved": int(len(finite)),
            "fractionMissing": float(numeric.isna().mean()),
            "median": None if finite.empty else float(finite.median()),
            "p05": None if finite.empty else float(finite.quantile(0.05)),
            "p95": None if finite.empty else float(finite.quantile(0.95)),
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Audit a pre-specified prospective research protocol, frozen predictor/model plan, cohort timing, "
            "data adequacy, and predictor evidence policy before running the nested participant-grouped injury benchmark."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--protocol-json", type=Path, required=True)
    parser.add_argument("--feature-plan-json", type=Path, required=True)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--population", required=True)
    parser.add_argument("--cohort-id", required=True)
    parser.add_argument("--index-time-definition", required=True)
    parser.add_argument("--camera-measurement-version", required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    parser.add_argument("--minimum-total-participants", type=int, required=True)
    parser.add_argument("--minimum-positive-participants", type=int, required=True)
    parser.add_argument("--minimum-negative-participants", type=int, required=True)
    parser.add_argument(
        "--sample-size-justification",
        required=True,
        help=(
            "A-priori rationale or protocol source for the participant/outcome minimums. "
            "The training script does not invent a universal sample-size threshold."
        ),
    )
    parser.add_argument(
        "--allow-overlapping-windows",
        action="store_true",
        help=(
            "Permit overlapping future outcome windows only for a pre-specified repeated-risk design. "
            "The audit will retain a warning and event-reuse counts."
        ),
    )
    parser.add_argument(
        "--cohort-audit-json",
        type=Path,
        default=None,
        help="Optional path for the cohort leakage/timing audit. Defaults next to output_json.",
    )
    parser.add_argument(
        "--data-adequacy-json",
        type=Path,
        default=None,
        help="Optional path for the pre-specified data-adequacy audit. Defaults next to output_json.",
    )
    args = parser.parse_args()

    if not args.cohort_id.strip():
        raise SystemExit("--cohort-id must be non-empty.")

    registry_audit = validate_registry_completeness()
    if not registry_audit["passed"]:
        raise SystemExit(
            "Predictor evidence registry is incomplete: "
            + json.dumps(registry_audit, sort_keys=True)
        )

    protocol = load_and_validate_protocol(
        args.protocol_json,
        expected_horizon_days=args.horizon_days,
        expected_population=args.population,
        expected_index_time_definition=args.index_time_definition,
    )
    if not protocol["passed"]:
        details = "\n".join(f"- {message}" for message in protocol["errors"])
        raise SystemExit(
            f"Scientific protocol audit failed:\n{details}\nProtocol: {args.protocol_json}"
        )

    audit = audit_csv(
        args.input_csv,
        horizon_days=args.horizon_days,
        allow_overlapping_windows=args.allow_overlapping_windows,
    )
    audit_path = args.cohort_audit_json or args.output_json.with_name(
        f"{args.output_json.stem}.cohort-audit.json"
    )
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    if not audit["passed"]:
        details = "\n".join(f"- {message}" for message in audit["errors"])
        raise SystemExit(f"Prospective cohort audit failed:\n{details}\nAudit: {audit_path}")

    source_df = pd.read_csv(args.input_csv)
    excluded_quality_predictors = prohibited_predictor_columns(list(source_df.columns))
    quality_report = _quality_audit(source_df, excluded_quality_predictors)
    modeling_df = source_df.drop(columns=excluded_quality_predictors, errors="ignore")
    frozen_features, _ = available_features(modeling_df)
    frozen_model_families = list(candidate_models(frozen_features).keys())

    feature_plan = load_and_validate_feature_plan(
        args.feature_plan_json,
        expected_features=frozen_features,
        expected_model_families=frozen_model_families,
        expected_horizon_days=args.horizon_days,
        expected_outcome_name=str(protocol["outcome"]["name"]),
        require_model_fitting_authorized=True,
    )
    if not feature_plan["passed"]:
        details = "\n".join(f"- {message}" for message in feature_plan["errors"])
        raise SystemExit(
            f"Feature-plan audit failed:\n{details}\nPlan: {args.feature_plan_json}"
        )

    adequacy = audit_data_adequacy_csv(
        args.input_csv,
        minimum_total_participants=args.minimum_total_participants,
        minimum_positive_participants=args.minimum_positive_participants,
        minimum_negative_participants=args.minimum_negative_participants,
        sample_size_justification=args.sample_size_justification,
    )
    adequacy_path = args.data_adequacy_json or args.output_json.with_name(
        f"{args.output_json.stem}.data-adequacy.json"
    )
    adequacy_path.parent.mkdir(parents=True, exist_ok=True)
    adequacy_path.write_text(
        json.dumps(adequacy, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )

    if not adequacy["passed"]:
        details = "\n".join(f"- {message}" for message in adequacy["errors"])
        raise SystemExit(
            f"Prospective data-adequacy audit failed:\n{details}\nAudit: {adequacy_path}"
        )

    with TemporaryDirectory(prefix="movement-science-modeling-") as temp_dir:
        modeling_input = Path(temp_dir) / "prospective-modeling-input.csv"
        modeling_df.to_csv(modeling_input, index=False)
        benchmark(
            modeling_input,
            args.output_json,
            args.output_model,
            horizon_days=args.horizon_days,
            population=args.population,
            index_time_definition=args.index_time_definition,
            camera_measurement_version=args.camera_measurement_version,
            feature_timing_audited=True,
            bootstrap_samples=args.bootstrap_samples,
        )

    bundle = joblib.load(args.output_model)
    used_features = [str(feature) for feature in bundle["features"]]
    if used_features != feature_plan["candidatePredictors"]:
        raise RuntimeError(
            "Fitted model feature order diverged from the pre-specified feature plan."
        )
    feature_evidence = evidence_snapshot(used_features)
    bundle["developmentCohortId"] = args.cohort_id
    bundle["developmentInputSha256"] = audit["inputSha256"]
    bundle["developmentCohortAuditPassed"] = True
    bundle["developmentDataAdequacyAuditPassed"] = True
    bundle["preSpecifiedSampleMinimums"] = adequacy["preSpecifiedMinimums"]
    bundle["sampleSizeJustification"] = adequacy["sampleSizeJustification"]
    bundle["scientificProtocol"] = protocol
    bundle["featurePlan"] = feature_plan
    bundle["predictorEvidenceRegistrySnapshot"] = feature_evidence
    bundle["excludedMeasurementQualityPredictors"] = excluded_quality_predictors
    joblib.dump(bundle, args.output_model)

    artifact = json.loads(args.output_json.read_text(encoding="utf-8"))
    modeling_input_sha = artifact.get("provenance", {}).get("inputSha256")
    artifact["developmentCohort"] = {
        "cohortId": args.cohort_id,
        "sourceInputSha256": audit["inputSha256"],
        "modelingInputSha256": modeling_input_sha,
        "cohortAuditPath": str(audit_path),
        "cohortAuditPassed": True,
        "dataAdequacyAuditPath": str(adequacy_path),
        "dataAdequacyAuditPassed": True,
        "preSpecifiedSampleMinimums": adequacy["preSpecifiedMinimums"],
        "observedSampleInformation": adequacy["observed"],
        "sampleSizeJustification": adequacy["sampleSizeJustification"],
    }
    artifact["scientificProtocol"] = protocol
    artifact["featurePlan"] = feature_plan
    artifact["predictorEvidence"] = feature_evidence
    artifact["measurementQualityAudit"] = quality_report
    artifact["excludedMeasurementQualityPredictors"] = excluded_quality_predictors
    artifact["deploymentGate"]["requiresPreSpecifiedSampleSizeRationale"] = True
    artifact["deploymentGate"]["developmentDataAdequacyAuditPassed"] = True
    artifact["deploymentGate"]["scientificProtocolAuditPassed"] = True
    artifact["deploymentGate"]["featurePlanAuditPassed"] = True
    artifact["deploymentGate"]["predictorEvidenceRegistryComplete"] = True
    artifact["deploymentGate"]["measurementQualityShortcutsExcluded"] = True
    artifact["provenance"]["sourceInputSha256"] = audit["inputSha256"]
    artifact["provenance"]["scientificProtocolSha256"] = protocol["protocolSha256"]
    artifact["provenance"]["featurePlanSha256"] = feature_plan["featurePlanSha256"]
    args.output_json.write_text(
        json.dumps(artifact, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
