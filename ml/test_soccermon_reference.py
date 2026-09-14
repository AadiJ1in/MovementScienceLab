from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from prospective_cohort_audit import audit_prospective_cohort
from soccermon_reference import (
    build_soccermon_prospective_cohort,
    locate_soccermon_subjective_files,
    reference_features,
)


class SoccerMonReferenceTests(unittest.TestCase):
    def make_subjective_fixture(self, root: Path) -> Path:
        training = root / "training-load"
        wellness = root / "wellness"
        injury = root / "injury"
        training.mkdir(parents=True)
        wellness.mkdir(parents=True)
        injury.mkdir(parents=True)

        dates = pd.date_range("2026-01-01", periods=100, freq="D")
        players = ["TeamA01", "TeamA02", "TeamA03", "TeamB01", "TeamB02", "TeamB03"]

        def wide(base: float, scale: float = 1.0) -> pd.DataFrame:
            data: dict[str, object] = {"Date": dates.strftime("%d.%m.%Y")}
            for player_index, player in enumerate(players):
                data[player] = [
                    base + player_index * 0.1 + (day % 7) * scale
                    for day in range(len(dates))
                ]
            return pd.DataFrame(data)

        wide(100.0, 3.0).to_csv(training / "daily_load.csv", index=False)
        wide(7.0, 0.05).to_csv(wellness / "readiness.csv", index=False)
        wide(3.5, 0.03).to_csv(wellness / "sleep_quality.csv", index=False)
        wide(2.0, 0.02).to_csv(wellness / "soreness.csv", index=False)

        pd.DataFrame(
            [
                {
                    "player_name": "TeamA01",
                    "type": "knee",
                    "timestamp": "15.02.2026",
                },
                {
                    "player_name": "TeamA01",
                    "type": "ankle",
                    "timestamp": "20.03.2026",
                },
                {
                    "player_name": "TeamB02",
                    "type": "knee",
                    "timestamp": "01.03.2026",
                },
            ]
        ).to_csv(injury / "injury.csv", index=False)
        return root

    def test_required_files_are_discovered_recursively(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = self.make_subjective_fixture(Path(temp_dir))
            files = locate_soccermon_subjective_files(root)
            self.assertEqual(files["daily_load"].name, "daily_load.csv")
            self.assertEqual(files["injury"].name, "injury.csv")

    def test_builder_creates_leakage_auditable_nonoverlapping_windows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = self.make_subjective_fixture(Path(temp_dir))
            cohort, metadata = build_soccermon_prospective_cohort(
                root,
                horizon_days=14,
                stride_days=14,
                wellness_lookback_days=3,
            )

            audit = audit_prospective_cohort(cohort, horizon_days=14)
            self.assertTrue(audit["passed"], audit["errors"])
            self.assertEqual(audit["counts"]["overlappingAdjacentWindowPairs"], 0)
            self.assertGreater(int(cohort["injury_within_horizon"].sum()), 0)
            self.assertEqual(metadata["strideDays"], 14)
            self.assertEqual(metadata["horizonDays"], 14)

            positive = cohort[cohort["injury_within_horizon"] == 1].copy()
            event_time = pd.to_datetime(positive["injury_event_time"], utc=True)
            index_time = pd.to_datetime(positive["index_time"], utc=True)
            window_end = pd.to_datetime(positive["outcome_window_end"], utc=True)
            self.assertTrue((event_time > index_time).all())
            self.assertTrue((event_time <= window_end).all())

    def test_history_features_use_only_injuries_before_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = self.make_subjective_fixture(Path(temp_dir))
            cohort, _ = build_soccermon_prospective_cohort(
                root,
                horizon_days=14,
                stride_days=14,
            )
            player = cohort[cohort["participant_id"] == "TeamA01"].copy()
            index = pd.to_datetime(player["index_time"], utc=True)
            before_first_injury = player[index < pd.Timestamp("2026-02-15", tz="UTC")]
            after_first_injury = player[index > pd.Timestamp("2026-02-15", tz="UTC")]
            self.assertTrue((before_first_injury["previous_injury_count"] == 0).all())
            self.assertTrue((after_first_injury["previous_injury_count"] >= 1).all())

    def test_injury_filter_changes_the_outcome_definition_without_touching_predictors(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = self.make_subjective_fixture(Path(temp_dir))
            all_injuries, _ = build_soccermon_prospective_cohort(
                root,
                horizon_days=14,
                stride_days=14,
            )
            knee_only, _ = build_soccermon_prospective_cohort(
                root,
                horizon_days=14,
                stride_days=14,
                injury_type_contains="knee",
            )
            self.assertLessEqual(
                int(knee_only["injury_within_horizon"].sum()),
                int(all_injuries["injury_within_horizon"].sum()),
            )
            for feature in (
                "session_rpe_load_7d",
                "session_rpe_load_28d",
                "readiness_score",
                "sleep_quality_score",
                "soreness_score",
            ):
                pd.testing.assert_series_equal(
                    all_injuries[feature].reset_index(drop=True),
                    knee_only[feature].reset_index(drop=True),
                    check_names=False,
                )

    def test_reference_feature_set_is_explicitly_non_camera(self) -> None:
        df = pd.DataFrame(
            {
                "previous_injury_count": [0],
                "days_since_last_injury": [None],
                "soreness_score": [2.0],
                "sleep_quality_score": [4.0],
                "readiness_score": [8.0],
                "session_rpe_load_7d": [600.0],
                "session_rpe_load_28d": [2400.0],
                "left_sls_stable_knee_deg": [10.0],
            }
        )
        features, domains = reference_features(df)
        self.assertEqual(domains, ["history", "symptoms_readiness", "training_exposure"])
        self.assertNotIn("left_sls_stable_knee_deg", features)


if __name__ == "__main__":
    unittest.main()
