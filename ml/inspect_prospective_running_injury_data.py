#!/usr/bin/env python3
"""Inspect the published 2026 prospective running-injury workbooks.

The public processed files contain participant-weeks but intentionally omit a direct
participant identifier. Before any prognostic validation is attempted, this script
checks whether invariant baseline/genotype fields can form conservative grouping
fingerprints. These fingerprints are for leakage prevention only; they are never
presented as recovered identities.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

LABEL_TOKENS = ("injury", "injured", "rri", "outcome", "label", "target", "status")
ID_TOKENS = ("participant", "subject", "runner", "athlete", "person", "id")
TIME_TOKENS = ("week", "date", "time", "day", "visit", "sample")


def clean(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def column_summary(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    series = frame[column]
    non_null = series.dropna()
    unique_count = int(non_null.nunique(dropna=True))
    examples = [clean(value) for value in non_null.head(5).tolist()]
    normalized = column.lower().replace("_", " ").replace("-", " ")
    return {
        "name": column,
        "dtype": str(series.dtype),
        "non_null": int(series.notna().sum()),
        "unique": unique_count,
        "examples": examples,
        "label_candidate": any(token in normalized for token in LABEL_TOKENS),
        "id_candidate": any(token in normalized for token in ID_TOKENS),
        "time_candidate": any(token in normalized for token in TIME_TOKENS),
    }


def fingerprint_diagnostics(frame: pd.DataFrame) -> dict[str, Any]:
    snps = [column for column in frame.columns if column.lower().startswith("rs")]
    strategies = {
        "snps_only": snps,
        "snps_sex": snps + (["sex"] if "sex" in frame.columns else []),
        "snps_sex_age": snps
        + (["sex"] if "sex" in frame.columns else [])
        + (["Age"] if "Age" in frame.columns else []),
    }
    diagnostics: dict[str, Any] = {}
    for name, columns in strategies.items():
        if not columns:
            continue
        normalized = frame[columns].fillna("<NA>").astype(str)
        hashes = normalized.apply(
            lambda row: hashlib.sha256("|".join(row.tolist()).encode("utf-8")).hexdigest()[:16],
            axis=1,
        )
        sizes = hashes.value_counts()
        diagnostics[name] = {
            "columns": columns,
            "unique_groups": int(hashes.nunique()),
            "min_group_rows": int(sizes.min()),
            "median_group_rows": float(sizes.median()),
            "max_group_rows": int(sizes.max()),
            "single_row_groups": int((sizes == 1).sum()),
            "groups_over_60_rows": int((sizes > 60).sum()),
        }
    return diagnostics


def inspect_workbook(path: Path) -> dict[str, Any]:
    workbook = pd.ExcelFile(path, engine="openpyxl")
    sheets: list[dict[str, Any]] = []
    for sheet_name in workbook.sheet_names:
        frame = pd.read_excel(workbook, sheet_name=sheet_name)
        frame.columns = [str(column).strip() for column in frame.columns]
        sheets.append(
            {
                "sheet": sheet_name,
                "rows": int(len(frame)),
                "columns": int(len(frame.columns)),
                "outcome": {
                    "column": "RRI" if "RRI" in frame.columns else None,
                    "positive_rows": int((frame["RRI"] == 1).sum()) if "RRI" in frame.columns else None,
                    "negative_rows": int((frame["RRI"] == 0).sum()) if "RRI" in frame.columns else None,
                },
                "fingerprint_diagnostics": fingerprint_diagnostics(frame),
                "column_summaries": [column_summary(frame, column) for column in frame.columns],
            }
        )
    return {"file": path.name, "sheets": sheets}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbooks", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    report = {
        "source": {
            "title": "Multidisciplinary prediction of running-related injuries using machine learning",
            "doi": "10.1038/s41746-026-02413-y",
            "pmid": "41652142",
            "license": "CC BY 4.0",
            "population": "142 competitive endurance runners followed prospectively for 12 months",
            "published_samples": 6181,
            "published_injury_instances": 564,
            "prediction_horizon": "information preceding each week -> RRI occurrence within that week",
            "intended_use": "prospective running-related injury research only",
            "clinical_deployment_blocked": True,
            "reason": "Published study reports no independent external validation and states models are not ready for clinical application.",
        },
        "workbooks": [inspect_workbook(path) for path in args.workbooks],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    for workbook in report["workbooks"]:
        print(f"{workbook['file']}: {len(workbook['sheets'])} sheets")
        for sheet in workbook["sheets"]:
            candidates = [
                column["name"]
                for column in sheet["column_summaries"]
                if column["label_candidate"] or column["id_candidate"] or column["time_candidate"]
            ]
            print(f"  {sheet['sheet']}: {sheet['rows']} rows x {sheet['columns']} columns")
            print(f"    outcome: {sheet['outcome']}")
            print(f"    possible identity/time/outcome fields: {candidates[:30]}")
            print(f"    leakage-prevention grouping diagnostics: {sheet['fingerprint_diagnostics']}")


if __name__ == "__main__":
    main()
