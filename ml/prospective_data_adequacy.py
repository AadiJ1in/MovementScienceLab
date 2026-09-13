from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

TARGET = "injury_within_horizon"
GROUP = "participant_id"


def audit_data_adequacy(
    df: pd.DataFrame,
    *,
    minimum_total_participants: int,
    minimum_positive_participants: int,
    minimum_negative_participants: int,
    sample_size_justification: str,
) -> dict[str, Any]:
    """Audit whether a prospective cohort meets its pre-specified sample-size floor.

    The thresholds are deliberately supplied by the study protocol rather than
    hard-coded here. This tool is an enforcement layer for an a-priori sample-size
    decision, not a substitute for formal sample-size calculation.
    """
    errors: list[str] = []
    warnings: list[str] = []

    missing = sorted({TARGET, GROUP} - set(df.columns))
    if missing:
        return {
            "passed": False,
            "errors": ["Missing required columns: " + ", ".join(missing)],
            "warnings": warnings,
        }

    for name, value in (
        ("minimum_total_participants", minimum_total_participants),
        ("minimum_positive_participants", minimum_positive_participants),
        ("minimum_negative_participants", minimum_negative_participants),
    ):
        if value <= 0:
            errors.append(f"{name} must be greater than zero.")

    if not sample_size_justification.strip():
        errors.append(
            "sample_size_justification must describe the a-priori rationale or protocol source for the thresholds."
        )

    if df[GROUP].isna().any():
        errors.append("participant_id cannot be missing.")
    if df[TARGET].isna().any():
        errors.append(f"{TARGET} cannot be missing.")

    if errors:
        return {"passed": False, "errors": errors, "warnings": warnings}

    labels = set(df[TARGET].astype(int).unique().tolist())
    if labels != {0, 1}:
        errors.append(f"{TARGET} must contain both 0 and 1.")
        return {"passed": False, "errors": errors, "warnings": warnings}

    participant_outcomes = df.groupby(GROUP, dropna=False)[TARGET].max().astype(int)
    total = int(len(participant_outcomes))
    positive = int(participant_outcomes.sum())
    negative = int((participant_outcomes == 0).sum())

    checks = {
        "totalParticipants": total >= minimum_total_participants,
        "positiveParticipants": positive >= minimum_positive_participants,
        "negativeParticipants": negative >= minimum_negative_participants,
    }

    if not checks["totalParticipants"]:
        errors.append(
            f"Observed {total} participants, below the pre-specified minimum of {minimum_total_participants}."
        )
    if not checks["positiveParticipants"]:
        errors.append(
            f"Observed {positive} participants with the outcome, below the pre-specified minimum of {minimum_positive_participants}."
        )
    if not checks["negativeParticipants"]:
        errors.append(
            f"Observed {negative} participants without the outcome, below the pre-specified minimum of {minimum_negative_participants}."
        )

    rows_per_participant = df.groupby(GROUP, dropna=False).size()
    repeated_window_participants = int((rows_per_participant > 1).sum())
    if repeated_window_participants:
        warnings.append(
            f"{repeated_window_participants} participants contribute repeated prediction windows; independence must be handled by participant-grouped validation and the cohort timing audit."
        )

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "observed": {
            "nRows": int(len(df)),
            "nParticipants": total,
            "nPositiveParticipants": positive,
            "nNegativeParticipants": negative,
            "outcomePrevalenceByParticipant": None if total == 0 else positive / total,
            "nParticipantsWithRepeatedWindows": repeated_window_participants,
        },
        "preSpecifiedMinimums": {
            "nParticipants": int(minimum_total_participants),
            "nPositiveParticipants": int(minimum_positive_participants),
            "nNegativeParticipants": int(minimum_negative_participants),
        },
        "checks": checks,
        "sampleSizeJustification": sample_size_justification.strip(),
        "interpretation": (
            "Protocol-enforcement gate only. Passing means the cohort met its pre-specified minimum information target; "
            "it does not establish model validity, clinical utility, or sufficient sample size for every intended subgroup analysis."
        ),
    }


def audit_csv(
    input_csv: Path,
    *,
    minimum_total_participants: int,
    minimum_positive_participants: int,
    minimum_negative_participants: int,
    sample_size_justification: str,
) -> dict[str, Any]:
    return audit_data_adequacy(
        pd.read_csv(input_csv),
        minimum_total_participants=minimum_total_participants,
        minimum_positive_participants=minimum_positive_participants,
        minimum_negative_participants=minimum_negative_participants,
        sample_size_justification=sample_size_justification,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enforce pre-specified participant/outcome minimums before prospective injury-model development."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--minimum-total-participants", type=int, required=True)
    parser.add_argument("--minimum-positive-participants", type=int, required=True)
    parser.add_argument("--minimum-negative-participants", type=int, required=True)
    parser.add_argument("--sample-size-justification", required=True)
    args = parser.parse_args()

    report = audit_csv(
        args.input_csv,
        minimum_total_participants=args.minimum_total_participants,
        minimum_positive_participants=args.minimum_positive_participants,
        minimum_negative_participants=args.minimum_negative_participants,
        sample_size_justification=args.sample_size_justification,
    )
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    if not report["passed"]:
        raise SystemExit("Prospective data-adequacy audit failed; see report for details.")


if __name__ == "__main__":
    main()
