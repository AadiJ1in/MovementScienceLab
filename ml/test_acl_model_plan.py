from __future__ import annotations

import unittest

from acl_model_plan import validate_acl_model_plan


class AclModelPlanTests(unittest.TestCase):
    def base_plan(self):
        return {
            "specifiedBeforeModelFitting": True,
            "targetColumn": "acl_tear_within_horizon",
            "participantColumn": "participant_id",
            "exposureColumn": "sport_exposure_hours_28d",
            "selectedPredictors": [
                "prior_acl_rupture",
                "hip_adductor_abductor_ratio",
                "dynamic_knee_valgus_deg",
                "acute_fatigue_score",
            ],
            "modelFamilies": [
                "logistic_regression",
                "exposure_adjusted_hazard",
            ],
            "predictorSelectionRationale": (
                "Pre-specified unit-test feature set spanning ACL history, strength, video biomechanics, and exposure/fatigue."
            ),
            "clinicalProbabilityDisplayAllowed": False,
        }

    def test_valid_plan_passes(self) -> None:
        report = validate_acl_model_plan(self.base_plan())
        self.assertTrue(report["passed"], report["errors"])
        self.assertEqual(
            set(report["selectedDomains"]),
            {"acl_history", "strength", "video_biomechanics", "exposure_fatigue"},
        )

    def test_measurement_quality_cannot_be_predictor(self) -> None:
        plan = self.base_plan()
        plan["selectedPredictors"].append("mean_pose_confidence")
        report = validate_acl_model_plan(plan)
        self.assertFalse(report["passed"])
        self.assertTrue(
            any("Measurement-quality" in error for error in report["errors"])
        )

    def test_plan_must_precede_model_fitting(self) -> None:
        plan = self.base_plan()
        plan["specifiedBeforeModelFitting"] = False
        report = validate_acl_model_plan(plan)
        self.assertFalse(report["passed"])

    def test_clinical_probability_must_stay_locked(self) -> None:
        plan = self.base_plan()
        plan["clinicalProbabilityDisplayAllowed"] = True
        report = validate_acl_model_plan(plan)
        self.assertFalse(report["passed"])


if __name__ == "__main__":
    unittest.main()
