from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from export_portable_injury_model import build_portable_artifact
from prospective_injury_benchmark import candidate_models, fit_calibrator


class PortableInjuryModelExportTests(unittest.TestCase):
    def _bundle(self):
        features = ["previous_injury_count", "pain_score", "camera_peak_trunk_lean_deg"]
        X = pd.DataFrame(
            {
                "previous_injury_count": [0, 1, 2, 0, 3, 1, 2, 0, 2, 3, 1, 0],
                "pain_score": [0, 2, 4, 1, 7, 3, 6, 0, 5, 8, 2, 1],
                "camera_peak_trunk_lean_deg": [6, 8, 12, 5, 20, 10, 18, 4, 14, 22, 9, 5],
            }
        )
        y = np.asarray([0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0], dtype=int)
        model = candidate_models(features)["logistic_regression"]
        model.fit(X, y)
        raw = model.predict_proba(X)[:, 1]
        calibrator = fit_calibrator(raw, y)
        return {
            "features": features,
            "portableLogisticModel": model,
            "portableLogisticCalibrator": calibrator,
            "portableLogisticThreshold": 0.5,
            "portableLogisticDevelopmentMetrics": {
                "auroc": 0.8,
                "auprc": 0.7,
                "brier": 0.16,
                "calibrationSlope": 1.0,
                "calibrationIntercept": 0.0,
            },
        }

    def _artifact(self, gate=True):
        return {
            "outcome": {"label": "injury_within_horizon", "horizonDays": 28},
            "population": "test cohort",
            "cameraMeasurementVersion": "mediapipe-2d-v1",
            "validation": {
                "splitUnit": "participant",
                "nestedEvaluation": True,
                "featureTimingAudited": True,
                "nParticipants": 50,
                "nRows": 200,
                "externalValidated": False,
                "cameraDomainValidated": False,
            },
            "deploymentGate": {"internalEngineeringGate": {"passed": gate}},
        }

    def test_exports_exact_preprocessing_and_coefficients(self):
        portable = build_portable_artifact(
            self._bundle(),
            self._artifact(),
            source_label="test",
            source_url=None,
            model_version="test-1",
        )
        self.assertEqual(portable["trainingDataType"], "prospective-human")
        self.assertEqual(len(portable["features"]), 3)
        self.assertEqual(len(portable["model"]["coefficients"]), 3)
        self.assertEqual(portable["featureDomains"]["camera_peak_trunk_lean_deg"], "camera_biomechanics")
        self.assertTrue(portable["deploymentGate"]["eligibleForResearchRiskEstimate"])
        self.assertFalse(portable["deploymentGate"]["eligibleForUserFacingInjuryProbability"])

    def test_internal_gate_failure_keeps_research_estimate_disabled(self):
        portable = build_portable_artifact(
            self._bundle(),
            self._artifact(gate=False),
            source_label="test",
            source_url=None,
            model_version="test-2",
        )
        self.assertFalse(portable["deploymentGate"]["eligibleForResearchRiskEstimate"])

    def test_missing_portable_candidate_fails_closed(self):
        with self.assertRaises(ValueError):
            build_portable_artifact(
                {"features": ["previous_injury_count"]},
                self._artifact(),
                source_label="test",
                source_url=None,
                model_version="test-3",
            )


if __name__ == "__main__":
    unittest.main()
