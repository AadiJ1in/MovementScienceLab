from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from prospective_cohort_audit import audit_csv
from prospective_injury_benchmark import (
    GROUP,
    TARGET,
    _inner_model_selection,
    candidate_models,
    cluster_bootstrap_intervals,
    metrics,
    subgroup_audit,
    validate_dataset,
)

INDEX_TIME = "index_time"
OUTCOME_WINDOW_END = "outcome_window_end"
MIN_TEST_PARTICIPANTS = 10
MIN_TEST_POSITIVE_PARTICIPANTS = 2
MIN_TEST_NEGATIVE_PARTICIPANTS = 2


def _parse_cutoff(value: str) -> pd.Timestamp:
    parsed = pd.to_datetime(value, utc=True, errors="coerce")
    if pd.isna(parsed):
        raise ValueError("development_cutoff must be a parseable timestamp.")
    return parsed


def validate_temporal_design(df: pd.DataFrame, *, development_cutoff: pd.Timestamp) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    missing = sorted({INDEX_TIME, OUTCOME_WINDOW_END, GROUP, TARGET} - set(df.columns))
    if missing:
        return {
            "passed": False,
            "errors": ["Missing required temporal columns: " + ", ".join(missing)],
            "warnings": warnings,
        }

    index_time = pd.to_datetime(df[INDEX_TIME], utc=True, errors="coerce")
    outcome_end = pd.to_datetime(df[OUTCOME_WINDOW_END], utc=True, errors="coerce")
    if index_time.isna().any() or outcome_end.isna().any():
        errors.append("index_time and outcome_window_end must be complete parseable timestamps.")
        return {"passed": False, "errors": errors, "warnings": warnings}

    # Simulate what was actually knowable at the historical deployment cutoff.
    # Development labels must have resolved by the cutoff. Test predictions must
    # begin strictly after it.
    train_mask = (outcome_end <= development_cutoff).to_numpy()
    test_mask = (index_time > development_cutoff).to_numpy()
    gap_mask = (~train_mask & ~test_mask)

    n_train = int(train_mask.sum())
    n_test = int(test_mask.sum())
    if n_train == 0:
        errors.append("No development rows have outcome windows fully resolved by the cutoff.")
    if n_test == 0:
        errors.append("No temporal test rows begin after the development cutoff.")

    if errors:
        return {
            "passed": False,
            "errors": errors,
            "warnings": warnings,
            "developmentCutoff": development_cutoff.isoformat(),
        }

    train_y = df.loc[train_mask, TARGET].astype(int)
    test_y = df.loc[test_mask, TARGET].astype(int)
    if train_y.nunique() < 2:
        errors.append("Development period must contain both outcome classes.")
    if test_y.nunique() < 2:
        errors.append("Temporal test period must contain both outcome classes.")

    train_participants = set(df.loc[train_mask, GROUP].astype(str))
    test_participants = set(df.loc[test_mask, GROUP].astype(str))
    overlapping_participants = train_participants & test_participants

    test_participant_outcomes = df.loc[test_mask].groupby(GROUP)[TARGET].max().astype(int)
    n_test_participants = int(len(test_participant_outcomes))
    n_test_positive = int(test_participant_outcomes.sum())
    n_test_negative = int((test_participant_outcomes == 0).sum())

    if n_test_participants < MIN_TEST_PARTICIPANTS:
        errors.append(
            f"Temporal test period has {n_test_participants} participants; minimum reportable count is {MIN_TEST_PARTICIPANTS}."
        )
    if n_test_positive < MIN_TEST_POSITIVE_PARTICIPANTS:
        errors.append(
            f"Temporal test period has {n_test_positive} participants with the outcome; minimum is {MIN_TEST_POSITIVE_PARTICIPANTS}."
        )
    if n_test_negative < MIN_TEST_NEGATIVE_PARTICIPANTS:
        errors.append(
            f"Temporal test period has {n_test_negative} participants without the outcome; minimum is {MIN_TEST_NEGATIVE_PARTICIPANTS}."
        )

    if overlapping_participants:
        warnings.append(
            f"{len(overlapping_participants)} participants occur in both development and later periods. This is allowed for a deployment-like temporal stress test, but it is not participant-independent external validation."
        )
    if int(gap_mask.sum()):
        warnings.append(
            f"{int(gap_mask.sum())} rows straddle the cutoff and are excluded because their outcomes were not fully resolved by the cutoff and their prediction index was not after it."
        )

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "developmentCutoff": development_cutoff.isoformat(),
        "counts": {
            "developmentRows": n_train,
            "temporalTestRows": n_test,
            "excludedStraddlingRows": int(gap_mask.sum()),
            "developmentParticipants": int(len(train_participants)),
            "temporalTestParticipants": n_test_participants,
            "temporalTestPositiveParticipants": n_test_positive,
            "temporalTestNegativeParticipants": n_test_negative,
            "participantsSeenInBothPeriods": int(len(overlapping_participants)),
        },
        "masks": {
            "development": train_mask,
            "temporalTest": test_mask,
        },
    }


def temporal_transport_stress_test(
    df: pd.DataFrame,
    *,
    development_cutoff: pd.Timestamp,
    bootstrap_samples: int,
) -> dict[str, Any]:
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")

    features, domains = validate_dataset(df)
    design = validate_temporal_design(df, development_cutoff=development_cutoff)
    if not design["passed"]:
        raise ValueError("Temporal transport design failed: " + "; ".join(design["errors"]))

    train_mask = design["masks"]["development"]
    test_mask = design["masks"]["temporalTest"]

    X_train = df.loc[train_mask, features].reset_index(drop=True)
    y_train = df.loc[train_mask, TARGET].astype(int).to_numpy()
    groups_train = df.loc[train_mask, GROUP].astype(str).to_numpy()
    X_test = df.loc[test_mask, features].reset_index(drop=True)
    y_test = df.loc[test_mask, TARGET].astype(int).to_numpy()
    groups_test = df.loc[test_mask, GROUP].astype(str).to_numpy()

    # Model family, calibration, and decision threshold are all selected from
    # the earlier development period only. Later outcomes never influence them.
    selection = _inner_model_selection(X_train, y_train, groups_train, features)
    selected_name = str(selection["name"])
    model = candidate_models(features)[selected_name]
    model.fit(X_train, y_train)
    raw = model.predict_proba(X_test)[:, 1]
    calibrated = selection["calibrator"].predict_proba(
        np.log(np.clip(raw, 1e-6, 1 - 1e-6) / np.clip(1 - raw, 1e-6, 1 - 1e-6)).reshape(-1, 1)
    )[:, 1]
    threshold = float(selection["threshold"])
    predictions = (calibrated >= threshold).astype(int)

    temporal_metrics = metrics(
        y_test,
        calibrated,
        threshold=threshold,
        predictions=predictions,
    )
    intervals = cluster_bootstrap_intervals(
        y_test,
        calibrated,
        predictions,
        groups_test,
        samples=bootstrap_samples,
    )
    subgroups = subgroup_audit(
        df.loc[test_mask].reset_index(drop=True),
        y_test,
        calibrated,
        predictions,
        groups_test,
    )

    # Remove the internal numpy masks before serializing the design report.
    serializable_design = {key: value for key, value in design.items() if key != "masks"}

    return {
        "schemaVersion": "1.0.0",
        "reportType": "chronological-internal-transport-stress-test",
        "validationClaim": "internal-temporal-transport-stress-only",
        "externalValidation": False,
        "developmentCutoff": development_cutoff.isoformat(),
        "featureDomains": domains,
        "features": features,
        "designAudit": serializable_design,
        "selectedModel": selected_name,
        "thresholdSelectedFromEarlierPeriodOnly": threshold,
        "modelSelectionMetricsFromEarlierPeriodOnly": selection["candidates"],
        "temporalTestMetrics": temporal_metrics,
        "confidenceIntervals": intervals,
        "subgroupAuditInLaterPeriod": subgroups,
        "interpretation": (
            "The model family, calibration, and threshold were selected using only prediction rows whose outcome windows had fully resolved by the historical cutoff, then frozen and evaluated on later prediction opportunities. "
            "This measures temporal transport/drift within the same data-generating program and is not independent external validation."
        ),
        "productGate": {
            "eligibleForUserFacingInjuryProbability": False,
        },
    }


def run_temporal_transport_stress(
    input_csv: Path,
    output_json: Path,
    *,
    horizon_days: int,
    development_cutoff: str,
    allow_overlapping_windows: bool,
    bootstrap_samples: int,
) -> dict[str, Any]:
    cohort_audit = audit_csv(
        input_csv,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    if not cohort_audit["passed"]:
        raise ValueError("Prospective cohort audit failed: " + "; ".join(cohort_audit["errors"]))

    cutoff = _parse_cutoff(development_cutoff)
    df = pd.read_csv(input_csv)
    report = temporal_transport_stress_test(
        df,
        development_cutoff=cutoff,
        bootstrap_samples=bootstrap_samples,
    )
    report["cohortAudit"] = cohort_audit
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train on fully resolved earlier outcomes and evaluate frozen performance on later prediction opportunities."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--horizon-days", type=int, required=True)
    parser.add_argument("--development-cutoff", required=True)
    parser.add_argument("--allow-overlapping-windows", action="store_true")
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    run_temporal_transport_stress(
        args.input_csv,
        args.output_json,
        horizon_days=args.horizon_days,
        development_cutoff=args.development_cutoff,
        allow_overlapping_windows=args.allow_overlapping_windows,
        bootstrap_samples=args.bootstrap_samples,
    )


if __name__ == "__main__":
    main()
