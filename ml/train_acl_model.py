"""Fail-closed ACL model training entry point.

A prospective ACL model should not be fitted merely because a CSV exists. This
entry point requires explicit fitting authorization, a frozen ordered predictor
plan, pre-specified participant minimums, and a written sample-size rationale
before it runs either the nested classifier benchmark or the exposure-adjusted
hazard candidate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd

from acl_exposure_hazard import grouped_hazard_evaluation
from acl_injury_benchmark import (
    ACL_FEATURE_DOMAINS,
    GROUP,
    TARGET,
    benchmark_acl,
    validate_acl_dataset,
)
from acl_model_plan import load_and_validate_acl_model_plan


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def data_adequacy_report(
    df: pd.DataFrame,
    *,
    minimum_total_participants: int,
    minimum_positive_participants: int,
    minimum_negative_participants: int,
    sample_size_justification: str,
    training_data_type: str,
) -> dict[str, object]:
    if minimum_total_participants <= 0:
        raise ValueError("minimum_total_participants must be positive.")
    if minimum_positive_participants <= 0 or minimum_negative_participants <= 0:
        raise ValueError("positive/negative participant minimums must be positive.")
    justification = sample_size_justification.strip()
    if len(justification) < 30:
        raise ValueError(
            "sample_size_justification must state the pre-specified rationale rather than a placeholder."
        )
    if training_data_type not in {
        "prospective-human",
        "synthetic-development-fixture",
    }:
        raise ValueError("Unsupported training_data_type.")

    participant_outcomes = df.groupby(GROUP)[TARGET].max().astype(int)
    observed_total = int(len(participant_outcomes))
    observed_positive = int(participant_outcomes.sum())
    observed_negative = int((participant_outcomes == 0).sum())
    checks = {
        "totalParticipants": observed_total >= minimum_total_participants,
        "positiveParticipants": observed_positive >= minimum_positive_participants,
        "negativeParticipants": observed_negative >= minimum_negative_participants,
    }
    return {
        "passed": all(checks.values()),
        "trainingDataType": training_data_type,
        "preSpecifiedMinimums": {
            "totalParticipants": minimum_total_participants,
            "positiveParticipants": minimum_positive_participants,
            "negativeParticipants": minimum_negative_participants,
        },
        "observed": {
            "totalParticipants": observed_total,
            "positiveParticipants": observed_positive,
            "negativeParticipants": observed_negative,
            "rows": int(len(df)),
        },
        "checks": checks,
        "sampleSizeJustification": justification,
        "warning": (
            "Passing user-specified engineering minimums does not establish that the cohort is statistically adequate for clinical prediction. "
            "Prospective-human protocols should justify model complexity, outcome frequency, shrinkage, calibration precision, and validation precision before fitting."
        ),
    }


def _modeling_frame(df: pd.DataFrame, selected_predictors: list[str]) -> pd.DataFrame:
    all_candidates = {
        feature
        for features in ACL_FEATURE_DOMAINS.values()
        for feature in features
    }
    missing = [feature for feature in selected_predictors if feature not in df.columns]
    if missing:
        raise ValueError(
            "Frozen ACL model plan predictors are missing from the cohort: "
            + ", ".join(missing)
        )
    to_drop = sorted(
        feature
        for feature in all_candidates
        if feature in df.columns and feature not in selected_predictors
    )
    return df.drop(columns=to_drop)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Authorize, audit, fit, and evaluate ACL-only prospective research models."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("output_model", type=Path)
    parser.add_argument("--model-plan-json", type=Path, required=True)
    parser.add_argument("--adequacy-json", type=Path, default=None)
    parser.add_argument(
        "--training-data-type",
        choices=["prospective-human", "synthetic-development-fixture"],
        required=True,
    )
    parser.add_argument("--minimum-total-participants", type=int, required=True)
    parser.add_argument("--minimum-positive-participants", type=int, required=True)
    parser.add_argument("--minimum-negative-participants", type=int, required=True)
    parser.add_argument("--sample-size-justification", required=True)
    parser.add_argument("--model-fitting-authorized", action="store_true")
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    parser.add_argument("--hazard-l2-penalty", type=float, default=1.0)
    args = parser.parse_args()

    source_sha256 = _sha256(args.input_csv)
    df = pd.read_csv(args.input_csv)
    _, _, cohort_audit = validate_acl_dataset(df)

    plan = load_and_validate_acl_model_plan(args.model_plan_json)
    if not plan["passed"]:
        details = "\n".join(f"- {message}" for message in plan["errors"])
        raise SystemExit(f"ACL model-plan validation failed:\n{details}")
    selected_predictors = list(plan["selectedPredictors"])
    modeling_df = _modeling_frame(df, selected_predictors)

    adequacy = data_adequacy_report(
        df,
        minimum_total_participants=args.minimum_total_participants,
        minimum_positive_participants=args.minimum_positive_participants,
        minimum_negative_participants=args.minimum_negative_participants,
        sample_size_justification=args.sample_size_justification,
        training_data_type=args.training_data_type,
    )
    adequacy["cohortAudit"] = cohort_audit
    adequacy["modelPlan"] = plan
    adequacy["modelFittingAuthorized"] = bool(args.model_fitting_authorized)
    adequacy_path = args.adequacy_json or args.output_json.with_name(
        f"{args.output_json.stem}.adequacy.json"
    )
    adequacy_path.parent.mkdir(parents=True, exist_ok=True)
    adequacy_path.write_text(json.dumps(adequacy, indent=2) + "\n", encoding="utf-8")

    if not args.model_fitting_authorized:
        raise SystemExit(
            f"ACL model fitting is locked. Review the readiness report and pass --model-fitting-authorized only under a pre-specified protocol. Report: {adequacy_path}"
        )
    if not adequacy["passed"]:
        raise SystemExit(
            f"ACL data adequacy minimums were not met. Report: {adequacy_path}"
        )
    if args.bootstrap_samples < 100:
        raise SystemExit("--bootstrap-samples must be at least 100")

    with TemporaryDirectory(prefix="acl-modeling-") as directory:
        modeling_input = Path(directory) / "acl-frozen-modeling-input.csv"
        modeling_df.to_csv(modeling_input, index=False)
        benchmark_acl(
            modeling_input,
            args.output_json,
            args.output_model,
            bootstrap_samples=args.bootstrap_samples,
        )

    # The exposure itself is represented as E in the hazard equation and is not
    # duplicated as a covariate even if a future fixed-horizon plan includes it.
    hazard_features = [
        feature
        for feature in selected_predictors
        if feature != "sport_exposure_hours_28d"
    ]
    hazard = grouped_hazard_evaluation(
        df,
        features=hazard_features,
        target=TARGET,
        group=GROUP,
        exposure_column="sport_exposure_hours_28d",
        l2_penalty=args.hazard_l2_penalty,
    )
    report = json.loads(args.output_json.read_text(encoding="utf-8"))
    actual_features = list(report["features"])
    if set(actual_features) != set(selected_predictors):
        raise RuntimeError(
            "ACL benchmark feature set diverged from the frozen model plan. "
            f"planned={selected_predictors!r}, actual={actual_features!r}"
        )
    report["trainingAuthorization"] = {
        "trainingDataType": args.training_data_type,
        "modelFittingAuthorized": True,
        "adequacyReportPath": str(adequacy_path),
        "preSpecifiedMinimums": adequacy["preSpecifiedMinimums"],
        "observed": adequacy["observed"],
        "sampleSizeJustification": adequacy["sampleSizeJustification"],
    }
    report["modelPlan"] = plan
    report["exposureAdjustedHazardModel"] = hazard
    report["provenance"]["sourceInputSha256"] = source_sha256
    report["provenance"]["modelPlanSha256"] = plan["planSha256"]
    report["deploymentGate"]["eligibleForUserFacingAclProbability"] = False
    report["deploymentGate"]["clinicalProbabilityLockedEvenWhenInternalModelsFit"] = True
    args.output_json.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
