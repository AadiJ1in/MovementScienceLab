from __future__ import annotations

import unittest

import pandas as pd

from prospective_data_adequacy import audit_data_adequacy


def make_frame(n_positive: int, n_negative: int, repeated: bool = False) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for index in range(n_positive + n_negative):
        outcome = 1 if index < n_positive else 0
        participant = f"p{index:03d}"
        rows.append({"participant_id": participant, "injury_within_horizon": outcome})
        if repeated and index == 0:
            rows.append({"participant_id": participant, "injury_within_horizon": outcome})
    return pd.DataFrame(rows)


class ProspectiveDataAdequacyTests(unittest.TestCase):
    def test_passes_when_pre_specified_minimums_are_met(self) -> None:
        report = audit_data_adequacy(
            make_frame(25, 40),
            minimum_total_participants=60,
            minimum_positive_participants=20,
            minimum_negative_participants=30,
            sample_size_justification="Pre-specified in protocol v1 before model fitting.",
        )
        self.assertTrue(report["passed"])
        self.assertEqual(
            report["checks"],
            {
                "totalParticipants": True,
                "positiveParticipants": True,
                "negativeParticipants": True,
            },
        )

    def test_fails_closed_when_positive_outcome_information_is_below_protocol_floor(self) -> None:
        report = audit_data_adequacy(
            make_frame(6, 60),
            minimum_total_participants=60,
            minimum_positive_participants=20,
            minimum_negative_participants=30,
            sample_size_justification="A-priori calculation documented in protocol.",
        )
        self.assertFalse(report["passed"])
        self.assertFalse(report["checks"]["positiveParticipants"])
        self.assertTrue(any("with the outcome" in message for message in report["errors"]))

    def test_requires_a_priori_justification_instead_of_silent_default_thresholds(self) -> None:
        report = audit_data_adequacy(
            make_frame(25, 40),
            minimum_total_participants=60,
            minimum_positive_participants=20,
            minimum_negative_participants=30,
            sample_size_justification="   ",
        )
        self.assertFalse(report["passed"])
        self.assertTrue(
            any("sample_size_justification" in message for message in report["errors"])
        )

    def test_repeated_windows_are_reported_without_double_counting_participants(self) -> None:
        report = audit_data_adequacy(
            make_frame(25, 40, repeated=True),
            minimum_total_participants=60,
            minimum_positive_participants=20,
            minimum_negative_participants=30,
            sample_size_justification="Protocol-defined minimums.",
        )
        self.assertTrue(report["passed"])
        self.assertEqual(report["observed"]["nRows"], 66)
        self.assertEqual(report["observed"]["nParticipants"], 65)
        self.assertEqual(report["observed"]["nParticipantsWithRepeatedWindows"], 1)
        self.assertTrue(report["warnings"])


if __name__ == "__main__":
    unittest.main()
