from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import pandas as pd

REQUIRED_TEMPORAL_COLUMNS = (
    "participant_id",
    "index_time",
    "feature_cutoff_time",
    "outcome_window_end",
    "injury_within_horizon",
)
OPTIONAL_EVENT_TIME = "injury_event_time"
OPTIONAL_EVENT_ID = "outcome_event_id"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_utc(series: pd.Series, name: str) -> pd.Series:
    parsed = pd.to_datetime(series, utc=True, errors="coerce")
    if parsed.isna().any():
        bad = int(parsed.isna().sum())
        raise ValueError(f"{name} contains {bad} missing or unparseable timestamps.")
    return parsed


def audit_prospective_cohort(
    df: pd.DataFrame,
    *,
    horizon_days: int,
    allow_overlapping_windows: bool = False,
) -> dict[str, Any]:
    """Audit whether cohort rows can support a prospective prediction claim.

    The audit is deliberately strict. It checks time direction directly rather
    than relying on a manual statement that features were constructed before the
    prediction index. Overlapping windows are blocked by default because one
    future event can otherwise create many strongly correlated labels.
    """
    errors: list[str] = []
    warnings: list[str] = []
    missing = [column for column in REQUIRED_TEMPORAL_COLUMNS if column not in df.columns]
    if missing:
        return {
            "passed": False,
            "errors": [f"Missing required temporal audit columns: {', '.join(missing)}"],
            "warnings": [],
            "counts": {},
        }
    if horizon_days <= 0:
        return {
            "passed": False,
            "errors": ["horizon_days must be positive."],
            "warnings": [],
            "counts": {},
        }

    participant = df["participant_id"].astype("string")
    if participant.isna().any() or (participant.str.len() == 0).any():
        errors.append("participant_id cannot be missing or empty.")

    try:
        index_time = _parse_utc(df["index_time"], "index_time")
        feature_cutoff = _parse_utc(df["feature_cutoff_time"], "feature_cutoff_time")
        window_end = _parse_utc(df["outcome_window_end"], "outcome_window_end")
    except ValueError as exc:
        return {"passed": False, "errors": [str(exc)], "warnings": [], "counts": {}}

    labels = pd.to_numeric(df["injury_within_horizon"], errors="coerce")
    if labels.isna().any() or not set(labels.astype(int).unique()).issubset({0, 1}):
        errors.append("injury_within_horizon must contain only 0/1 labels and cannot be missing.")
    labels = labels.fillna(-1).astype(int)

    post_index_features = feature_cutoff > index_time
    if post_index_features.any():
        errors.append(
            f"{int(post_index_features.sum())} rows use feature data timestamped after the prediction index time."
        )

    invalid_windows = window_end <= index_time
    if invalid_windows.any():
        errors.append(f"{int(invalid_windows.sum())} outcome windows do not end after index_time.")

    expected_end = index_time + pd.to_timedelta(horizon_days, unit="D")
    horizon_mismatch = (window_end - expected_end).abs() > pd.to_timedelta(1, unit="s")
    if horizon_mismatch.any():
        errors.append(
            f"{int(horizon_mismatch.sum())} rows have an outcome_window_end that does not match the declared {horizon_days}-day horizon."
        )

    duplicate_index_rows = pd.DataFrame(
        {"participant_id": participant, "index_time": index_time}
    ).duplicated(keep=False)
    if duplicate_index_rows.any():
        errors.append(
            f"{int(duplicate_index_rows.sum())} rows duplicate the same participant/index_time prediction opportunity."
        )

    event_time: pd.Series | None = None
    if OPTIONAL_EVENT_TIME in df.columns:
        raw_event = df[OPTIONAL_EVENT_TIME]
        event_time = pd.to_datetime(raw_event, utc=True, errors="coerce")
        provided = raw_event.notna() & (raw_event.astype("string").str.len() > 0)
        unparseable = provided & event_time.isna()
        if unparseable.any():
            errors.append(f"{int(unparseable.sum())} injury_event_time values are unparseable.")

        positive = labels == 1
        missing_positive_event = positive & event_time.isna()
        if missing_positive_event.any():
            errors.append(
                f"{int(missing_positive_event.sum())} positive rows are missing injury_event_time, so the prospective label cannot be time-verified."
            )

        valid_event = event_time.notna()
        positive_outside_window = (
            positive
            & valid_event
            & ((event_time <= index_time) | (event_time > window_end))
        )
        if positive_outside_window.any():
            errors.append(
                f"{int(positive_outside_window.sum())} positive rows have injury events outside the declared future outcome window."
            )

        negative_event_inside = (
            (labels == 0)
            & valid_event
            & (event_time > index_time)
            & (event_time <= window_end)
        )
        if negative_event_inside.any():
            errors.append(
                f"{int(negative_event_inside.sum())} negative rows contain an injury event inside the outcome window."
            )
    else:
        warnings.append(
            "injury_event_time is absent; label timing cannot be directly reconciled with the outcome window."
        )

    overlap_pairs = 0
    for _, indices in pd.DataFrame(
        {"participant": participant, "index": index_time, "end": window_end}
    ).sort_values(["participant", "index"]).groupby("participant").groups.items():
        positions = list(indices)
        for previous, current in zip(positions, positions[1:]):
            if index_time.loc[current] < window_end.loc[previous]:
                overlap_pairs += 1
    if overlap_pairs:
        message = (
            f"Detected {overlap_pairs} adjacent overlapping prediction windows within participants. "
            "Overlapping windows can reuse the same future event across multiple labels."
        )
        if allow_overlapping_windows:
            warnings.append(message + " This run explicitly allowed them and must be interpreted as repeated-risk prediction.")
        else:
            errors.append(message + " Use --allow-overlapping-windows only for a pre-specified repeated-risk design.")

    reused_event_rows = 0
    if OPTIONAL_EVENT_ID in df.columns:
        positive_events = df.loc[labels == 1, OPTIONAL_EVENT_ID].dropna().astype("string")
        duplicated = positive_events.duplicated(keep=False)
        reused_event_rows = int(duplicated.sum())
        if reused_event_rows:
            message = (
                f"{reused_event_rows} positive rows reuse an outcome_event_id, indicating the same injury contributes to multiple prediction labels."
            )
            if allow_overlapping_windows:
                warnings.append(message)
            else:
                errors.append(message)
    elif (labels == 1).any():
        warnings.append(
            "outcome_event_id is absent; repeated labeling of the same injury event cannot be directly audited."
        )

    latest_feature_lag_hours = ((index_time - feature_cutoff).dt.total_seconds() / 3600.0).clip(lower=0)
    counts = {
        "rows": int(len(df)),
        "participants": int(participant.nunique()),
        "positiveRows": int((labels == 1).sum()),
        "negativeRows": int((labels == 0).sum()),
        "overlappingAdjacentWindowPairs": overlap_pairs,
        "reusedPositiveEventRows": reused_event_rows,
    }
    timing = {
        "minimumFeatureLagHours": float(latest_feature_lag_hours.min()) if len(df) else None,
        "medianFeatureLagHours": float(latest_feature_lag_hours.median()) if len(df) else None,
        "maximumFeatureLagHours": float(latest_feature_lag_hours.max()) if len(df) else None,
        "declaredHorizonDays": int(horizon_days),
    }
    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "counts": counts,
        "timing": timing,
        "allowOverlappingWindows": bool(allow_overlapping_windows),
        "featureTimingVerifiedFromTimestamps": not post_index_features.any(),
        "outcomeTimingDirectlyVerified": event_time is not None and not event_time.loc[labels == 1].isna().any(),
    }


def audit_csv(
    input_csv: Path,
    *,
    horizon_days: int,
    allow_overlapping_windows: bool = False,
) -> dict[str, Any]:
    df = pd.read_csv(input_csv)
    report = audit_prospective_cohort(
        df,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    report["inputSha256"] = _sha256(input_csv)
    return report
