from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from acl_exposure_hazard import ExposureAdjustedAclHazardModel, grouped_hazard_evaluation
from generate_synthetic_acl_fixture import generate_acl_fixture
from train_acl_model import data_adequacy_report


class AclExposureHazardTests(unittest.TestCase):
    def test_probability_increases_with_exposure_for_same_linear_state(self) -> None:
        features = ["prior_acl_rupture", "dynamic_knee_valgus_deg"]
        X = pd.DataFrame(
            {
                "prior_acl_rupture": [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                "dynamic_knee_valgus_deg": [1, 2, 8, 2, 10, 3, 9, 1, 11, 3, 12, 2],
            }
        )
        y = np.array([0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0])
        exposure = np.full(len(X), 20.0)
        model = ExposureAdjustedAclHazardModel(features, l2_penalty=1.0).fit(
            X, y, exposure
        )
        row = X.iloc[[2]]
        low = model.predict_probability(row, np.array([10.0]))[0]
        high = model.predict_probability(row, np.array([40.0]))[0]
        self.assertGreater(high, low)
        self.assertGreaterEqual(low, 0)
        self.assertLessEqual(high, 1)
        self.assertFalse(model.artifact()["eligibleForUserFacingAclProbability"])

    def test_grouped_hazard_evaluation_runs_on_acl_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_acl_fixture(
                Path(directory) / "acl.csv",
                participants=180,
                seed=2026,
            )
            features = [
                "prior_acl_rupture",
                "dynamic_knee_valgus_deg",
                "ipsilateral_trunk_flexion_deg",
                "hip_adductor_abductor_ratio",
                "cmj_peak_takeoff_force_bw",
            ]
            report = grouped_hazard_evaluation(
                frame,
                features=features,
                target="acl_tear_within_horizon",
                group="participant_id",
                exposure_column="sport_exposure_hours_28d",
            )
            self.assertEqual(report["splitUnit"], "participant")
            self.assertGreaterEqual(report["nFolds"], 3)
            self.assertFalse(
                report["finalResearchModel"]["eligibleForUserFacingAclProbability"]
            )
            self.assertIn("auroc", report["outOfFoldMetrics"])

    def test_data_adequacy_uses_independent_participants_not_rows(self) -> None:
        frame = pd.DataFrame(
            {
                "participant_id": ["a", "a", "b", "c", "d", "e"],
                "acl_tear_within_horizon": [0, 1, 0, 0, 1, 0],
            }
        )
        report = data_adequacy_report(
            frame,
            minimum_total_participants=5,
            minimum_positive_participants=2,
            minimum_negative_participants=3,
            sample_size_justification=(
                "Unit test verifies that repeated rows do not inflate independent participant counts."
            ),
            training_data_type="synthetic-development-fixture",
        )
        self.assertEqual(report["observed"]["totalParticipants"], 5)
        self.assertEqual(report["observed"]["positiveParticipants"], 2)
        self.assertEqual(report["observed"]["negativeParticipants"], 3)
        self.assertTrue(report["passed"])


if __name__ == "__main__":
    unittest.main()
