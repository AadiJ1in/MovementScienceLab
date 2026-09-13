from __future__ import annotations

import unittest

import pandas as pd

from prospective_cohort_audit import audit_prospective_cohort


def valid_rows() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "participant_id": "p1",
                "index_time": "2026-01-01T12:00:00Z",
                "feature_cutoff_time": "2026-01-01T11:55:00Z",
                "outcome_window_end": "2026-01-29T12:00:00Z",
                "injury_within_horizon": 1,
                "injury_event_time": "2026-01-15T12:00:00Z",
                "outcome_event_id": "event-1",
            },
            {
                "participant_id": "p2",
                "index_time": "2026-01-02T12:00:00Z",
                "feature_cutoff_time": "2026-01-02T12:00:00Z",
                "outcome_window_end": "2026-01-30T12:00:00Z",
                "injury_within_horizon": 0,
                "injury_event_time": None,
                "outcome_event_id": None,
            },
        ]
    )


class ProspectiveCohortAuditTests(unittest.TestCase):
    def test_valid_temporal_contract_passes(self) -> None:
        report = audit_prospective_cohort(valid_rows(), horizon_days=28)
        self.assertTrue(report["passed"])
        self.assertTrue(report["featureTimingVerifiedFromTimestamps"])
        self.assertTrue(report["outcomeTimingDirectlyVerified"])

    def test_post_index_feature_data_is_rejected(self) -> None:
        df = valid_rows()
        df.loc[0, "feature_cutoff_time"] = "2026-01-01T12:05:00Z"
        report = audit_prospective_cohort(df, horizon_days=28)
        self.assertFalse(report["passed"])
        self.assertTrue(any("after the prediction index" in message for message in report["errors"]))

    def test_positive_event_must_be_inside_future_window(self) -> None:
        df = valid_rows()
        df.loc[0, "injury_event_time"] = "2025-12-31T12:00:00Z"
        report = audit_prospective_cohort(df, horizon_days=28)
        self.assertFalse(report["passed"])
        self.assertTrue(any("outside the declared future outcome window" in message for message in report["errors"]))

    def test_overlapping_windows_are_blocked_unless_explicitly_allowed(self) -> None:
        df = valid_rows()
        extra = pd.DataFrame(
            [
                {
                    "participant_id": "p2",
                    "index_time": "2026-01-10T12:00:00Z",
                    "feature_cutoff_time": "2026-01-10T11:59:00Z",
                    "outcome_window_end": "2026-02-07T12:00:00Z",
                    "injury_within_horizon": 0,
                    "injury_event_time": None,
                    "outcome_event_id": None,
                }
            ]
        )
        df = pd.concat([df, extra], ignore_index=True)

        blocked = audit_prospective_cohort(df, horizon_days=28)
        self.assertFalse(blocked["passed"])
        self.assertGreater(blocked["counts"]["overlappingAdjacentWindowPairs"], 0)

        allowed = audit_prospective_cohort(
            df,
            horizon_days=28,
            allow_overlapping_windows=True,
        )
        self.assertTrue(allowed["passed"])
        self.assertTrue(any("explicitly allowed" in message for message in allowed["warnings"]))


if __name__ == "__main__":
    unittest.main()
