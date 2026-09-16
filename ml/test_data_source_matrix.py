from __future__ import annotations

import unittest

from data_source_matrix import (
    data_piece_by_id,
    data_pieces_containing_field,
    data_pieces_for_source,
    intake_source_by_id,
    load_data_source_matrix,
    load_research_source_intake,
    matrix_rows_for_stage,
    research_source_intake_sha256,
    source_by_id,
    source_provenance_snapshot,
    supabase_table,
    validate_data_source_matrix,
    validate_research_source_intake,
)


class DataSourceMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.matrix = load_data_source_matrix()
        cls.intake = load_research_source_intake()

    def test_integrity(self) -> None:
        validate_data_source_matrix(self.matrix)
        validate_research_source_intake(self.intake)
        self.assertFalse(self.matrix["policy"]["rawPatientVideoPersisted"])
        self.assertEqual(self.matrix["policy"]["bundledRawVideoFiles"], [])

    def test_soccermon_source_files_are_queryable(self) -> None:
        source = source_by_id("soccermon", self.matrix)
        self.assertIsNotNone(source)
        self.assertEqual(source["licenseStatus"], "CC BY 4.0")
        piece_ids = {row["id"] for row in data_pieces_for_source("soccermon", self.matrix)}
        self.assertTrue(
            {
                "soccermon-daily-load",
                "soccermon-readiness",
                "soccermon-sleep-quality",
                "soccermon-soreness",
                "soccermon-injury-event",
            }.issubset(piece_ids)
        )

    def test_pending_sources_are_not_active(self) -> None:
        active = {row["sourceId"] for row in self.matrix["matrix"]}
        for pending in self.matrix["pendingSources"]:
            self.assertNotIn(pending["id"], active)

    def test_verified_intake_sources_are_queryable_without_activation(self) -> None:
        expected = {"rehab24-6", "keraal", "intellirehab", "wu-2026-running-injury"}
        observed = {row["id"] for row in self.intake["sources"]}
        self.assertEqual(observed, expected)
        for source_id in expected:
            source = intake_source_by_id(source_id, self.intake)
            self.assertIsNotNone(source)
            self.assertEqual(source["status"], "verified-intake-only")
            self.assertTrue(source["primarySource"])
            self.assertTrue(source["dataSource"])

    def test_intake_video_sources_never_bundle_raw_video(self) -> None:
        for source in self.intake["sources"]:
            video = source.get("videoManifest")
            if isinstance(video, dict) and "rawVideoInRepository" in video:
                self.assertFalse(video["rawVideoInRepository"])

    def test_source_provenance_distinguishes_active_from_intake(self) -> None:
        snapshot = source_provenance_snapshot(
            ["soccermon", "rehab24-6"],
            data_piece_ids=["soccermon-injury-event"],
            matrix=self.matrix,
            intake=self.intake,
        )
        sources = {source["id"]: source for source in snapshot["sources"]}
        self.assertEqual(sources["soccermon"]["registry"], "canonical-active")
        self.assertEqual(sources["rehab24-6"]["registry"], "verified-intake-only")
        self.assertTrue(snapshot["intakeOnlyDoesNotAuthorizeUse"])
        self.assertEqual(snapshot["dataPieceIds"], ["soccermon-injury-event"])
        self.assertRegex(snapshot["dataSourceMatrix"]["sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(
            snapshot["researchSourceIntakeMatrix"]["sha256"],
            research_source_intake_sha256(),
        )

    def test_unknown_source_or_piece_fails_provenance(self) -> None:
        with self.assertRaises(ValueError):
            source_provenance_snapshot(["not-a-real-source"], matrix=self.matrix, intake=self.intake)
        with self.assertRaises(ValueError):
            source_provenance_snapshot(
                ["soccermon"],
                data_piece_ids=["not-a-real-piece"],
                matrix=self.matrix,
                intake=self.intake,
            )

    def test_landmark_matrix_contains_33_names(self) -> None:
        piece = data_piece_by_id("normalized-pose-landmarks", self.matrix)
        self.assertIsNotNone(piece)
        self.assertEqual(len(piece["landmarkNames"]), 33)
        self.assertIn("left_knee", piece["landmarkNames"])

    def test_field_and_stage_lookup(self) -> None:
        field_matches = {row["id"] for row in data_pieces_containing_field("cadenceRpm", self.matrix)}
        self.assertIn("stage2-rep-summary", field_matches)
        research_sources = {row["sourceId"] for row in matrix_rows_for_stage("research-ml", self.matrix)}
        self.assertIn("soccermon", research_sources)
        self.assertIn("ui-prmd", research_sources)

    def test_supabase_provenance_fields(self) -> None:
        table = supabase_table("movement_flags", self.matrix)
        self.assertIsNotNone(table)
        self.assertIn("source_measurement_method", table["fields"])
        self.assertIn("measurement_version", table["fields"])

    def test_registered_videos_are_never_persisted_raw(self) -> None:
        for video in self.matrix["videoSources"]:
            self.assertFalse(video["rawVideoInRepository"])
            self.assertFalse(video["rawVideoPersisted"])


if __name__ == "__main__":
    unittest.main()
