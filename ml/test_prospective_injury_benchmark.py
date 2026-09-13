from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from prospective_injury_benchmark import (
    GROUP,
    TARGET,
    _valid_group_splits,
    cluster_bootstrap_intervals,
    metrics,
    validate_dataset,
)


def synthetic_dataset() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for participant in range(24):
        outcome = 1 if participant % 4 == 0 else 0
        for observation in range(2):
            rows.append(
                {
                    GROUP: f"p-{participant:02d}",
                    TARGET: outcome,
                    "previous_injury_count": participant % 3,
                    "training_minutes_7d": 180 + participant * 3 + observation,
                    "left_sls_stable_knee_deg": 5.0 + (participant % 5),
                    "mean_pose_confidence": 0.9,
                    "sex": "female" if participant % 2 == 0 else "male",
                }
            )
    return pd.DataFrame(rows)


class ProspectiveInjuryBenchmarkTests(unittest.TestCase):
    def test_dataset_requires_multidomain_camera_features(self) -> None:
        df = synthetic_dataset()
        features, domains = validate_dataset(df)
        self.assertIn("camera_biomechanics", domains)
        self.assertIn("left_sls_stable_knee_deg", features)
        self.assertGreaterEqual(len(domains), 3)

    def test_group_splits_never_share_participants(self) -> None:
        df = synthetic_dataset()
        features, _ = validate_dataset(df)
        X = df[features]
        y = df[TARGET].astype(int).to_numpy()
        groups = df[GROUP].astype(str).to_numpy()
        splits = _valid_group_splits(X, y, groups)

        self.assertGreaterEqual(len(splits), 3)
        for train_idx, test_idx in splits:
            train_groups = set(groups[train_idx])
            test_groups = set(groups[test_idx])
            self.assertTrue(train_groups.isdisjoint(test_groups))
            self.assertEqual(set(np.unique(y[train_idx])), {0, 1})
            self.assertEqual(set(np.unique(y[test_idx])), {0, 1})

    def test_cluster_bootstrap_reports_participant_level_uncertainty(self) -> None:
        df = synthetic_dataset()
        y = df[TARGET].astype(int).to_numpy()
        groups = df[GROUP].astype(str).to_numpy()
        probabilities = np.where(y == 1, 0.72, 0.18).astype(float)
        predictions = (probabilities >= 0.5).astype(int)
        intervals = cluster_bootstrap_intervals(
            y,
            probabilities,
            predictions,
            groups,
            samples=100,
        )

        auroc = intervals["auroc"]
        self.assertIsNotNone(auroc)
        assert auroc is not None
        self.assertGreater(auroc["bootstrapSamplesUsed"], 0)
        self.assertLessEqual(auroc["lower95"], auroc["upper95"])

    def test_metrics_include_calibration_and_probability_quality(self) -> None:
        y = np.array([0, 0, 0, 1, 1, 1], dtype=int)
        probabilities = np.array([0.05, 0.15, 0.30, 0.70, 0.82, 0.94])
        report = metrics(y, probabilities, threshold=0.5)

        self.assertGreater(float(report["auroc"]), 0.9)
        self.assertGreater(float(report["brierSkill"]), 0.0)
        self.assertIn("calibrationSlope", report)
        self.assertIn("expectedCalibrationError", report)


if __name__ == "__main__":
    unittest.main()
