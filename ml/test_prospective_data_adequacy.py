from __future__ import annotations

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


def test_passes_when_pre_specified_minimums_are_met() -> None:
    report = audit_data_adequacy(
        make_frame(25, 40),
        minimum_total_participants=60,
        minimum_positive_participants=20,
        minimum_negative_participants=30,
        sample_size_justification="Pre-specified in protocol v1 before model fitting.",
    )
    assert report["passed"] is True
    assert report["checks"] == {
        "totalParticipants": True,
        "positiveParticipants": True,
        "negativeParticipants": True,
    }


def test_fails_closed_when_positive_outcome_information_is_below_protocol_floor() -> None:
    report = audit_data_adequacy(
        make_frame(6, 60),
        minimum_total_participants=60,
        minimum_positive_participants=20,
        minimum_negative_participants=30,
        sample_size_justification="A-priori calculation documented in protocol.",
    )
    assert report["passed"] is False
    assert report["checks"]["positiveParticipants"] is False
    assert any("with the outcome" in message for message in report["errors"])


def test_requires_a_priori_justification_instead_of_silent_default_thresholds() -> None:
    report = audit_data_adequacy(
        make_frame(25, 40),
        minimum_total_participants=60,
        minimum_positive_participants=20,
        minimum_negative_participants=30,
        sample_size_justification="   ",
    )
    assert report["passed"] is False
    assert any("sample_size_justification" in message for message in report["errors"])


def test_repeated_windows_are_reported_without_double_counting_participants() -> None:
    report = audit_data_adequacy(
        make_frame(25, 40, repeated=True),
        minimum_total_participants=60,
        minimum_positive_participants=20,
        minimum_negative_participants=30,
        sample_size_justification="Protocol-defined minimums.",
    )
    assert report["passed"] is True
    assert report["observed"]["nRows"] == 66
    assert report["observed"]["nParticipants"] == 65
    assert report["observed"]["nParticipantsWithRepeatedWindows"] == 1
    assert report["warnings"]
