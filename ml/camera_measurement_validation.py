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
WEBCAM_VALUE = "webcam_value"
REFERENCE_VALUE = "reference_value"
VERSION = "camera_measurement_version"
MIN_PARTICIPANTS = 10
OPTIONAL_STRATA = (
    "device_model",
    "resolution",
    "distance_bin",
    "capture_condition",
    "view",
    "lighting_condition",
    "clothing_occlusion_condition",
)


def _finite(values: Iterable[float]) -> np.ndarray:
    array = np.asarray(list(values), dtype=float)
    return array[np.isfinite(array)]


def normalize_measurement_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Normalize the public paired-data schema without hiding conflicting columns."""
    normalized = df.copy()
    notes: list[str] = []

    for canonical, public in ((WEBCAM, WEBCAM_VALUE), (REFERENCE, REFERENCE_VALUE)):
        if canonical in normalized.columns and public in normalized.columns:
            canonical_values = pd.to_numeric(normalized[canonical], errors="coerce")
            public_values = pd.to_numeric(normalized[public], errors="coerce")
            comparable = canonical_values.notna() & public_values.notna()
            if comparable.any() and not np.allclose(
                canonical_values[comparable].to_numpy(dtype=float),
                public_values[comparable].to_numpy(dtype=float),
                equal_nan=True,
            ):
                raise ValueError(
                    f"Both {canonical} and {public} are present but contain conflicting values."
                )
            notes.append(f"Both {canonical} and {public} were present; {canonical} was used.")
        elif canonical not in normalized.columns and public in normalized.columns:
            normalized[canonical] = normalized[public]
            notes.append(f"Normalized {public} to internal column {canonical}.")

    return normalized, notes


def bland_altman(x: np.ndarray, y: np.ndarray) -> dict[str, float | int | None]:
    if len(x) != len(y) or len(x) < 2:
        raise ValueError("Bland-Altman analysis requires paired arrays with at least two observations.")
    differences = x - y
    bias = float(np.mean(differences))
    sd = float(np.std(differences, ddof=1))
    half_span = 1.96 * sd
    return {
        "nPairs": int(len(x)),
        "biasDeg": bias,
        "sdDifferenceDeg": sd,
        "lower95LimitOfAgreementDeg": bias - half_span,
        "upper95LimitOfAgreementDeg": bias + half_span,
        "half95LimitOfAgreementSpanDeg": half_span,
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

    Rows are paired units and columns are sessions/raters/methods. The input
    must be complete and balanced. Formula follows the standard ANOVA form:
    (MSR-MSE)/(MSR+(k-1)MSE+k(MSC-MSE)/n).
    """
    matrix = np.asarray(matrix, dtype=float)
    if matrix.ndim != 2:
        raise ValueError("ICC input must be a 2D paired-unit-by-method matrix.")
    n, k = matrix.shape
    if n < 2 or k < 2 or not np.isfinite(matrix).all():
        raise ValueError("ICC requires at least two complete paired units and two methods/sessions.")

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
        "nPairedUnits": int(n),
        "nMethodsOrSessions": int(k),
        # Backward-compatible names retained for existing report readers.
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


def _interval(values: list[float], samples: int) -> dict[str, float | int] | None:
    finite = [value for value in values if math.isfinite(value)]
    if not finite:
        return None
    return {
        "lower95": float(np.quantile(finite, 0.025)),
        "upper95": float(np.quantile(finite, 0.975)),
        "bootstrapSamples": int(samples),
        "finiteBootstrapSamples": int(len(finite)),
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
    metrics: dict[str, list[float]] = {
        "biasDeg": [],
        "meanAbsoluteErrorDeg": [],
        "rmseDeg": [],
        "lower95LimitOfAgreementDeg": [],
        "upper95LimitOfAgreementDeg": [],
        "iccA1": [],
        "semAgreementDeg": [],
        "mdc95Deg": [],
    }
    for _ in range(samples):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        indices = np.concatenate(
            [np.flatnonzero(participants == participant) for participant in sampled]
        )
        bx = x[indices]
        by = y[indices]
        agreement = bland_altman(bx, by)
        metrics["biasDeg"].append(float(agreement["biasDeg"]))
        metrics["meanAbsoluteErrorDeg"].append(float(agreement["meanAbsoluteErrorDeg"]))
        metrics["rmseDeg"].append(float(agreement["rmseDeg"]))
        metrics["lower95LimitOfAgreementDeg"].append(
            float(agreement["lower95LimitOfAgreementDeg"])
        )
        metrics["upper95LimitOfAgreementDeg"].append(
            float(agreement["upper95LimitOfAgreementDeg"])
        )
        try:
            reliability = icc_absolute_agreement(np.column_stack([bx, by]))
            icc = reliability["iccA1"]
            if icc is not None:
                metrics["iccA1"].append(float(icc))
            metrics["semAgreementDeg"].append(float(reliability["semAgreementDeg"]))
            metrics["mdc95Deg"].append(float(reliability["mdc95Deg"]))
        except ValueError:
            pass

    return {
        "status": "reported",
        "nParticipants": int(len(unique)),
        **{
            name: _interval(values, samples)
            for name, values in metrics.items()
        },
    }


def validate_measurement_dataset(df: pd.DataFrame) -> dict[str, Any]:
    try:
        normalized, normalization_notes = normalize_measurement_columns(df)
    except ValueError as exc:
        return {
            "passed": False,
            "errors": [str(exc)],
            "warnings": [],
            "normalizationNotes": [],
        }

    required = {PARTICIPANT, SESSION, METRIC, SIDE, WEBCAM, VERSION}
    missing = sorted(required - set(normalized.columns))
    errors: list[str] = []
    warnings: list[str] = []
    if missing:
        errors.append("Missing required columns: " + ", ".join(missing))
        return {
            "passed": False,
            "errors": errors,
            "warnings": warnings,
            "normalizationNotes": normalization_notes,
        }

    for column in (PARTICIPANT, SESSION, METRIC, SIDE, VERSION):
        values = normalized[column].astype("string")
        if values.isna().any() or (values.str.len() == 0).any():
            errors.append(f"{column} cannot be missing or empty.")

    webcam = pd.to_numeric(normalized[WEBCAM], errors="coerce")
    if webcam.isna().any() or not np.isfinite(webcam.to_numpy()).all():
        errors.append(f"{WEBCAM_VALUE}/{WEBCAM} must contain finite numeric measurements.")

    versions = normalized[VERSION].dropna().astype(str).unique().tolist()
    if len(versions) != 1:
        errors.append(
            "A measurement-validation report must use one camera_measurement_version. "
            "Split version changes into separate reports."
        )

    if REFERENCE not in normalized.columns:
        warnings.append(
            f"{REFERENCE_VALUE}/{REFERENCE} is absent; this dataset can estimate repeatability "
            "but not criterion/reference agreement."
        )
    else:
        provided_reference = pd.to_numeric(normalized[REFERENCE], errors="coerce")
        if provided_reference.notna().sum() == 0:
            warnings.append(
                f"{REFERENCE_VALUE}/{REFERENCE} contains no usable values; "
                "criterion/reference agreement will be unavailable."
            )

    recommended_metadata = {
        "device_model",
        "resolution",
        "camera_distance",
        "capture_condition",
        "view",
    }
    missing_metadata = sorted(recommended_metadata - set(normalized.columns))
    if missing_metadata:
        warnings.append(
            "Recommended camera-condition metadata missing: " + ", ".join(missing_metadata)
        )

    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "normalizationNotes": normalization_notes,
        "cameraMeasurementVersion": versions[0] if len(versions) == 1 else None,
        "nRows": int(len(normalized)),
        "nParticipants": int(normalized[PARTICIPANT].nunique()) if PARTICIPANT in normalized else 0,
        "availableConditionFields": [
            column
            for column in (
                "device_model",
                "resolution",
                "camera_distance",
                "distance_bin",
                "capture_condition",
                "view",
                "lighting_condition",
                "clothing_occlusion_condition",
            )
            if column in normalized.columns
        ],
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
    reliability = icc_absolute_agreement(session_values)
    return {
        "status": "reported",
        "sessionPair": [chosen_a, chosen_b],
        "aggregation": "median webcam value per participant/session",
        "repeatability": agreement,
        "icc": reliability,
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
    reliability = icc_absolute_agreement(np.column_stack([x, y]))
    return {
        "status": "reported",
        "aggregation": "median paired webcam/reference value per participant/session",
        "agreement": bland_altman(x, y),
        "agreementReliability": {
            **reliability,
            "unitOfAnalysis": "participant-session paired webcam/reference measurements",
        },
        "participantClusterUncertainty": participant_cluster_bootstrap_agreement(
            x,
            y,
            participants,
            samples=bootstrap_samples,
        ),
    }


def _categorical_strata_report(
    group: pd.DataFrame,
    column: str,
    *,
    bootstrap_samples: int,
) -> dict[str, Any]:
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
    return strata


def _condition_reports(group: pd.DataFrame, *, bootstrap_samples: int) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for column in OPTIONAL_STRATA:
        if column in group.columns:
            report[column] = _categorical_strata_report(
                group,
                column,
                bootstrap_samples=bootstrap_samples,
            )

    if "camera_distance" in group.columns:
        distance = pd.to_numeric(group["camera_distance"], errors="coerce")
        finite = distance[np.isfinite(distance)]
        if not finite.empty:
            unique = sorted(float(value) for value in finite.unique())
            report["camera_distance"] = {
                "status": "descriptive-continuous",
                "nObserved": int(len(finite)),
                "minimum": float(finite.min()),
                "maximum": float(finite.max()),
                "uniqueValues": len(unique),
                "criterionAgreementByExactDistance": (
                    _categorical_strata_report(
                        group.assign(camera_distance=distance),
                        "camera_distance",
                        bootstrap_samples=bootstrap_samples,
                    )
                    if len(unique) <= 6
                    else None
                ),
                "note": (
                    "No post-hoc distance bins are invented. Supply a pre-specified distance_bin "
                    "column when categorical distance sensitivity is part of the protocol."
                ),
            }
    return report


def evaluate_protocol_acceptance(
    criterion_report: dict[str, Any],
    criteria: dict[str, Any] | None,
) -> dict[str, Any]:
    if not criteria:
        return {
            "status": "not-specified",
            "passed": None,
            "note": "No universal clinical acceptance thresholds are applied automatically.",
        }
    if criterion_report.get("status") != "reported":
        return {
            "status": "not-evaluable",
            "passed": False,
            "reason": "Reference agreement is not reportable for this metric.",
            "criteria": criteria,
        }

    agreement = criterion_report["agreement"]
    reliability = criterion_report["agreementReliability"]
    loa_span = (
        float(agreement["upper95LimitOfAgreementDeg"])
        - float(agreement["lower95LimitOfAgreementDeg"])
    )
    checks: dict[str, dict[str, Any]] = {}

    mappings = {
        "maxMaeDeg": (float(agreement["meanAbsoluteErrorDeg"]), lambda a, b: a <= b),
        "maxRmseDeg": (float(agreement["rmseDeg"]), lambda a, b: a <= b),
        "maxAbsBiasDeg": (abs(float(agreement["biasDeg"])), lambda a, b: a <= b),
        "maxLoASpanDeg": (loa_span, lambda a, b: a <= b),
        "minIccA1": (reliability.get("iccA1"), lambda a, b: a >= b),
        "maxSemDeg": (float(reliability["semAgreementDeg"]), lambda a, b: a <= b),
        "maxMdc95Deg": (float(reliability["mdc95Deg"]), lambda a, b: a <= b),
    }
    for name, threshold in criteria.items():
        if name not in mappings:
            raise ValueError(f"Unknown measurement acceptance criterion: {name}")
        observed, comparator = mappings[name]
        if observed is None or not math.isfinite(float(observed)):
            checks[name] = {
                "threshold": threshold,
                "observed": observed,
                "passed": False,
                "reason": "metric-unavailable",
            }
            continue
        checks[name] = {
            "threshold": float(threshold),
            "observed": float(observed),
            "passed": bool(comparator(float(observed), float(threshold))),
        }

    return {
        "status": "evaluated",
        "passed": bool(checks) and all(item["passed"] for item in checks.values()),
        "checks": checks,
        "note": "Criteria were supplied by the research protocol; they are not built-in clinical cutoffs.",
    }


def build_measurement_validation_report(
    df: pd.DataFrame,
    *,
    session_a: str | None = None,
    session_b: str | None = None,
    bootstrap_samples: int = 500,
    protocol_acceptance: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if bootstrap_samples < 100:
        raise ValueError("bootstrap_samples must be at least 100")
    normalized, normalization_notes = normalize_measurement_columns(df)
    audit = validate_measurement_dataset(normalized)
    if not audit["passed"]:
        raise ValueError("Measurement-validation dataset failed: " + "; ".join(audit["errors"]))
    audit["normalizationNotes"] = [
        *normalization_notes,
        *audit.get("normalizationNotes", []),
    ]

    metric_reports: dict[str, Any] = {}
    for (metric, side), group in normalized.groupby([METRIC, SIDE], dropna=False):
        key = f"{metric}::{side}"
        criterion = criterion_agreement_report(
            group,
            bootstrap_samples=bootstrap_samples,
        )
        metric_criteria = (protocol_acceptance or {}).get(str(metric))
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
            "criterionAgreement": criterion,
            "conditionReports": _condition_reports(
                group,
                bootstrap_samples=bootstrap_samples,
            ),
            "protocolAcceptance": evaluate_protocol_acceptance(
                criterion,
                metric_criteria,
            ),
        }

    return {
        "schemaVersion": "2.0.0",
        "reportType": "camera-measurement-validation",
        "cameraMeasurementVersion": audit["cameraMeasurementVersion"],
        "datasetAudit": audit,
        "metrics": metric_reports,
        "protocolAcceptanceCriteriaProvided": protocol_acceptance is not None,
        "interpretation": {
            "twoDimensionalMeasure": True,
            "equivalentToThreeDimensionalBiomechanics": False,
            "poseConfidenceEquivalentToMeasurementAccuracy": False,
            "automaticClinicalPassThresholdApplied": False,
            "note": (
                "Agreement, repeatability, and measurement error are reported separately from pose confidence. "
                "Acceptance limits must be pre-specified for the intended measurement and use case rather than invented after seeing results."
            ),
        },
        "productGate": {
            "eligibleForInjuryDiagnosis": False,
            "eligibleForUserFacingInjuryProbability": False,
        },
    }


def _load_protocol_acceptance(path: Path | None) -> dict[str, dict[str, Any]] | None:
    if path is None:
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Acceptance protocol JSON root must be an object.")
    criteria = payload.get("measurementAcceptanceCriteria")
    if not isinstance(criteria, dict):
        raise ValueError("Protocol must contain a measurementAcceptanceCriteria object.")
    return criteria


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quantify repeatability and reference agreement for versioned webcam-derived biomechanics."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--session-a", default=None)
    parser.add_argument("--session-b", default=None)
    parser.add_argument("--bootstrap-samples", type=int, default=500)
    parser.add_argument(
        "--protocol-json",
        type=Path,
        default=None,
        help="Optional pre-specified protocol containing measurementAcceptanceCriteria.",
    )
    args = parser.parse_args()
    df = pd.read_csv(args.input_csv)
    report = build_measurement_validation_report(
        df,
        session_a=args.session_a,
        session_b=args.session_b,
        bootstrap_samples=args.bootstrap_samples,
        protocol_acceptance=_load_protocol_acceptance(args.protocol_json),
    )
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
