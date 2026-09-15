from __future__ import annotations

import re
import unittest

from data_source_matrix import (
    data_source_matrix_sha256,
    movement_quality_feature_names,
    prospective_feature_domains,
)
from prospective_injury_benchmark import FEATURE_DOMAINS


class MatrixModelContractTests(unittest.TestCase):
    def test_prospective_feature_domains_match_benchmark_exactly(self) -> None:
        self.assertEqual(prospective_feature_domains(), FEATURE_DOMAINS)

    def test_movement_quality_feature_vector_is_unique_and_complete(self) -> None:
        features = movement_quality_feature_names()
        self.assertEqual(len(features), 17)
        self.assertEqual(len(features), len(set(features)))
        self.assertIn("left_knee_flexion_min", features)
        self.assertIn("peak_abs_left_knee_frontal_deviation", features)
        self.assertIn("mean_pose_confidence", features)
        self.assertIn("min_pose_confidence", features)

    def test_matrix_has_reproducible_sha256_fingerprint(self) -> None:
        fingerprint = data_source_matrix_sha256()
        self.assertRegex(fingerprint, re.compile(r"^[0-9a-f]{64}$"))
        self.assertEqual(fingerprint, data_source_matrix_sha256())


if __name__ == "__main__":
    unittest.main()
