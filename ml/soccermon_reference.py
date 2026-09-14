from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from prospective_cohort_audit import audit_csv
from prospective_data_adequacy import audit_csv as audit_data_adequacy_csv
from prospective_injury_benchmark import (
    GROUP,
    RANDOM_SEED,
    TARGET,
    _final_research_model,
    cluster_bootstrap_intervals,
    nested_grouped_evaluation,
    subgroup_audit,
)

REFERENCE_FEATURE_DOMAINS: dict[str, tuple[str, ...]] = {
    "history": (
        "previous_injury_count",
        "days_since_last_injury",
    ),
    "symptoms_readiness": (
        "soreness_score",
        "sleep_quality_score",
        "readiness_score",
    ),
    "training_exposure": (
        "session_rpe_load_7d",
        "session_rpe_load_28d",
    ),
}

REQUIRED_SOCCERMON_FILES = {
    "daily_load": ("daily_load.csv",),
    "readiness": ("readiness.csv",),
    "sleep_quality": ("sleep_quality.csv",),
    "soreness": ("soreness.csv",),
    "injury": ("injury.csv", "injuries.csv"),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _find_file(root: Path, candidates: tuple[str, ...]) -> Path:
    matches: list[Path] = []
    candidate_names = {name.lower() for name in candidates}
    for path in root.rglob("*"):
        if path.is_file() and path.name.lower() in candidate_names:
            matches.append(path)
    if not matches:
        raise FileNotFoundError(
            f"Could not find any of {', '.join(candidates)} under {root}."
        )
    if len(matches) > 1:
        exact = [path for path in matches if path.name.lower() == candidates[0].lower()]
        if len(exact) == 1:
            return exact[0]
        raise ValueError(
            f"Multiple candidate files found for {candidates}: "
            + ", ".join(str(path) for path in matches)
        )
    return matches[0]


def locate_soccermon_subjective_files(root: Path) -> dict[str, Path]:
    return {
        key: _find_file(root, candidates)
        for key, candidates in REQUIRED_SOCCERMON_FILES.items()
    }


def _parse_dates(values: pd.Series, field: str) -> pd.Series:
    parsed = pd.to_datetime(values, errors="coerce", dayfirst=True, utc=True)
    if parsed.isna().any():
        fallback = pd.to_datetime(values, errors="coerce", utc=True)
        parsed = parsed.fillna(fallback)
    if parsed.isna().any():
        raise ValueError(
            f"{field} contains {int(parsed.isna().sum())} missing or unparseable dates."
        )
    return parsed


def read_daily_wide(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if df.shape[1] < 2:
        raise ValueError(f"{path} must contain one date column and at least one player column.")
    date_column = str(df.columns[0])
    dates = _parse_dates(df[date_column], f"{path.name}:{date_column}").dt.normalize()
    values = df.drop(columns=[date_column]).copy()
    values.index = dates
    values = values.apply(pd.to_numeric, errors="coerce")
    if values.index.duplicated().any():
        values = values.groupby(level=0).median()
    return values.sort_index()


def read_injuries(path: Path, *, injury_type_contains: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(path)
    aliases = {
        "participant_id": ("player_name", "player", "participant_id", "name"),
        "timestamp": ("timestamp", "time", "date", "datetime"),
        "injury_type": ("type", "injury_type", "location", "injury"),
    }
    resolved: dict[str, str] = {}
    lower = {str(column).lower(): str(column) for column in df.columns}
    for target, options in aliases.items():
        for option in options:
            if option.lower() in lower:
                resolved[target] = lower[option.lower()]
                break
        if target != "injury_type" and target not in resolved:
            raise ValueError(
                f"{path} is missing a recognizable {target} column. Columns: {list(df.columns)}"
            )

    result = pd.DataFrame(
        {
            "participant_id": df[resolved["participant_id"]].astype(str),
            "injury_event_time": _parse_dates(
                df[resolved["timestamp"]], f"{path.name}:{resolved['timestamp']}"
            ),
            "injury_type": (
                df[resolved["injury_type"]].astype(str)
                if "injury_type" in resolved
                else "unspecified"
            ),
        }
    )
    result["source_row"] = np.arange(len(result), dtype=int)

    if injury_type_contains:
        needle = injury_type_contains.strip().lower()
        result = result[
            result["injury_type"].str.lower().str.contains(needle, na=False)
        ].copy()

    result["outcome_event_id"] = result.apply(
        lambda row: hashlib.sha256(
            (
                f"{row['participant_id']}|{row['injury_event_time'].isoformat()}|"
                f"{row['injury_type']}|{row['source_row']}"
            ).encode("utf-8")
        ).hexdigest(),
        axis=1,
    )
    return result.sort_values(["participant_id", "injury_event_time", "source_row"])


def _window_sum(series: pd.Series, end_date: pd.Timestamp, days: int) -> float | None:
    start_date = end_date - pd.Timedelta(days=days - 1)
    window = series.loc[(series.index >= start_date) & (series.index <= end_date)].dropna()
    if window.empty:
        return None
    return float(window.sum())


def _latest_value(
    series: pd.Series,
    end_date: pd.Timestamp,
    *,
    lookback_days: int,
) -> float | None:
    start_date = end_date - pd.Timedelta(days=lookback_days - 1)
    window = series.loc[(series.index >= start_date) & (series.index <= end_date)].dropna()
    if window.empty:
        return None
    return float(window.iloc[-1])


def _participant_site(participant_id: str) -> str:
    # The official SoccerMon loader derives team name from the first five
    # characters of anonymized player IDs (TeamA / TeamB).
    prefix = participant_id[:5]
    return prefix if prefix in {"TeamA", "TeamB"} else "unknown"


def build_soccermon_prospective_cohort(
    subjective_root: Path,
    *,
    horizon_days: int,
    stride_days: int | None = None,
    wellness_lookback_days: int = 3,
    injury_type_contains: str | None = None,
    allow_overlapping_windows: bool = False,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    if horizon_days <= 0:
        raise ValueError("horizon_days must be positive.")
    stride = horizon_days if stride_days is None else int(stride_days)
    if stride <= 0:
        raise ValueError("stride_days must be positive.")
    if stride < horizon_days and not allow_overlapping_windows:
        raise ValueError(
            "stride_days is shorter than horizon_days, which creates overlapping future windows. "
            "Use allow_overlapping_windows only for a pre-specified repeated-risk design."
        )
    if wellness_lookback_days <= 0:
        raise ValueError("wellness_lookback_days must be positive.")

    paths = locate_soccermon_subjective_files(subjective_root)
    daily_load = read_daily_wide(paths["daily_load"])
    readiness = read_daily_wide(paths["readiness"])
    sleep_quality = read_daily_wide(paths["sleep_quality"])
    soreness = read_daily_wide(paths["soreness"])
    injuries = read_injuries(
        paths["injury"], injury_type_contains=injury_type_contains
    )

    daily_tables = {
        "daily_load": daily_load,
        "readiness": readiness,
        "sleep_quality": sleep_quality,
        "soreness": soreness,
    }
    common_players = set.intersection(
        *(set(table.columns.astype(str)) for table in daily_tables.values())
    )
    if not common_players:
        raise ValueError("No player IDs are shared across required SoccerMon daily files.")

    rows: list[dict[str, Any]] = []
    participants_without_injury = 0
    for participant_id in sorted(common_players):
        participant_tables = {
            name: table[participant_id].copy()
            for name, table in daily_tables.items()
        }
        first_date = max(
            series.index.min() for series in participant_tables.values()
        )
        last_date = min(
            series.index.max() for series in participant_tables.values()
        )
        if pd.isna(first_date) or pd.isna(last_date):
            continue

        # Require at least 28 prior calendar days for the longest exposure window.
        risk_start = pd.Timestamp(first_date) + pd.Timedelta(days=28)
        latest_risk_start = pd.Timestamp(last_date) - pd.Timedelta(days=horizon_days - 1)
        if risk_start > latest_risk_start:
            continue

        participant_injuries = injuries[
            injuries["participant_id"] == participant_id
        ].copy()
        if participant_injuries.empty:
            participants_without_injury += 1

        for risk_start_date in pd.date_range(
            risk_start,
            latest_risk_start,
            freq=f"{stride}D",
            tz="UTC",
        ):
            feature_end_date = risk_start_date - pd.Timedelta(days=1)
            # Index is the final second before the first future-risk day. Daily
            # predictors are allowed only through feature_end_date.
            index_time = risk_start_date - pd.Timedelta(seconds=1)
            feature_cutoff_time = index_time
            outcome_window_end = index_time + pd.Timedelta(days=horizon_days)

            prior_injuries = participant_injuries[
                participant_injuries["injury_event_time"] <= index_time
            ]
            future_injuries = participant_injuries[
                (participant_injuries["injury_event_time"] > index_time)
                & (participant_injuries["injury_event_time"] <= outcome_window_end)
            ]
            first_future = (
                None if future_injuries.empty else future_injuries.iloc[0]
            )
            last_injury_time = (
                None if prior_injuries.empty else prior_injuries.iloc[-1]["injury_event_time"]
            )
            days_since_last = (
                None
                if last_injury_time is None
                else float((index_time - last_injury_time).total_seconds() / 86400.0)
            )

            row: dict[str, Any] = {
                GROUP: participant_id,
                TARGET: int(first_future is not None),
                "index_time": index_time.isoformat(),
                "feature_cutoff_time": feature_cutoff_time.isoformat(),
                "outcome_window_end": outcome_window_end.isoformat(),
                "injury_event_time": (
                    None
                    if first_future is None
                    else pd.Timestamp(first_future["injury_event_time"]).isoformat()
                ),
                "outcome_event_id": (
                    None if first_future is None else str(first_future["outcome_event_id"])
                ),
                "previous_injury_count": int(len(prior_injuries)),
                "days_since_last_injury": days_since_last,
                "session_rpe_load_7d": _window_sum(
                    participant_tables["daily_load"], feature_end_date, 7
                ),
                "session_rpe_load_28d": _window_sum(
                    participant_tables["daily_load"], feature_end_date, 28
                ),
                "soreness_score": _latest_value(
                    participant_tables["soreness"],
                    feature_end_date,
                    lookback_days=wellness_lookback_days,
                ),
                "sleep_quality_score": _latest_value(
                    participant_tables["sleep_quality"],
                    feature_end_date,
                    lookback_days=wellness_lookback_days,
                ),
                "readiness_score": _latest_value(
                    participant_tables["readiness"],
                    feature_end_date,
                    lookback_days=wellness_lookback_days,
                ),
                "site_id": _participant_site(participant_id),
                "sport": "soccer",
                "sex": "female",
                "source_dataset": "SoccerMon",
            }
            rows.append(row)

    cohort = pd.DataFrame(rows)
    if cohort.empty:
        raise ValueError("No eligible prospective prediction rows were generated.")

    cohort = cohort.sort_values([GROUP, "index_time"]).reset_index(drop=True)
    source_hashes = {name: _sha256(path) for name, path in paths.items()}
    report = {
        "schemaVersion": "1.0.0",
        "sourceDataset": "SoccerMon",
        "sourceLicense": "CC BY 4.0",
        "sourceRecord": "https://zenodo.org/records/10033832",
        "sourceFiles": {name: str(path) for name, path in paths.items()},
        "sourceFileSha256": source_hashes,
        "horizonDays": int(horizon_days),
        "strideDays": int(stride),
        "wellnessLookbackDays": int(wellness_lookback_days),
        "injuryTypeContains": injury_type_contains,
        "allowOverlappingWindows": bool(allow_overlapping_windows),
        "featureTimingRule": (
            "All daily predictor values end on the calendar day before the future-risk period. "
            "The prediction index is the final second before that risk period begins."
        ),
        "nRows": int(len(cohort)),
        "nParticipants": int(cohort[GROUP].nunique()),
        "nPositiveRows": int(cohort[TARGET].sum()),
        "nNegativeRows": int((cohort[TARGET] == 0).sum()),
        "participantsWithoutRecordedInjury": int(participants_without_injury),
        "siteCounts": {
            str(site): int(count)
            for site, count in cohort.groupby("site_id")[GROUP].nunique().items()
        },
        "note": (
            "This adapter creates a non-camera reference cohort. It does not validate Movement Science Lab camera features "
            "and must not be used to claim webcam injury-prediction performance."
        ),
    }
    return cohort, report


def reference_features(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    features: list[str] = []
    domains: list[str] = []
    for domain, candidates in REFERENCE_FEATURE_DOMAINS.items():
        present = [feature for feature in candidates if feature in df.columns]
        if present:
            domains.append(domain)
            features.extend(present)
    if len(domains) < 3:
        raise ValueError(
            "SoccerMon reference benchmark requires history, symptoms/readiness, and training-exposure domains. "
            f"Present: {', '.join(domains) or 'none'}."
        )
    return features, domains


def site_information(df: pd.DataFrame) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for site, group in df.groupby("site_id"):
        participant_outcomes = group.groupby(GROUP)[TARGET].max().astype(int)
        report[str(site)] = {
            "nRows": int(len(group)),
            "nParticipants": int(group[GROUP].nunique()),
            "nParticipantsWithAtLeastOnePositiveWindow": int(participant_outcomes.sum()),
            "nPositiveRows": int(group[TARGET].sum()),
            "prevalencePerPredictionWindow": float(group[TARGET].mean()),
        }
    return report


def run_soccermon_reference_benchmark(
    cohort_csv: Path,
    output_json: Path,
    output_model: Path,
    *,
    horizon_days: int,
    minimum_total_participants: int,
    minimum_positive_participants: int,
    minimum_negative_participants: int,
    sample_size_justification: str,
    bootstrap_samples: int = 500,
    allow_overlapping_windows: bool = False,
) -> dict[str, Any]:
    cohort_audit = audit_csv(
        cohort_csv,
        horizon_days=horizon_days,
        allow_overlapping_windows=allow_overlapping_windows,
    )
    if not cohort_audit["passed"]:
        raise ValueError(
            "Prospective cohort audit failed: " + "; ".join(cohort_audit["errors"])
        )

    adequacy = audit_data_adequacy_csv(
        cohort_csv,
        minimum_total_participants=minimum_total_participants,
        minimum_positive_participants=minimum_positive_participants,
        minimum_negative_participants=minimum_negative_participants,
        sample_size_justification=sample_size_justification,
    )
    if not adequacy["passed"]:
        raise ValueError(
            "Data-adequacy audit failed: " + "; ".join(adequacy["errors"])
        )

    df = pd.read_csv(cohort_csv)
    features, domains = reference_features(df)
    X = df[features]
    y = df[TARGET].astype(int).to_numpy()
    groups = df[GROUP].astype(str).to_numpy()

    nested = nested_grouped_evaluation(X, y, groups, features)
    intervals = cluster_bootstrap_intervals(
        y,
        nested["probabilities"],
        nested["predictions"],
        groups,
        samples=bootstrap_samples,
    )
    subgroups = subgroup_audit(
        df,
        y,
        nested["probabilities"],
        nested["predictions"],
        groups,
    )
    model_name, final_model, calibrator, threshold, development_candidates = _final_research_model(
        X, y, groups, features
    )

    output_model.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": final_model,
            "calibrator": calibrator,
            "threshold": threshold,
            "features": features,
            "sourceDataset": "SoccerMon",
            "researchOnly": True,
            "cameraFeaturesPresent": False,
            "eligibleForUserFacingInjuryProbability": False,
            "role": "non-camera-reference-research-model",
        },
        output_model,
    )

    report = {
        "schemaVersion": "1.0.0",
        "reportType": "soccermon-noncamera-prospective-reference-benchmark",
        "validationClaim": "open-dataset-internal-reference-only",
        "sourceDataset": "SoccerMon",
        "sourceDatasetCitation": "Midoglu et al., Scientific Data 2024, DOI 10.1038/s41597-024-03386-x",
        "sourceLicense": "CC BY 4.0",
        "outcome": {
            "label": TARGET,
            "horizonDays": int(horizon_days),
            "note": "Outcome meaning is determined by the cohort adapter injury filter and must be described in the research protocol.",
        },
        "features": features,
        "featureDomains": domains,
        "cameraFeaturesPresent": False,
        "validation": {
            "splitUnit": "participant",
            "nestedEvaluation": True,
            "nOuterFolds": nested["nOuterFolds"],
            "metrics": nested["metrics"],
            "confidenceIntervals": intervals,
            "foldReports": nested["folds"],
            "selectedModelFrequency": nested["selectedModelFrequency"],
            "subgroupAudit": subgroups,
            "siteInformation": site_information(df),
            "independentExternalValidation": False,
        },
        "finalResearchModel": {
            "modelFamily": model_name,
            "threshold": float(threshold),
            "candidateDevelopmentMetrics": development_candidates,
            "note": "Fit on all reference-cohort rows after nested evaluation; not an independent validation result.",
        },
        "cohortAudit": cohort_audit,
        "dataAdequacy": adequacy,
        "provenance": {
            "cohortCsvSha256": _sha256(cohort_csv),
            "randomSeed": RANDOM_SEED,
        },
        "scientificInterpretation": (
            "This model estimates how well non-camera longitudinal monitoring variables can predict the pre-specified SoccerMon outcome. "
            "It is a reference research benchmark, not a validated clinical tool and not evidence that any predictor causes injury."
        ),
        "comparisonRole": (
            "Use as a scientific baseline architecture and data-processing benchmark. Do not compare its absolute metrics directly "
            "with a different population/outcome and call the difference camera incremental value; camera added value requires a paired same-cohort comparison."
        ),
        "productGate": {
            "eligibleForUserFacingInjuryProbability": False,
            "validatesMovementScienceLabCamera": False,
        },
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and benchmark a prospective non-camera SoccerMon injury-risk reference cohort.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build-cohort")
    build.add_argument("subjective_root", type=Path)
    build.add_argument("output_csv", type=Path)
    build.add_argument("output_metadata_json", type=Path)
    build.add_argument("--horizon-days", type=int, required=True)
    build.add_argument("--stride-days", type=int, default=None)
    build.add_argument("--wellness-lookback-days", type=int, default=3)
    build.add_argument("--injury-type-contains", default=None)
    build.add_argument("--allow-overlapping-windows", action="store_true")

    bench = subparsers.add_parser("benchmark")
    bench.add_argument("cohort_csv", type=Path)
    bench.add_argument("output_json", type=Path)
    bench.add_argument("output_model", type=Path)
    bench.add_argument("--horizon-days", type=int, required=True)
    bench.add_argument("--minimum-total-participants", type=int, required=True)
    bench.add_argument("--minimum-positive-participants", type=int, required=True)
    bench.add_argument("--minimum-negative-participants", type=int, required=True)
    bench.add_argument("--sample-size-justification", required=True)
    bench.add_argument("--bootstrap-samples", type=int, default=500)
    bench.add_argument("--allow-overlapping-windows", action="store_true")

    args = parser.parse_args()
    if args.command == "build-cohort":
        cohort, metadata = build_soccermon_prospective_cohort(
            args.subjective_root,
            horizon_days=args.horizon_days,
            stride_days=args.stride_days,
            wellness_lookback_days=args.wellness_lookback_days,
            injury_type_contains=args.injury_type_contains,
            allow_overlapping_windows=args.allow_overlapping_windows,
        )
        args.output_csv.parent.mkdir(parents=True, exist_ok=True)
        cohort.to_csv(args.output_csv, index=False)
        args.output_metadata_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_metadata_json.write_text(
            json.dumps(metadata, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
    else:
        run_soccermon_reference_benchmark(
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


if __name__ == "__main__":
    main()
