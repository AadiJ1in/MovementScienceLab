from __future__ import annotations

import unittest

from data_source_matrix import (
    data_piece_by_id,
    data_pieces_containing_field,
    data_pieces_for_source,
    load_data_source_matrix,
    matrix_rows_for_stage,
    source_by_id,
    supabase_table,
    validate_data_source_matrix,
)


class DataSourceMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.matrix = load_data_source_matrix()

    def test_integrity(self) -> None:
        validate_data_source_matrix(self.matrix)
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
