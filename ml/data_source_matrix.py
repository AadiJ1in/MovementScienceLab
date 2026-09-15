from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_MATRIX_PATH = Path(__file__).resolve().parents[1] / "data" / "data-source-matrix.json"


def load_data_source_matrix(path: Path = DEFAULT_MATRIX_PATH) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        matrix = json.load(handle)
    validate_data_source_matrix(matrix)
    return matrix


def validate_data_source_matrix(matrix: dict[str, Any]) -> None:
    required = {
        "schemaVersion",
        "policy",
        "sources",
        "pendingSources",
        "videoSources",
        "dataPieces",
        "evidenceSources",
        "supabaseTables",
        "matrix",
    }
    missing = sorted(required - set(matrix))
    if missing:
        raise ValueError(f"Data source matrix is missing: {', '.join(missing)}")

    sources = matrix["sources"]
    pending = matrix["pendingSources"]
    videos = matrix["videoSources"]
    pieces = matrix["dataPieces"]
    evidence = matrix["evidenceSources"]
    tables = matrix["supabaseTables"]
    links = matrix["matrix"]

    _assert_unique([row["id"] for row in sources], "source id")
    _assert_unique([row["id"] for row in pending], "pending source id")
    _assert_unique([row["id"] for row in videos], "video source id")
    _assert_unique([row["id"] for row in pieces], "data-piece id")
    _assert_unique([row["id"] for row in evidence], "evidence source id")
    _assert_unique([row["name"] for row in tables], "Supabase table name")

    source_ids = {row["id"] for row in sources}
    pending_ids = {row["id"] for row in pending}
    piece_ids = {row["id"] for row in pieces}

    for video in videos:
        if video["sourceId"] not in source_ids:
            raise ValueError(
                f"Video source {video['id']} references unknown active source {video['sourceId']}."
            )
        if video.get("rawVideoPersisted"):
            raise ValueError(f"Raw video persistence is forbidden for {video['id']}.")
        if video.get("rawVideoInRepository"):
            raise ValueError(f"Raw video must not be bundled in the repository: {video['id']}.")

    for link in links:
        source_id = link["sourceId"]
        if source_id not in source_ids:
            raise ValueError(f"Matrix row references unknown active source {source_id}.")
        if source_id in pending_ids:
            raise ValueError(f"Pending source {source_id} cannot be active.")
        unknown = [piece_id for piece_id in link["dataPieceIds"] if piece_id not in piece_ids]
        if unknown:
            raise ValueError(
                f"Matrix row for {source_id} references unknown data pieces: {', '.join(unknown)}"
            )

    policy = matrix["policy"]
    if policy.get("rawPatientVideoPersisted"):
        raise ValueError("rawPatientVideoPersisted must remain false.")
    if policy.get("bundledRawVideoFiles"):
        raise ValueError("bundledRawVideoFiles must remain empty.")


def source_by_id(source_id: str, matrix: dict[str, Any] | None = None) -> dict[str, Any] | None:
    matrix = matrix or load_data_source_matrix()
    return next((row for row in matrix["sources"] if row["id"] == source_id), None)


def data_piece_by_id(piece_id: str, matrix: dict[str, Any] | None = None) -> dict[str, Any] | None:
    matrix = matrix or load_data_source_matrix()
    return next((row for row in matrix["dataPieces"] if row["id"] == piece_id), None)


def data_pieces_for_source(
    source_id: str,
    matrix: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    matrix = matrix or load_data_source_matrix()
    piece_ids = {
        piece_id
        for link in matrix["matrix"]
        if link["sourceId"] == source_id
        for piece_id in link["dataPieceIds"]
    }
    return [row for row in matrix["dataPieces"] if row["id"] in piece_ids]


def matrix_rows_for_stage(
    stage: str,
    matrix: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    matrix = matrix or load_data_source_matrix()
    return [row for row in matrix["matrix"] if stage in row["stages"]]


def data_pieces_containing_field(
    field: str,
    matrix: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    matrix = matrix or load_data_source_matrix()
    return [
        row
        for row in matrix["dataPieces"]
        if any(candidate == field or candidate.endswith(f".{field}") for candidate in row["fields"])
    ]


def supabase_table(
    name: str,
    matrix: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    matrix = matrix or load_data_source_matrix()
    return next((row for row in matrix["supabaseTables"] if row["name"] == name), None)


def _assert_unique(values: list[str], label: str) -> None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise ValueError(f"Duplicate {label}: {value}.")
        seen.add(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Query the canonical MovementScienceLab data matrix.")
    parser.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX_PATH)
    parser.add_argument("--source")
    parser.add_argument("--stage")
    parser.add_argument("--field")
    parser.add_argument("--table")
    args = parser.parse_args()

    matrix = load_data_source_matrix(args.matrix)
    if args.source:
        output: Any = {
            "source": source_by_id(args.source, matrix),
            "dataPieces": data_pieces_for_source(args.source, matrix),
        }
    elif args.stage:
        output = matrix_rows_for_stage(args.stage, matrix)
    elif args.field:
        output = data_pieces_containing_field(args.field, matrix)
    elif args.table:
        output = supabase_table(args.table, matrix)
    else:
        output = {
            "schemaVersion": matrix["schemaVersion"],
            "sources": len(matrix["sources"]),
            "pendingSources": len(matrix["pendingSources"]),
            "videoSources": len(matrix["videoSources"]),
            "dataPieces": len(matrix["dataPieces"]),
            "evidenceSources": len(matrix["evidenceSources"]),
            "supabaseTables": len(matrix["supabaseTables"]),
            "matrixRows": len(matrix["matrix"]),
        }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
