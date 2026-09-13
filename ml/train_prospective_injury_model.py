"""Strict entry point for prospective injury-model research.

A cohort-timing/leakage audit and a pre-specified data-adequacy audit must pass
before the nested benchmark is allowed to run. The exported research bundle is
stamped with development-cohort identity/provenance so a later external
evaluation can reject the exact same dataset and require an explicitly distinct
cohort.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib

from prospective_cohort_audit import audit_csv
from prospective_data_adequacy import audit_csv as audit_data_adequacy_csv
from prospective_injury_benchmark import benchmark


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Audit prospective cohort timing and pre-specified data adequacy, then run the "
            "nested participant-grouped injury benchmark."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
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

    benchmark(
        args.input_csv,
        args.output_json,
        args.output_model,
        horizon_days=args.horizon_days,
        population=args.population,
        index_time_definition=args.index_time_definition,
        camera_measurement_version=args.camera_measurement_version,
        feature_timing_audited=True,
        bootstrap_samples=args.bootstrap_samples,
    )

    # Stamp the frozen model with enough development identity to keep the
    # external evaluator from accidentally evaluating the exact development
    # file as though it were a new cohort. Participant-level independence still
    # requires a separate explicit attestation because IDs are intentionally not
    # embedded in the model artifact.
    bundle = joblib.load(args.output_model)
    bundle["developmentCohortId"] = args.cohort_id
    bundle["developmentInputSha256"] = audit["inputSha256"]
    bundle["developmentCohortAuditPassed"] = True
    bundle["developmentDataAdequacyAuditPassed"] = True
    bundle["preSpecifiedSampleMinimums"] = adequacy["preSpecifiedMinimums"]
    bundle["sampleSizeJustification"] = adequacy["sampleSizeJustification"]
    joblib.dump(bundle, args.output_model)

    artifact = json.loads(args.output_json.read_text(encoding="utf-8"))
    artifact["developmentCohort"] = {
        "cohortId": args.cohort_id,
        "inputSha256": audit["inputSha256"],
        "cohortAuditPath": str(audit_path),
        "cohortAuditPassed": True,
        "dataAdequacyAuditPath": str(adequacy_path),
        "dataAdequacyAuditPassed": True,
        "preSpecifiedSampleMinimums": adequacy["preSpecifiedMinimums"],
        "observedSampleInformation": adequacy["observed"],
        "sampleSizeJustification": adequacy["sampleSizeJustification"],
    }
    artifact["deploymentGate"]["requiresPreSpecifiedSampleSizeRationale"] = True
    artifact["deploymentGate"]["developmentDataAdequacyAuditPassed"] = True
    args.output_json.write_text(
        json.dumps(artifact, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
