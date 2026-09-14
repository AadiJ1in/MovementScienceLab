from __future__ import annotations

import unittest

import pandas as pd

from temporal_transport_stress_test import validate_temporal_design


class TemporalTransportDesignTests(unittest.TestCase):
    def make_frame(self) -> pd.DataFrame:
        rows: list[dict[str, object]] = []
        cutoff = pd.Timestamp("2026-07-01T00:00:00Z")
        # Earlier development rows: outcomes fully resolved before cutoff.
        for index in range(30):
            rows.append(
                {
                    "participant_id": f"train-{index:03d}",
                    "index_time": "2026-05-01T00:00:00Z",
                    "outcome_window_end": "2026-05-31T00:00:00Z",
                    "injury_within_horizon": 1 if index < 10 else 0,
                }
            )
        # Straddling row: known prediction before cutoff, but outcome unresolved at cutoff.
        rows.append(
            {
                "participant_id": "straddle",
                "index_time": "2026-06-20T00:00:00Z",
                "outcome_window_end": "2026-07-20T00:00:00Z",
                "injury_within_horizon": 0,
            }
        )
        # Later deployment-like temporal test rows.
        for index in range(14):
            rows.append(
                {
                    "participant_id": f"test-{index:03d}",
                    "index_time": "2026-08-01T00:00:00Z",
                    "outcome_window_end": "2026-08-31T00:00:00Z",
                    "injury_within_horizon": 1 if index < 4 else 0,
                }
            )
        return pd.DataFrame(rows), cutoff

    def test_excludes_rows_whose_outcomes_were_unresolved_at_cutoff(self) -> None:
        df, cutoff = self.make_frame()
        report = validate_temporal_design(df, development_cutoff=cutoff)
        self.assertTrue(report["passed"])
        self.assertEqual(report["counts"]["developmentRows"], 30)
        self.assertEqual(report["counts"]["temporalTestRows"], 14)
        self.assertEqual(report["counts"]["excludedStraddlingRows"], 1)

    def test_fails_when_later_period_has_only_one_outcome_class(self) -> None:
        df, cutoff = self.make_frame()
        df.loc[df["index_time"] == "2026-08-01T00:00:00Z", "injury_within_horizon"] = 0
        report = validate_temporal_design(df, development_cutoff=cutoff)
        self.assertFalse(report["passed"])
        self.assertTrue(any("both outcome classes" in message for message in report["errors"]))

    def test_reports_same_participant_across_time_without_calling_it_external(self) -> None:
        df, cutoff = self.make_frame()
        later_index = df.index[df["index_time"] == "2026-08-01T00:00:00Z"][0]
        df.loc[later_index, "participant_id"] = "train-000"
        report = validate_temporal_design(df, development_cutoff=cutoff)
        self.assertTrue(report["passed"])
        self.assertEqual(report["counts"]["participantsSeenInBothPeriods"], 1)
        self.assertTrue(report["warnings"])

    def test_fails_when_temporal_test_period_is_too_small_to_report(self) -> None:
        df, cutoff = self.make_frame()
        keep = ~(
            (df["index_time"] == "2026-08-01T00:00:00Z")
            & (~df.index.isin(df.index[df["index_time"] == "2026-08-01T00:00:00Z"][:8]))
        )
        small = df.loc[keep].copy()
        report = validate_temporal_design(small, development_cutoff=cutoff)
        self.assertFalse(report["passed"])
        self.assertTrue(any("minimum reportable count" in message for message in report["errors"]))


if __name__ == "__main__":
    unittest.main()
