from __future__ import annotations

import unittest

from feature_plan import validate_feature_plan


def plan(*, authorized: bool = False) -> dict[str, object]:
    return {
        "schemaVersion": "1.0.0",
        "planId": "example-28d-v1",
        "planVersion": "1.0.0",
        "planSource": "Frozen before predictive performance evaluation.",
        "specifiedBeforePerformanceEvaluation": True,
        "postHocFeatureExpansionAllowed": False,
        "outcomeName": "any recorded injury",
        "predictionHorizonDays": 28,
        "independenceUnit": "participant",
        "candidatePredictors": ["previous_injury_count", "training_minutes_7d"],
        "modelFamilies": ["logistic_regression", "random_forest", "extra_trees"],
        "transformations": {
            "missingness": "fold-local median imputation",
            "logisticScaling": "fold-local standardization",
        },
        "modelFittingAuthorized": authorized,
        "modelFittingAuthorizationRationale": (
            "Information audit only; sample-size justification is not yet complete."
            if not authorized
            else "A pre-specified sample-size calculation supports this development analysis."
        ),
        "sampleSizeMethod": None if not authorized else "Pre-specified Riley-style binary prediction-model calculation.",
    }


class FeaturePlanTests(unittest.TestCase):
    def test_information_audit_plan_can_be_valid_without_authorizing_model_fit(self) -> None:
        report = validate_feature_plan(
            plan(authorized=False),
            expected_features=["previous_injury_count", "training_minutes_7d"],
            expected_model_families=["logistic_regression", "random_forest", "extra_trees"],
            expected_horizon_days=28,
            expected_outcome_name="any recorded injury",
        )
        self.assertTrue(report["passed"])
        self.assertFalse(report["modelFittingAuthorized"])

    def test_strict_training_refuses_locked_plan(self) -> None:
        report = validate_feature_plan(
            plan(authorized=False),
            require_model_fitting_authorized=True,
        )
        self.assertFalse(report["passed"])
        self.assertTrue(any("does not authorize model fitting" in message for message in report["errors"]))

    def test_exact_feature_order_is_frozen(self) -> None:
        report = validate_feature_plan(
            plan(authorized=True),
            expected_features=["training_minutes_7d", "previous_injury_count"],
        )
        self.assertFalse(report["passed"])
        self.assertTrue(any("candidatePredictors" in message for message in report["errors"]))

    def test_post_hoc_feature_expansion_is_rejected(self) -> None:
        candidate = plan(authorized=True)
        candidate["postHocFeatureExpansionAllowed"] = True
        report = validate_feature_plan(candidate)
        self.assertFalse(report["passed"])

    def test_authorized_plan_requires_sample_size_method(self) -> None:
        candidate = plan(authorized=True)
        candidate["sampleSizeMethod"] = ""
        report = validate_feature_plan(candidate)
        self.assertFalse(report["passed"])
        self.assertTrue(any("sampleSizeMethod" in message for message in report["errors"]))


if __name__ == "__main__":
    unittest.main()
