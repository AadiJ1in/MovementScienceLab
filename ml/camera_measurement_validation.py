from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

PARTICIPANT = "participant_id"
SESSION = "session_id"
METRIC = "metric_name"
SIDE = "side"
WEBCAM = "webcam_deg"
REFERENCE = "reference_deg"
VERSION = "camera_measurement_version"
MIN_PARTICIPANTS = 10
OPTIONAL_STRATA = ("device_model", "capture_condition", "resolution", "distance_bin")


def _finite(values: Iterable[float]) -> np.ndarray:
    array = np.asarray(list(values), dtype=float)
    return array[np.isfinite(array)]


def bland_altman(x: np.ndarray, y: np.ndarray) -> dict[str, float | int | None]:
    if len(x) != len(y) or len(x) < 2:
        raise ValueError("Bland-Altman analysis requires paired arrays with at least two observations.")
    differences = x - y
    bias = float(np.mean(differences))
    sd = float(np.std(differences, ddof=1))
    return {
        "nPairs": int(len(x)),
        "biasDeg": bias,
        "sdDifferenceDeg": sd,
        "lower95LimitOfAgreementDeg": bias - 1.96 * sd,
        "upper95LimitOfAgreementDeg": bias + 1.96 * sd,
        "meanAbsoluteErrorDeg": float(np.mean(np.abs(differences))),
        "rmseDeg": float(np.sqrt(np.mean(np.square(differences)))),
        "pearsonR": (
            float(np.corrcoef(x, y)[0, 1])
            if len(x) >= 3 and np.std(x) > 0 and np.std(y) > 0
            else None
        ),
    }


def icc_absolute_agreement(matrix: np.ndarray) -> dict[str, float | int | None]:
    """Two-way random-effects absolute-agreement ICC(A,1).

    Rows are participants and columns are repeated sessions/raters. The input
    must be complete and balanced. Formula follows the standard ANOVA form:
    (MSR-MSE)/(MSR+(k-1)MSE+k(MSC-MSE)/n).
    """
    matrix = np.asarray(matrix, dtype=float)
    if matrix.ndim != 2:
        raise ValueError("ICC input must be a 2D participant-by-session matrix.")
    n, k = matrix.shape
    if n < 2 or k < 2 or not np.isfinite(matrix).all():
        raise ValueError("ICC requires at least two complete participants and two complete sessions.")

    grand = float(np.mean(matrix))
    row_means = np.mean(matrix, axis=1)
    column_means = np.mean(matrix, axis=0)
    ss_rows = k * float(np.sum((row_means - grand) ** 2))
    ss_columns = n * float(np.sum((column_means - grand) ** 2))
    residuals = matrix - row_means[:, None] - column_means[None, :] + grand
    ss_error = float(np.sum(residuals**2))

    ms_rows = ss_rows / (n - 1)
    ms_columns = ss_columns / (k - 1)
    ms_error = ss_error / ((n - 1) * (k - 1))
    denominator = ms_rows + (k - 1) * ms_error + (k * (ms_columns - ms_error) / n)
    icc = (ms_rows - ms_error) / denominator if denominator != 0 else math.nan
    sem = math.sqrt(max(ms_error, 0.0))
    mdc95 = 1.96 * math.sqrt(2.0) * sem
    return {
        "nParticipants": int(n),
        "nSessions": int(k),
        "iccA1": None if not math.isfinite(icc) else float(icc),
        "msParticipant": float(ms_rows),
        "msSession": float(ms_columns),
        "msResidual": float(ms_error),
        "semAgreementDeg": float(sem),
        "mdc95Deg": float(mdc95),
        "semFormula": "sqrt(two-way ANOVA residual mean square)",
        "mdc95Formula": "1.96 * sqrt(2) * SEM",
    }


def participant_cluster_bootstrap_agreement(
    x: np.ndarray,
    y: np.ndarray,
    participants: np.ndarray,
    *,
    samples: int = 500,
    seed: int = 42,
) -> dict[str, Any]:
    unique = np.unique(participants)
    if len(unique) < 3:
        return {"status": "insufficient-participants", "nParticipants": int(len(unique))}
    rng = np.random.default_rng(seed)
    bias_values: list[float] = []
    mae_values: list[float] = []
    rmse_values: list[float] = []
    for _ in range(samples):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        indices = np.concatenate([np.flatnonzero(participants == participant) for participant in sampled])
        differences = x[indices] - y[indices]
        bias_values.append(float(np.mean(differences)))
        mae_values.append(float(np.mean(np.abs(differences))))
        rmse_values.append(float(np.sqrt(np.mean(np.square(differences)))))

    def interval(values: list[float]) -> dict[str, float | int]:
        return {
            "lower95": float(np.quantile(values, 0.025)),
            "upper95": float(np.quantile(values, 0.975)),
            "bootstrapSamples": int(len(values)),
        }

    return {
        "status": "reported",
        "nParticipants": int(len(unique)),
        "biasDeg": interval(bias_values),
        "meanAbsoluteErrorDeg": interval(mae_values),
        "rmseDeg": interval(rmse_values),
    }


def validate_measurement_dataset(df: pd.DataFrame) -> dict[str, Any]:
    required = {PARTICIPANT, SESSION, METRIC, SIDE, WEBCAM, VERSION}
    missing = sorted(required - set(df.columns))
    errors: list[str] = []
    warnings: list[str] = []
    if missing:
        errors.append("Missing required columns: " + ", ".join(missing))
        return {"passed": False, "errors": errors, "warnings": warnings}

    for column in (PARTICIPANT, SESSION, METRIC, SIDE, VERSION):
        values = df[column].astype("string")
        if values.isna().any() or (values.str.len() == 0).any():
            errors.append(f"{column} cannot be missing or empty.")

    webcam = pd.to_numeric(df[WEBCAM], errors="coerce")
    if webcam.isna().any() or not np.isfinite(webcam.to_numpy()).all():
        errors.append("webcam_deg must contain finite numeric measurements.")

    versions = df[VERSION].dropna().astype(str).unique().tolist()
    if len(versions) != 1:
        errors.append(
            "A measurement-validation report must use one camera_measurement_version. Split version changes into separate reports."
        )

    if REFERENCE not in df.columns:
        warnings.append(
            "reference_deg is absent; this dataset can estimate repeatability but not criterion/reference agreement."
        )
    else:
        provided_reference = pd.to_numeric(df[REFERENCE], errors="coerce")
        if provided_reference.notna().sum() == 0:
            warnings.append(
                "reference_deg contains no usable values; criterion/reference agreement will be unavailable."
            )

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "cameraMeasurementVersion": versions[0] if len(versions) == 1 else None,
        "nRows": int(len(df)),
        "nParticipants": int(df[PARTICIPANT].nunique()) if PARTICIPANT in df else 0,
    }


def _session_summary(group: pd.DataFrame) -> pd.DataFrame:
    return (
        group.groupby([PARTICIPANT, SESSION], as_index=False)[WEBCAM]
        .median()
        .rename(columns={WEBCAM: "sessionMedianDeg"})
    )


def repeatability_report(
    group: pd.DataFrame,
    *,
    session_a: str | None,
    session_b: str | None,
) -> dict[str, Any]:
    summary = _session_summary(group)
    sessions = sorted(summary[SESSION].astype(str).unique().tolist())
    if len(sessions) < 2:
        return {
            "status": "insufficient-sessions",
            "nSessions": len(sessions),
            "availableSessions": sessions,
        }

    chosen_a = session_a
    chosen_b = session_b
    if chosen_a is None or chosen_b is None:
        if len(sessions) != 2:
            return {
                "status": "session-pair-required",
                "availableSessions": sessions,
                "reason": "More than two sessions are present; specify the intended test-retest pair rather than selecting one implicitly.",
            }
        chosen_a, chosen_b = sessions

    if chosen_a == chosen_b or chosen_a not in sessions or chosen_b not in sessions:
        return {
            "status": "invalid-session-pair",
            "availableSessions": sessions,
            "requested": [chosen_a, chosen_b],
        }

    pair = summary[summary[SESSION].astype(str).isin([chosen_a, chosen_b])].copy()
    pivot = pair.pivot(index=PARTICIPANT, columns=SESSION, values="sessionMedianDeg")
    if chosen_a not in pivot.columns or chosen_b not in pivot.columns:
        return {"status": "insufficient-paired-data", "requested": [chosen_a, chosen_b]}
    paired = pivot[[chosen_a, chosen_b]].dropna()
    if len(paired) < MIN_PARTICIPANTS:
        return {
            "status": "insufficient-participants",
            "nPairedParticipants": int(len(paired)),
            "minimumParticipants": MIN_PARTICIPANTS,
            "sessionPair": [chosen_a, chosen_b],
        }

    session_values = paired.to_numpy(dtype=float)
    agreement = bland_altman(session_values[:, 0], session_values[:, 1])
    icc = icc_absolute_agreement(session_values)
    return {
        "status": "reported",
        "sessionPair": [chosen_a, chosen_b],
        "aggregation": "median webcam_deg per participant/session",
        "repeatability": agreement,
        "icc": icc,
    }


def criterion_agreement_report(group: pd.DataFrame, *, bootstrap_samples: int) -> dict[str, Any]:
    if REFERENCE not in group.columns:
        return {"status": "reference-unavailable"}
    paired = group.copy()
    paired[REFERENCE] = pd.to_numeric(paired[REFERENCE], errors="coerce")
    paired[WEBCAM] = pd.to_numeric(paired[WEBCAM], errors="coerce")
    paired = paired.dropna(subset=[REFERENCE, WEBCAM])
    if paired.empty:
        return {"status": "reference-unavailable"}

    # Aggregate repeated frames/trials before agreement analysis so one
    # participant-session with many rows does not dominate the result.
    paired = (
        paired.groupby([PARTICIPANT, SESSION], as_index=False)[[WEBCAM, REFERENCE]]
        .median()
    )
    n_participants = int(paired[PARTICIPANT].nunique())
    if n_participants < MIN_PARTICIPANTS:
        return {
            "status": "insufficient-participants",
            "nParticipants": n_participants,
            "minimumParticipants": MIN_PARTICIPANTS,
        }

    x = paired[WEBCAM].to_numpy(dtype=float)
    y = paired[REFERENCE].to_numpy(dtype=float)
    participants = paired[PARTICIPANT].astype(str).to_numpy()
    return {
        "status": "reported",
        "aggregation": "median paired webcam/reference value per participant/session",
        "agreement": bland_altman(x, y),
        "participantClusterUncertainty": participant_cluster_bootstrap_agreement(
            x,
            y,
            participants,
            samples=bootstrap_samples,
        ),
    }


def _condition_reports(group: pd.DataFrame, *, bootstrap_samples: int) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for column in OPTIONAL_STRATA:
        if column not in group.columns:
            continue
        strata: dict[str, Any] = {}
        values = group[column].astype("string").fillna("missing")
        for value in sorted(values.unique().tolist()):
            subset = group.loc[(values == value).to_numpy()].copy()
            n_participants = int(subset[PARTICIPANT].nunique())
            if n_participants < MIN_PARTICIPANTS:
                strata[str(value)] = {
                    "status": "insufficient-participants",
                    "nParticipants": n_participants,
                    "nRows": int(len(subset)),
                }
                continue
            strata[str(value)] = {
                "status": "reported",
                "nParticipants": n_participants,
                "nRows": int(len(subset)),
                "criterionAgreement": criterion_agreement_report(
                    subset,
                    bootstrap_samples=bootstrap_samples,
                ),
            }
        report[column] = strata
    return report


def build_measurement_validation_report(
    df: pd.DataFrame,
    *,
    session_a: str | None = None,
    session_b: str | None = None,
    bootstrap_samples: int = 500,
) -> dict[str, Any]:
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")
    audit = validate_measurement_dataset(df)
    if not audit["passed"]:
        raise ValueError("Measurement-validation dataset failed: " + "; ".join(audit["errors"]))

    metric_reports: dict[str, Any] = {}
    for (metric, side), group in df.groupby([METRIC, SIDE], dropna=False):
        key = f"{metric}::{side}"
        metric_reports[key] = {
            "metricName": str(metric),
            "side": str(side),
            "nRows": int(len(group)),
            "nParticipants": int(group[PARTICIPANT].nunique()),
            "repeatability": repeatability_report(
                group,
                session_a=session_a,
                session_b=session_b,
            ),
            "criterionAgreement": criterion_agreement_report(
                group,
                bootstrap_samples=bootstrap_samples,
            ),
            "conditionReports": _condition_reports(
                group,
                bootstrap_samples=bootstrap_samples,
            ),
        }

    return {
        "schemaVersion": "1.0.0",
        "reportType": "camera-measurement-validation",
        "cameraMeasurementVersion": audit["cameraMeasurementVersion"],
        "datasetAudit": audit,
        "metrics": metric_reports,
        "interpretation": {
            "twoDimensionalMeasure": True,
            "equivalentToThreeDimensionalBiomechanics": False,
            "automaticClinicalPassThresholdApplied": False,
            "note": (
                "Agreement, repeatability, and measurement error are reported descriptively. "
                "Clinical acceptability limits must be pre-specified for the intended measurement and use case rather than invented after seeing the results."
            ),
        },
        "productGate": {
            "eligibleForInjuryDiagnosis": False,
            "eligibleForUserFacingInjuryProbability": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quantify repeatability and reference agreement for versioned webcam-derived biomechanics."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--session-a", default=None)
    parser.add_argument("--session-b", default=None)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    args = parser.parse_args()
    df = pd.read_csv(args.input_csv)
    report = build_measurement_validation_report(
        df,
        session_a=args.session_a,
        session_b=args.session_b,
        bootstrap_samples=args.bootstrap_samples,
    )
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
