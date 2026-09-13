from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from evaluate_external_injury_model import (
    evaluate_external_cohort,
    validate_external_identity,
    validate_model_bundle,
)


class NoFitProbabilityModel:
    def fit(self, *_args, **_kwargs):
        raise AssertionError("External evaluation must never refit the model")

    def predict_proba(self, X):
        probability = np.clip(np.asarray(X["risk_feature"], dtype=float), 0.01, 0.99)
        return np.column_stack([1.0 - probability, probability])


class IdentityLogitCalibrator:
    def fit(self, *_args, **_kwargs):
        raise AssertionError("External evaluation must never refit calibration")

    def predict_proba(self, logits):
        value = np.asarray(logits, dtype=float).reshape(-1)
        probability = 1.0 / (1.0 + np.exp(-value))
        return np.column_stack([1.0 - probability, probability])


def base_bundle() -> dict:
    return {
        "model": NoFitProbabilityModel(),
        "calibrator": IdentityLogitCalibrator(),
        "threshold": 0.5,
        "features": ["risk_feature"],
        "cameraMeasurementVersion": "sls-fpkpa-v1",
        "researchOnly": True,
        "eligibleForUserFacingInjuryProbability": False,
        "developmentInputSha256": "development-hash",
        "developmentCohortId": "development-cohort",
    }


def external_rows() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    start = pd.Timestamp("2026-01-01T12:00:00Z")
    for participant in range(24):
        index_time = start + pd.Timedelta(days=participant)
        positive = participant % 4 == 0
        rows.append(
            {
                "participant_id": f"ext-{participant:02d}",
                "index_time": index_time.isoformat(),
                "feature_cutoff_time": (index_time - pd.Timedelta(minutes=10)).isoformat(),
                "outcome_window_end": (index_time + pd.Timedelta(days=28)).isoformat(),
                "injury_within_horizon": int(positive),
                "injury_event_time": (
                    (index_time + pd.Timedelta(days=10)).isoformat() if positive else None
                ),
                "outcome_event_id": f"event-{participant}" if positive else None,
                "risk_feature": 0.82 if positive else 0.18,
                "camera_measurement_version": "sls-fpkpa-v1",
            }
        )
    return pd.DataFrame(rows)


class ExternalInjuryValidationTests(unittest.TestCase):
    def test_identity_gate_rejects_development_reuse(self) -> None:
        bundle = base_bundle()
        blockers = validate_external_identity(
            bundle=bundle,
            external_input_sha256="development-hash",
            external_cohort_id="development-cohort",
            camera_measurement_version="different-version",
            participant_independence_attested=False,
        )
        self.assertGreaterEqual(len(blockers), 4)

    def test_model_bundle_must_remain_research_only(self) -> None:
        bundle = base_bundle()
        bundle["eligibleForUserFacingInjuryProbability"] = True
        with self.assertRaises(ValueError):
            validate_model_bundle(bundle)

    def test_external_evaluation_uses_frozen_model_without_fit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_path = root / "model.joblib"
            csv_path = root / "external.csv"
            report_path = root / "external-report.json"
            joblib.dump(base_bundle(), model_path)
            external_rows().to_csv(csv_path, index=False)

            report = evaluate_external_cohort(
                model_path,
                csv_path,
                report_path,
                horizon_days=28,
                external_cohort_id="external-cohort-01",
                external_population="synthetic test population",
                camera_measurement_version="sls-fpkpa-v1",
                participant_independence_attested=True,
                allow_overlapping_windows=False,
                bootstrap_samples=100,
            )

            self.assertTrue(report_path.exists())
            self.assertFalse(report["modelRefitDuringEvaluation"])
            self.assertTrue(report["externalValidationGate"]["passedIdentityAndDomainChecks"])
            self.assertGreater(report["evaluation"]["metrics"]["auroc"], 0.9)
            self.assertFalse(report["productGate"]["eligibleForUserFacingInjuryProbability"])


if __name__ == "__main__":
    unittest.main()
