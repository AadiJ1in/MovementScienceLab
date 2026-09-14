from __future__ import annotations

import unittest

from feature_evidence_registry import (
    evidence_snapshot,
    feature_registry,
    prohibited_predictor_columns,
    validate_registry_completeness,
)
from prospective_injury_benchmark import FEATURE_DOMAINS


class FeatureEvidenceRegistryTests(unittest.TestCase):
    def test_every_benchmark_feature_has_evidence_metadata(self) -> None:
        report = validate_registry_completeness()
        self.assertTrue(report["passed"])
        expected = sum(len(features) for features in FEATURE_DOMAINS.values())
        self.assertEqual(report["nRegisteredFeatures"], expected)

    def test_pose_confidence_is_measurement_quality_not_injury_predictor(self) -> None:
        registry = feature_registry()
        metadata = registry["mean_pose_confidence"]
        self.assertEqual(metadata["evidenceRole"], "measurement-quality-only")
        self.assertFalse(metadata["allowedAsInjuryPredictor"])
        self.assertFalse(metadata["causalClaimAllowed"])

    def test_camera_features_forbid_general_injury_and_3d_equivalence_claims(self) -> None:
        snapshot = evidence_snapshot(["left_sls_stable_knee_deg"])
        metadata = snapshot["left_sls_stable_knee_deg"]
        self.assertFalse(metadata["generalInjuryClaimAllowed"])
        self.assertFalse(metadata["equivalentTo3DKinematics"])
        self.assertTrue(metadata["requiresMeasurementValidation"])

    def test_quality_only_columns_are_identified_for_exclusion(self) -> None:
        excluded = prohibited_predictor_columns(
            ["participant_id", "left_sls_stable_knee_deg", "mean_pose_confidence"]
        )
        self.assertEqual(excluded, ["mean_pose_confidence"])


if __name__ == "__main__":
    unittest.main()
