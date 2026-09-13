"""Strict entry point for prospective injury-model research.

A cohort-timing/leakage audit must pass before the nested benchmark is allowed
to run. This prevents a manually asserted "feature timing audited" flag from
substituting for timestamp-level checks in the canonical training workflow.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from prospective_cohort_audit import audit_csv
from prospective_injury_benchmark import benchmark


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit a prospective cohort, then run the nested participant-grouped injury benchmark."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--population", required=True)
    parser.add_argument("--index-time-definition", required=True)
    parser.add_argument("--camera-measurement-version", required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
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
    args = parser.parse_args()

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


if __name__ == "__main__":
    main()
