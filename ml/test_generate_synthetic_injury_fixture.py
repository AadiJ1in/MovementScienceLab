from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from generate_synthetic_injury_fixture import generate_fixture
from prospective_cohort_audit import audit_prospective_cohort
from prospective_injury_benchmark import validate_dataset


class SyntheticInjuryFixtureTests(unittest.TestCase):
    def test_fixture_is_prospective_and_model_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_fixture(
                Path(directory) / "fixture.csv",
                participants=60,
                windows_per_participant=3,
                seed=123,
            )
            audit = audit_prospective_cohort(frame, horizon_days=28)
            self.assertTrue(audit["passed"], audit["errors"])
            features, domains = validate_dataset(frame)
            self.assertIn("camera_biomechanics", domains)
            self.assertIn("history", domains)
            self.assertIn("training_exposure", domains)
            self.assertIn("camera_peak_trunk_lean_deg", features)
            self.assertIn("camera_peak_knee_frontal_deviation_deg", features)
            self.assertIn("mean_pose_confidence", features)

    def test_fixture_is_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            left = generate_fixture(Path(directory) / "left.csv", participants=40, seed=77)
            right = generate_fixture(Path(directory) / "right.csv", participants=40, seed=77)
            self.assertTrue(left.equals(right))


if __name__ == "__main__":
    unittest.main()
