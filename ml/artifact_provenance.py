from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from data_source_matrix import source_provenance_snapshot


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_artifact_provenance(
    *,
    source_ids: list[str] | tuple[str, ...],
    data_piece_ids: list[str] | tuple[str, ...] = (),
    input_files: list[Path] | tuple[Path, ...] = (),
) -> dict[str, Any]:
    registry = source_provenance_snapshot(
        source_ids,
        data_piece_ids=data_piece_ids,
    )
    inputs = [
        {
            "path": str(path),
            "sha256": sha256_file(path),
            "bytes": int(path.stat().st_size),
        }
        for path in input_files
    ]
    return {
        "sourceRegistry": registry,
        "inputFiles": inputs,
    }


def stamp_json_artifact(
    input_json: Path,
    output_json: Path,
    *,
    source_ids: list[str] | tuple[str, ...],
    data_piece_ids: list[str] | tuple[str, ...] = (),
    input_files: list[Path] | tuple[Path, ...] = (),
) -> dict[str, Any]:
    artifact = json.loads(input_json.read_text(encoding="utf-8"))
    if not isinstance(artifact, dict):
        raise ValueError("Research artifact JSON root must be an object.")

    provenance = artifact.get("provenance")
    if provenance is None:
        provenance = {}
        artifact["provenance"] = provenance
    if not isinstance(provenance, dict):
        raise ValueError("Research artifact provenance must be an object when present.")
    if "sourceRegistry" in provenance:
        raise ValueError(
            "Research artifact already contains sourceRegistry provenance; regenerate or explicitly remove it rather than silently overwriting provenance."
        )

    stamped = build_artifact_provenance(
        source_ids=source_ids,
        data_piece_ids=data_piece_ids,
        input_files=input_files,
    )
    provenance.update(stamped)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(artifact, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Stamp an existing JSON research artifact with immutable source-registry and input-file provenance. "
            "Intake-only source IDs remain labeled intake-only and are not activated by this operation."
        )
    )
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--source", action="append", required=True)
    parser.add_argument("--data-piece", action="append", default=[])
    parser.add_argument("--input-file", action="append", type=Path, default=[])
    args = parser.parse_args()

    stamp_json_artifact(
        args.input_json,
        args.output_json,
        source_ids=args.source,
        data_piece_ids=args.data_piece,
        input_files=args.input_file,
    )


if __name__ == "__main__":
    main()
