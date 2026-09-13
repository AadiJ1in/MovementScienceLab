from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from camera_measurement_validation import (
    bland_altman,
    build_measurement_validation_report,
    icc_absolute_agreement,
    validate_measurement_dataset,
)


def validation_dataset() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for participant in range(12):
        true_value = 4.0 + participant * 0.5
        for session_index, session in enumerate(("day-1", "day-2")):
            webcam = true_value + (0.4 if session_index == 1 else 0.0)
            reference = true_value - 0.3
            rows.append(
                {
                    "participant_id": f"p-{participant:02d}",
                    "session_id": session,
                    "metric_name": "single_leg_knee_projection",
                    "side": "left",
                    "webcam_deg": webcam,
                    "reference_deg": reference,
                    "camera_measurement_version": "sls-fpkpa-v1",
                    "device_model": "laptop-a" if participant < 6 else "laptop-b",
                    "capture_condition": "standardized",
                }
            )
    return pd.DataFrame(rows)


class CameraMeasurementValidationTests(unittest.TestCase):
    def test_bland_altman_reports_bias_and_limits(self) -> None:
        result = bland_altman(
            np.array([1.0, 2.0, 3.0]),
            np.array([0.0, 1.0, 2.0]),
        )
        self.assertAlmostEqual(result["biasDeg"], 1.0)
        self.assertAlmostEqual(result["meanAbsoluteErrorDeg"], 1.0)
        self.assertAlmostEqual(result["lower95LimitOfAgreementDeg"], 1.0)
        self.assertAlmostEqual(result["upper95LimitOfAgreementDeg"], 1.0)

    def test_identical_sessions_have_perfect_absolute_agreement(self) -> None:
        matrix = np.array(
            [
                [1.0, 1.0],
                [2.0, 2.0],
                [3.0, 3.0],
                [4.0, 4.0],
            ]
        )
        result = icc_absolute_agreement(matrix)
        self.assertAlmostEqual(result["iccA1"], 1.0)
        self.assertAlmostEqual(result["semAgreementDeg"], 0.0)
        self.assertAlmostEqual(result["mdc95Deg"], 0.0)

    def test_validation_report_separates_repeatability_and_reference_agreement(self) -> None:
        report = build_measurement_validation_report(
            validation_dataset(),
            session_a="day-1",
            session_b="day-2",
            bootstrap_samples=100,
        )
        metric = report["metrics"]["single_leg_knee_projection::left"]
        self.assertEqual(metric["repeatability"]["status"], "reported")
        self.assertEqual(metric["criterionAgreement"]["status"], "reported")
        self.assertAlmostEqual(
            metric["repeatability"]["repeatability"]["biasDeg"],
            -0.4,
            places=6,
        )
        self.assertGreater(metric["repeatability"]["icc"]["iccA1"], 0.9)
        self.assertFalse(report["interpretation"]["equivalentToThreeDimensionalBiomechanics"])
        self.assertFalse(report["interpretation"]["automaticClinicalPassThresholdApplied"])
        self.assertFalse(report["productGate"]["eligibleForInjuryDiagnosis"])

    def test_measurement_versions_cannot_be_pooled(self) -> None:
        df = validation_dataset()
        df.loc[0, "camera_measurement_version"] = "different-version"
        audit = validate_measurement_dataset(df)
        self.assertFalse(audit["passed"])
        self.assertTrue(any("one camera_measurement_version" in message for message in audit["errors"]))

    def test_repeatability_without_reference_remains_available(self) -> None:
        df = validation_dataset().drop(columns=["reference_deg"])
        report = build_measurement_validation_report(
            df,
            session_a="day-1",
            session_b="day-2",
            bootstrap_samples=100,
        )
        metric = report["metrics"]["single_leg_knee_projection::left"]
        self.assertEqual(metric["repeatability"]["status"], "reported")
        self.assertEqual(metric["criterionAgreement"]["status"], "reference-unavailable")


if __name__ == "__main__":
    unittest.main()
