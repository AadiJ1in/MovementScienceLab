#!/usr/bin/env python3
"""Inspect the published 2026 prospective running-injury workbooks.

This script intentionally performs schema/provenance inspection before any model is
trained. It never guesses an injury target or participant identifier. The resulting
JSON artifact is reviewed before a prognostic model pipeline is enabled.
"""

from __future__ import annotations

import argparse
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
            print(f"    possible identity/time/outcome fields: {candidates[:30]}")


if __name__ == "__main__":
    main()
