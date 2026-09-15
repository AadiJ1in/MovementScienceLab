"""Strict SoccerMon reference-model entry point.

The cohort builder and information audit can run without authorizing predictive
model fitting. This entry point refuses to fit until a versioned feature/model
plan explicitly authorizes development and exactly matches the frozen predictor
and model-family specification.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from feature_plan import load_and_validate_feature_plan
from prospective_injury_benchmark import candidate_models
from soccermon_reference import (
    REFERENCE_FEATURE_DOMAINS,
    run_soccermon_reference_benchmark,
)

SOCCERMON_REFERENCE_FEATURES = [
    feature
    for domain in ("history", "symptoms_readiness", "training_exposure")
    for feature in REFERENCE_FEATURE_DOMAINS[domain]
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Strict pre-specified SoccerMon reference benchmark. Information auditing is allowed with a locked plan; "
            "predictive model fitting is not."
        )
    )
    parser.add_argument("cohort_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--feature-plan-json", type=Path, required=True)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--minimum-total-participants", type=int, required=True)
    parser.add_argument("--minimum-positive-participants", type=int, required=True)
    parser.add_argument("--minimum-negative-participants", type=int, required=True)
    parser.add_argument("--sample-size-justification", required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    parser.add_argument("--allow-overlapping-windows", action="store_true")
    args = parser.parse_args()

    df = pd.read_csv(args.cohort_csv)
    missing = [feature for feature in SOCCERMON_REFERENCE_FEATURES if feature not in df.columns]
    if missing:
        raise SystemExit(
            "Frozen SoccerMon reference predictors are missing from the cohort: "
            + ", ".join(missing)
        )

    model_families = list(candidate_models(SOCCERMON_REFERENCE_FEATURES).keys())
    plan = load_and_validate_feature_plan(
        args.feature_plan_json,
        expected_features=SOCCERMON_REFERENCE_FEATURES,
        expected_model_families=model_families,
        expected_horizon_days=args.horizon_days,
        expected_outcome_name="any recorded injury event",
        require_model_fitting_authorized=True,
    )
    if not plan["passed"]:
        details = "\n".join(f"- {message}" for message in plan["errors"])
        raise SystemExit(
            f"SoccerMon feature-plan audit failed; no model was fit:\n{details}\nPlan: {args.feature_plan_json}"
        )

    report = run_soccermon_reference_benchmark(
        args.cohort_csv,
        args.output_json,
        args.output_model,
        horizon_days=args.horizon_days,
        minimum_total_participants=args.minimum_total_participants,
        minimum_positive_participants=args.minimum_positive_participants,
        minimum_negative_participants=args.minimum_negative_participants,
        sample_size_justification=args.sample_size_justification,
        bootstrap_samples=args.bootstrap_samples,
        allow_overlapping_windows=args.allow_overlapping_windows,
    )
    report["featurePlan"] = plan
    report["provenance"]["featurePlanSha256"] = plan["featurePlanSha256"]
    args.output_json.write_text(
        __import__("json").dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
