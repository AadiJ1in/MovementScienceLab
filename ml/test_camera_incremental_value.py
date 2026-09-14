from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from camera_incremental_value import (
    classify_internal_camera_added_value,
    paired_cluster_bootstrap_incremental_value,
    scientific_feature_sets,
)


class CameraIncrementalValueTests(unittest.TestCase):
    def make_frame(self) -> pd.DataFrame:
        rows: list[dict[str, object]] = []
        for index in range(30):
            positive = index < 15
            rows.append(
                {
                    "participant_id": f"p{index:03d}",
                    "injury_within_horizon": int(positive),
                    "previous_injury_count": 1 if positive else 0,
                    "pain_score": 4.0 if positive else 1.0,
                    "training_minutes_7d": 420.0 if positive else 260.0,
                    "left_sls_stable_knee_deg": 14.0 if positive else 6.0,
                    "sls_knee_change_30d": 3.0 if positive else 0.5,
                    "training_minutes_change_28d": 80.0 if positive else 10.0,
                }
            )
        return pd.DataFrame(rows)

    def test_feature_sets_treat_camera_longitudinal_change_as_camera_derived(self) -> None:
        feature_sets = scientific_feature_sets(self.make_frame())

        self.assertIn("left_sls_stable_knee_deg", feature_sets["cameraOnly"])
        self.assertIn("sls_knee_change_30d", feature_sets["cameraOnly"])
        self.assertNotIn("sls_knee_change_30d", feature_sets["nonCameraReference"])
        self.assertIn("training_minutes_change_28d", feature_sets["nonCameraReference"])
        self.assertEqual(
            set(feature_sets["expandedMultimodal"]),
            set(feature_sets["nonCameraReference"]) | set(feature_sets["cameraOnly"]),
        )

    def test_paired_bootstrap_reports_positive_increment_when_expanded_predictions_are_better(self) -> None:
        y = np.asarray([0, 1] * 40, dtype=int)
        groups = np.asarray([f"p{index:03d}" for index in range(len(y))])
        reference = np.where(y == 1, 0.58, 0.42).astype(float)
        expanded = np.where(y == 1, 0.90, 0.10).astype(float)

        report = paired_cluster_bootstrap_incremental_value(
            y,
            reference,
            expanded,
            groups,
            samples=200,
        )

        self.assertGreater(report["pointEstimates"]["brierImprovement"], 0)
        self.assertGreaterEqual(report["pointEstimates"]["deltaAuROC"], 0)
        self.assertGreaterEqual(report["pointEstimates"]["deltaAuPRC"], 0)
        self.assertGreater(report["confidenceIntervals"]["brierImprovement"]["lower95"], 0)

    def test_internal_added_value_classification_requires_multiple_supported_metrics(self) -> None:
        incremental = {
            "pointEstimates": {
                "deltaAuROC": 0.05,
                "deltaAuPRC": 0.08,
                "brierImprovement": 0.03,
            },
            "confidenceIntervals": {
                "deltaAuROC": {"lower95": 0.01, "upper95": 0.09},
                "deltaAuPRC": {"lower95": 0.02, "upper95": 0.12},
                "brierImprovement": {"lower95": -0.01, "upper95": 0.07},
            },
        }

        result = classify_internal_camera_added_value(incremental)
        self.assertEqual(result["status"], "internal-evidence-supported")
        self.assertEqual(result["metricsWith95IntervalAboveZero"], 2)

    def test_mixed_or_uncertain_results_are_not_promoted_to_supported(self) -> None:
        incremental = {
            "pointEstimates": {
                "deltaAuROC": 0.02,
                "deltaAuPRC": -0.01,
                "brierImprovement": 0.004,
            },
            "confidenceIntervals": {
                "deltaAuROC": {"lower95": -0.02, "upper95": 0.06},
                "deltaAuPRC": {"lower95": -0.05, "upper95": 0.03},
                "brierImprovement": {"lower95": -0.01, "upper95": 0.02},
            },
        }

        result = classify_internal_camera_added_value(incremental)
        self.assertEqual(result["status"], "inconclusive")


if __name__ == "__main__":
    unittest.main()
