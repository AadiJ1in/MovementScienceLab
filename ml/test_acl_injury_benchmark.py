from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from acl_injury_benchmark import validate_acl_dataset
from acl_literature_priors import literature_linear_predictor
from generate_synthetic_acl_fixture import generate_acl_fixture


class AclOnlyBenchmarkTests(unittest.TestCase):
    def test_synthetic_fixture_passes_acl_specific_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_acl_fixture(
                Path(directory) / "acl.csv",
                participants=180,
                seed=22,
            )
            features, domains, audit = validate_acl_dataset(frame)
            self.assertTrue(audit["directContactExcluded"])
            self.assertTrue(audit["medicalConfirmationVerified"])
            self.assertIn("acl_history", domains)
            self.assertIn("video_biomechanics", domains)
            self.assertIn("jump_kinetics", domains)
            self.assertIn("exposure_fatigue", domains)
            self.assertIn("dynamic_knee_valgus_deg", features)
            self.assertNotIn("mean_pose_confidence", features)

    def test_direct_contact_positive_event_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_acl_fixture(
                Path(directory) / "acl.csv",
                participants=180,
                seed=23,
            )
            positive = frame.index[frame["acl_tear_within_horizon"] == 1][0]
            frame.loc[positive, "injury_mechanism"] = "direct-contact"
            with self.assertRaisesRegex(ValueError, "direct-contact"):
                validate_acl_dataset(frame)

    def test_missing_medical_confirmation_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_acl_fixture(
                Path(directory) / "acl.csv",
                participants=180,
                seed=24,
            )
            positive = frame.index[frame["acl_tear_within_horizon"] == 1][0]
            frame.loc[positive, "medical_confirmation"] = "unknown"
            with self.assertRaisesRegex(ValueError, "medical confirmation"):
                validate_acl_dataset(frame)

    def test_reference_signal_moves_in_reported_directions(self) -> None:
        baseline = literature_linear_predictor(
            {
                "prior_acl_rupture": 0,
                "dynamic_knee_valgus_deg": 0,
                "ipsilateral_trunk_flexion_deg": 8,
                "cmj_peak_takeoff_force_bw": 1.19,
                "hip_adductor_abductor_ratio": 0.97,
            }
        )
        elevated = literature_linear_predictor(
            {
                "prior_acl_rupture": 1,
                "dynamic_knee_valgus_deg": 7.2,
                "ipsilateral_trunk_flexion_deg": 10.4,
                "cmj_peak_takeoff_force_bw": 1.32,
                "hip_adductor_abductor_ratio": 0.83,
            }
        )
        self.assertAlmostEqual(baseline, 0.0, places=8)
        self.assertGreater(elevated, baseline)


if __name__ == "__main__":
    unittest.main()
