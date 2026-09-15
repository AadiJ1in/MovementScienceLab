from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from artifact_provenance import build_artifact_provenance, sha256_file, stamp_json_artifact


class ArtifactProvenanceTests(unittest.TestCase):
    def test_build_provenance_labels_active_and_intake_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "cohort.csv"
            input_path.write_text("participant_id,outcome\np1,0\n", encoding="utf-8")
            report = build_artifact_provenance(
                source_ids=["soccermon", "wu-2026-running-injury"],
                data_piece_ids=["soccermon-injury-event"],
                input_files=[input_path],
            )
            sources = {
                source["id"]: source
                for source in report["sourceRegistry"]["sources"]
            }
            self.assertEqual(sources["soccermon"]["registry"], "canonical-active")
            self.assertEqual(
                sources["wu-2026-running-injury"]["registry"],
                "verified-intake-only",
            )
            self.assertEqual(report["inputFiles"][0]["sha256"], sha256_file(input_path))
            self.assertEqual(report["inputFiles"][0]["bytes"], input_path.stat().st_size)

    def test_stamp_preserves_existing_provenance_and_adds_registry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_json = root / "artifact.json"
            output_json = root / "artifact.stamped.json"
            cohort = root / "cohort.csv"
            input_json.write_text(
                json.dumps(
                    {
                        "schemaVersion": "test",
                        "provenance": {"randomSeed": 42},
                    }
                ),
                encoding="utf-8",
            )
            cohort.write_text("participant_id\np1\n", encoding="utf-8")

            stamped = stamp_json_artifact(
                input_json,
                output_json,
                source_ids=["soccermon"],
                data_piece_ids=["soccermon-daily-load"],
                input_files=[cohort],
            )
            self.assertEqual(stamped["provenance"]["randomSeed"], 42)
            self.assertIn("sourceRegistry", stamped["provenance"])
            self.assertEqual(
                stamped["provenance"]["sourceRegistry"]["sources"][0]["id"],
                "soccermon",
            )
            self.assertTrue(output_json.exists())

    def test_stamp_refuses_to_overwrite_existing_registry_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_json = root / "artifact.json"
            output_json = root / "out.json"
            input_json.write_text(
                json.dumps({"provenance": {"sourceRegistry": {"existing": True}}}),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                stamp_json_artifact(
                    input_json,
                    output_json,
                    source_ids=["soccermon"],
                )

    def test_unknown_sources_fail_closed(self) -> None:
        with self.assertRaises(ValueError):
            build_artifact_provenance(source_ids=["unknown-dataset"])


if __name__ == "__main__":
    unittest.main()
