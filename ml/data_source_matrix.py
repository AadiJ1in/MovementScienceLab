from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MATRIX_PATH = ROOT / "data" / "data-source-matrix.json"
DEFAULT_INTAKE_MATRIX_PATH = ROOT / "data" / "research-source-intake-matrix.json"


def load_data_source_matrix(path: Path = DEFAULT_MATRIX_PATH) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        matrix = json.load(handle)
    validate_data_source_matrix(matrix)
    return matrix


def load_research_source_intake(
    path: Path = DEFAULT_INTAKE_MATRIX_PATH,
) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    validate_research_source_intake(catalog)
    return catalog


def data_source_matrix_sha256(path: Path = DEFAULT_MATRIX_PATH) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def research_source_intake_sha256(path: Path = DEFAULT_INTAKE_MATRIX_PATH) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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

    feature_domains = prospective_feature_domains(matrix)
    if not feature_domains:
        raise ValueError("Canonical matrix must define at least one prospective research feature domain.")
    if len(feature_domains) != len(set(feature_domains)):
        raise ValueError("Prospective feature-domain names must be unique.")
    if not movement_quality_feature_names(matrix):
        raise ValueError("Canonical matrix must define the movement-quality feature vector.")


def validate_research_source_intake(catalog: dict[str, Any]) -> None:
    required = {"schemaVersion", "lastReviewed", "purpose", "activationRule", "sources"}
    missing = sorted(required - set(catalog))
    if missing:
        raise ValueError(f"Research source intake matrix is missing: {', '.join(missing)}")
    sources = catalog["sources"]
    _assert_unique([str(row["id"]) for row in sources], "research intake source id")
    for source in sources:
        if source.get("status") != "verified-intake-only":
            raise ValueError(
                f"Research intake source {source.get('id')} must remain verified-intake-only until canonical activation."
            )
        if not source.get("primarySource") or not source.get("dataSource"):
            raise ValueError(
                f"Research intake source {source.get('id')} requires primarySource and dataSource."
            )
        for video_key in ("videoManifest",):
            manifest = source.get(video_key)
            if isinstance(manifest, dict) and manifest.get("rawVideoInRepository") is True:
                raise ValueError(
                    f"Research intake source {source.get('id')} cannot bundle raw video in the repository."
                )


def source_by_id(source_id: str, matrix: dict[str, Any] | None = None) -> dict[str, Any] | None:
    matrix = matrix or load_data_source_matrix()
    return next((row for row in matrix["sources"] if row["id"] == source_id), None)


def intake_source_by_id(
    source_id: str,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    catalog = catalog or load_research_source_intake()
    return next((row for row in catalog["sources"] if row["id"] == source_id), None)


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


def prospective_feature_domains(
    matrix: dict[str, Any] | None = None,
) -> dict[str, tuple[str, ...]]:
    """Return the prospective benchmark feature contract from the canonical matrix."""
    matrix = matrix or load_data_source_matrix()
    domains: dict[str, tuple[str, ...]] = {}
    for piece in matrix["dataPieces"]:
        piece_id = str(piece["id"])
        if not piece_id.startswith("prospective-") or not piece_id.endswith("-domain"):
            continue
        domain = piece_id.removeprefix("prospective-").removesuffix("-domain").replace("-", "_")
        fields = tuple(str(field) for field in piece.get("fields", []))
        if not fields:
            raise ValueError(f"Prospective feature domain {piece_id} has no fields.")
        if domain in domains:
            raise ValueError(f"Duplicate prospective feature domain derived from matrix: {domain}.")
        domains[domain] = fields
    return domains


def movement_quality_feature_names(
    matrix: dict[str, Any] | None = None,
) -> tuple[str, ...]:
    matrix = matrix or load_data_source_matrix()
    piece = next(
        (row for row in matrix["dataPieces"] if row["id"] == "movement-quality-feature-vector"),
        None,
    )
    if piece is None:
        raise ValueError("Canonical matrix is missing movement-quality-feature-vector.")
    fields = tuple(str(field) for field in piece.get("fields", []))
    if not fields:
        raise ValueError("movement-quality-feature-vector must define at least one field.")
    return fields


def source_provenance_snapshot(
    source_ids: list[str] | tuple[str, ...],
    *,
    data_piece_ids: list[str] | tuple[str, ...] = (),
    matrix: dict[str, Any] | None = None,
    intake: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build compact, reproducible provenance from canonical and intake registries.

    This records where a source is registered. An intake-only source is explicitly
    labeled as such; including it in provenance never upgrades it to an active
    training/runtime source.
    """
    matrix = matrix or load_data_source_matrix()
    intake = intake or load_research_source_intake()
    piece_ids = {str(row["id"]) for row in matrix["dataPieces"]}
    unknown_pieces = sorted(set(data_piece_ids) - piece_ids)
    if unknown_pieces:
        raise ValueError("Unknown canonical data-piece ids: " + ", ".join(unknown_pieces))

    resolved: list[dict[str, Any]] = []
    for source_id in source_ids:
        active = source_by_id(source_id, matrix)
        if active is not None:
            resolved.append(
                {
                    "id": source_id,
                    "registry": "canonical-active",
                    "status": active.get("status"),
                    "primarySource": active.get("primarySource"),
                    "dataSource": active.get("dataSource"),
                }
            )
            continue
        candidate = intake_source_by_id(source_id, intake)
        if candidate is not None:
            resolved.append(
                {
                    "id": source_id,
                    "registry": "verified-intake-only",
                    "status": candidate.get("status"),
                    "primarySource": candidate.get("primarySource"),
                    "dataSource": candidate.get("dataSource"),
                }
            )
            continue
        raise ValueError(f"Unknown research source id: {source_id}.")

    return {
        "dataSourceMatrix": {
            "schemaVersion": matrix["schemaVersion"],
            "sha256": data_source_matrix_sha256(),
        },
        "researchSourceIntakeMatrix": {
            "schemaVersion": intake["schemaVersion"],
            "sha256": research_source_intake_sha256(),
        },
        "sources": resolved,
        "dataPieceIds": list(data_piece_ids),
        "intakeOnlyDoesNotAuthorizeUse": True,
    }


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
    parser = argparse.ArgumentParser(description="Query MovementScienceLab research data/source matrices.")
    parser.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX_PATH)
    parser.add_argument("--intake-matrix", type=Path, default=DEFAULT_INTAKE_MATRIX_PATH)
    parser.add_argument("--source")
    parser.add_argument("--intake-source")
    parser.add_argument("--stage")
    parser.add_argument("--field")
    parser.add_argument("--table")
    parser.add_argument("--feature-domains", action="store_true")
    parser.add_argument("--movement-quality-features", action="store_true")
    parser.add_argument("--hash", action="store_true")
    parser.add_argument("--intake-summary", action="store_true")
    parser.add_argument("--provenance-source", action="append", default=[])
    parser.add_argument("--data-piece", action="append", default=[])
    args = parser.parse_args()

    matrix = load_data_source_matrix(args.matrix)
    intake = load_research_source_intake(args.intake_matrix)
    if args.source:
        output: Any = {
            "source": source_by_id(args.source, matrix),
            "dataPieces": data_pieces_for_source(args.source, matrix),
        }
    elif args.intake_source:
        output = intake_source_by_id(args.intake_source, intake)
    elif args.stage:
        output = matrix_rows_for_stage(args.stage, matrix)
    elif args.field:
        output = data_pieces_containing_field(args.field, matrix)
    elif args.table:
        output = supabase_table(args.table, matrix)
    elif args.feature_domains:
        output = prospective_feature_domains(matrix)
    elif args.movement_quality_features:
        output = movement_quality_feature_names(matrix)
    elif args.provenance_source:
        output = source_provenance_snapshot(
            args.provenance_source,
            data_piece_ids=args.data_piece,
            matrix=matrix,
            intake=intake,
        )
    elif args.intake_summary:
        output = {
            "schemaVersion": intake["schemaVersion"],
            "sha256": research_source_intake_sha256(args.intake_matrix),
            "sources": [
                {
                    "id": source["id"],
                    "name": source["name"],
                    "status": source["status"],
                    "primarySource": source["primarySource"],
                    "dataSource": source["dataSource"],
                }
                for source in intake["sources"]
            ],
        }
    elif args.hash:
        output = {
            "schemaVersion": matrix["schemaVersion"],
            "sha256": data_source_matrix_sha256(args.matrix),
            "intakeSchemaVersion": intake["schemaVersion"],
            "intakeSha256": research_source_intake_sha256(args.intake_matrix),
        }
    else:
        output = {
            "schemaVersion": matrix["schemaVersion"],
            "sha256": data_source_matrix_sha256(args.matrix),
            "sources": len(matrix["sources"]),
            "pendingSources": len(matrix["pendingSources"]),
            "videoSources": len(matrix["videoSources"]),
            "dataPieces": len(matrix["dataPieces"]),
            "evidenceSources": len(matrix["evidenceSources"]),
            "supabaseTables": len(matrix["supabaseTables"]),
            "matrixRows": len(matrix["matrix"]),
            "prospectiveFeatureDomains": len(prospective_feature_domains(matrix)),
            "movementQualityFeatures": len(movement_quality_feature_names(matrix)),
            "verifiedIntakeSources": len(intake["sources"]),
            "intakeSha256": research_source_intake_sha256(args.intake_matrix),
        }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
