from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from site_transport_stress_test import (
    leave_one_site_out_stress_test,
    validate_site_transport_design,
)


class FakeModel:
    def fit(self, X, y):
        if len(np.unique(y)) < 2:
            raise AssertionError("Training data should contain both outcome classes")
        return self

    def predict_proba(self, X):
        signal = np.asarray(X["left_sls_stable_knee_deg"], dtype=float)
        probability = np.clip(signal / 10.0, 0.02, 0.98)
        return np.column_stack([1 - probability, probability])


class IdentityCalibrator:
    def predict_proba(self, logits):
        value = np.asarray(logits, dtype=float).reshape(-1)
        probability = 1.0 / (1.0 + np.exp(-value))
        return np.column_stack([1 - probability, probability])


def multisite_dataset() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for site_index, site in enumerate(("site-a", "site-b", "site-c")):
        for participant_index in range(10):
            positive = participant_index in {0, 1, 2}
            rows.append(
                {
                    "participant_id": f"{site}-{participant_index}",
                    "site_id": site,
                    "injury_within_horizon": int(positive),
                    "previous_injury_count": int(positive),
                    "training_minutes_7d": 300 + site_index * 10 + participant_index,
                    "left_sls_stable_knee_deg": 8.0 if positive else 2.0,
                    "mean_pose_confidence": 0.93,
                }
            )
    return pd.DataFrame(rows)


class SiteTransportStressTests(unittest.TestCase):
    def test_design_requires_distinct_participants_across_sites(self) -> None:
        df = multisite_dataset()
        duplicate = df.iloc[[0]].copy()
        duplicate["site_id"] = "site-b"
        df = pd.concat([df, duplicate], ignore_index=True)
        report = validate_site_transport_design(df)
        self.assertFalse(report["passed"])
        self.assertTrue(any("more than one site" in message for message in report["errors"]))

    def test_design_requires_three_sites(self) -> None:
        df = multisite_dataset()
        df = df[df["site_id"] != "site-c"].reset_index(drop=True)
        report = validate_site_transport_design(df)
        self.assertFalse(report["passed"])
        self.assertTrue(any("At least 3 distinct sites" in message for message in report["errors"]))

    @patch("site_transport_stress_test.candidate_models")
    @patch("site_transport_stress_test._inner_model_selection")
    def test_held_out_sites_are_reported_without_external_validation_claim(
        self,
        select_model,
        model_factory,
    ) -> None:
        select_model.return_value = {
            "name": "fake",
            "threshold": 0.5,
            "calibrator": IdentityCalibrator(),
            "candidates": {"fake": {"auroc": 1.0}},
        }
        model_factory.return_value = {"fake": FakeModel()}

        report = leave_one_site_out_stress_test(
            multisite_dataset(),
            bootstrap_samples=100,
        )

        self.assertFalse(report["externalValidation"])
        self.assertEqual(report["validationClaim"], "internal-site-transport-stress-only")
        self.assertEqual(report["summary"]["reportedSites"], 3)
        self.assertFalse(report["productGate"]["eligibleForUserFacingInjuryProbability"])
        for site in ("site-a", "site-b", "site-c"):
            result = report["siteResults"][site]
            self.assertEqual(result["status"], "reported")
            self.assertNotIn(site, result["developmentSites"])
            self.assertGreater(result["metrics"]["auroc"], 0.99)


if __name__ == "__main__":
    unittest.main()
