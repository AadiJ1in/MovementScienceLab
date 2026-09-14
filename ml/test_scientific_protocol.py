from __future__ import annotations

import unittest

from scientific_protocol import validate_protocol


def valid_protocol() -> dict[str, object]:
    return {
        "schemaVersion": "1.0.0",
        "protocolId": "peds-pfp-30d-v1",
        "protocolVersion": "1.0.0",
        "protocolSource": "Pre-specified internal research protocol approved before model fitting.",
        "specifiedBeforeModelFitting": True,
        "intendedUse": "research-risk-estimation-only",
        "outcome": {
            "name": "new patellofemoral pain event",
            "caseDefinition": "New clinician-adjudicated patellofemoral pain meeting the study case definition during follow-up.",
            "adjudication": "Outcome status is determined prospectively from the study injury-surveillance workflow by reviewers blinded to model predictions.",
            "predictionHorizonDays": 30,
        },
        "population": {
            "description": "Prospectively enrolled field-sport athletes",
            "inclusionCriteria": "Participant meets the pre-specified enrollment criteria and has a valid prediction index.",
            "exclusionCriteria": "Participant lacks required outcome follow-up or violates pre-specified cohort exclusions.",
        },
        "predictionIndex": {
            "definition": "End of each eligible pre-injury monitoring week",
            "predictorCutoffRule": "Only measurements timestamped at or before the prediction index may be used.",
        },
        "cameraEvidenceScope": {
            "measurementDefinition": "Versioned 2D single-leg knee-control projection measurements from the supported webcam protocol.",
            "supportedOutcomeContexts": [
                "Prospective patellofemoral-pain research contexts with population/protocol limitations"
            ],
            "generalInjuryClaimAllowed": False,
            "equivalentTo3DKinematics": False,
        },
    }


class ScientificProtocolTests(unittest.TestCase):
    def test_valid_pre_specified_protocol_passes(self) -> None:
        report = validate_protocol(
            valid_protocol(),
            expected_horizon_days=30,
            expected_population="Prospectively enrolled field-sport athletes",
            expected_index_time_definition="End of each eligible pre-injury monitoring week",
        )
        self.assertTrue(report["passed"])
        self.assertFalse(report["cameraEvidenceScope"]["generalInjuryClaimAllowed"])

    def test_horizon_mismatch_fails_closed(self) -> None:
        report = validate_protocol(valid_protocol(), expected_horizon_days=60)
        self.assertFalse(report["passed"])
        self.assertTrue(any("horizon" in message.lower() for message in report["errors"]))

    def test_protocol_must_be_pre_specified(self) -> None:
        protocol = valid_protocol()
        protocol["specifiedBeforeModelFitting"] = False
        report = validate_protocol(protocol)
        self.assertFalse(report["passed"])
        self.assertTrue(any("specifiedBeforeModelFitting" in message for message in report["errors"]))

    def test_general_camera_injury_claim_is_rejected(self) -> None:
        protocol = valid_protocol()
        camera_scope = protocol["cameraEvidenceScope"]
        assert isinstance(camera_scope, dict)
        camera_scope["generalInjuryClaimAllowed"] = True
        report = validate_protocol(protocol)
        self.assertFalse(report["passed"])
        self.assertTrue(any("generalInjuryClaimAllowed" in message for message in report["errors"]))

    def test_3d_equivalence_claim_is_rejected(self) -> None:
        protocol = valid_protocol()
        camera_scope = protocol["cameraEvidenceScope"]
        assert isinstance(camera_scope, dict)
        camera_scope["equivalentTo3DKinematics"] = True
        report = validate_protocol(protocol)
        self.assertFalse(report["passed"])
        self.assertTrue(any("equivalentTo3DKinematics" in message for message in report["errors"]))


if __name__ == "__main__":
    unittest.main()
