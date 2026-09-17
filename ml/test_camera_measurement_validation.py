from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from camera_measurement_validation import (
    bland_altman,
    build_measurement_validation_report,
    icc_absolute_agreement,
    normalize_measurement_columns,
    validate_measurement_dataset,
)


def validation_dataset(*, public_value_columns: bool = False) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for participant in range(12):
        true_value = 40.0 + participant * 1.2
        for session_index, session in enumerate(("day-1", "day-2")):
            webcam = true_value + (0.4 if session_index == 1 else 0.0)
            reference = true_value - 0.3
            row: dict[str, object] = {
                "participant_id": f"p-{participant:02d}",
                "session_id": session,
                "metric_name": "single_leg_knee_projection",
                "side": "left",
                "camera_measurement_version": "sls-fpkpa-v1",
                "device_model": "laptop-a" if participant < 6 else "laptop-b",
                "resolution": "1280x720",
                "camera_distance": 2.0,
                "distance_bin": "protocol-2m",
                "capture_condition": "standardized",
                "view": "front",
                "lighting_condition": "standard",
                "clothing_occlusion_condition": "unoccluded",
            }
            if public_value_columns:
                row["webcam_value"] = webcam
                row["reference_value"] = reference
            else:
                row["webcam_deg"] = webcam
                row["reference_deg"] = reference
            rows.append(row)
    return pd.DataFrame(rows)


class CameraMeasurementValidationTests(unittest.TestCase):
    def test_bland_altman_reports_bias_error_and_limits(self) -> None:
        result = bland_altman(
            np.array([1.0, 2.0, 3.0]),
            np.array([0.0, 1.0, 2.0]),
        )
        self.assertAlmostEqual(result["biasDeg"], 1.0)
        self.assertAlmostEqual(result["meanAbsoluteErrorDeg"], 1.0)
        self.assertAlmostEqual(result["rmseDeg"], 1.0)
        self.assertAlmostEqual(result["sdDifferenceDeg"], 0.0)
        self.assertAlmostEqual(result["lower95LimitOfAgreementDeg"], 1.0)
        self.assertAlmostEqual(result["upper95LimitOfAgreementDeg"], 1.0)
        self.assertAlmostEqual(result["half95LimitOfAgreementSpanDeg"], 0.0)

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

    def test_public_value_schema_is_normalized(self) -> None:
        normalized, notes = normalize_measurement_columns(
            validation_dataset(public_value_columns=True)
        )
        self.assertIn("webcam_deg", normalized.columns)
        self.assertIn("reference_deg", normalized.columns)
        self.assertTrue(any("webcam_value" in note for note in notes))
        audit = validate_measurement_dataset(validation_dataset(public_value_columns=True))
        self.assertTrue(audit["passed"])

    def test_conflicting_public_and_internal_columns_fail_closed(self) -> None:
        df = validation_dataset()
        df["webcam_value"] = df["webcam_deg"] + 5
        audit = validate_measurement_dataset(df)
        self.assertFalse(audit["passed"])
        self.assertTrue(any("conflicting values" in error for error in audit["errors"]))

    def test_validation_report_separates_repeatability_and_reference_agreement(self) -> None:
        report = build_measurement_validation_report(
            validation_dataset(public_value_columns=True),
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

        agreement = metric["criterionAgreement"]["agreement"]
        reliability = metric["criterionAgreement"]["agreementReliability"]
        self.assertIn("meanAbsoluteErrorDeg", agreement)
        self.assertIn("rmseDeg", agreement)
        self.assertIn("biasDeg", agreement)
        self.assertIn("lower95LimitOfAgreementDeg", agreement)
        self.assertIn("upper95LimitOfAgreementDeg", agreement)
        self.assertGreater(reliability["iccA1"], 0.9)
        self.assertGreaterEqual(reliability["semAgreementDeg"], 0)
        self.assertGreaterEqual(reliability["mdc95Deg"], 0)

        uncertainty = metric["criterionAgreement"]["participantClusterUncertainty"]
        self.assertEqual(uncertainty["status"], "reported")
        self.assertIsNotNone(uncertainty["meanAbsoluteErrorDeg"])
        self.assertIsNotNone(uncertainty["lower95LimitOfAgreementDeg"])
        self.assertIsNotNone(uncertainty["iccA1"])

        self.assertFalse(report["interpretation"]["equivalentToThreeDimensionalBiomechanics"])
        self.assertFalse(report["interpretation"]["poseConfidenceEquivalentToMeasurementAccuracy"])
        self.assertFalse(report["interpretation"]["automaticClinicalPassThresholdApplied"])
        self.assertFalse(report["productGate"]["eligibleForInjuryDiagnosis"])

    def test_condition_reports_cover_requested_camera_strata(self) -> None:
        report = build_measurement_validation_report(
            validation_dataset(),
            session_a="day-1",
            session_b="day-2",
            bootstrap_samples=100,
        )
        conditions = report["metrics"]["single_leg_knee_projection::left"]["conditionReports"]
        self.assertIn("device_model", conditions)
        self.assertIn("resolution", conditions)
        self.assertIn("distance_bin", conditions)
        self.assertIn("capture_condition", conditions)
        self.assertIn("view", conditions)
        self.assertIn("lighting_condition", conditions)
        self.assertIn("clothing_occlusion_condition", conditions)
        self.assertEqual(conditions["camera_distance"]["status"], "descriptive-continuous")
        self.assertEqual(conditions["device_model"]["laptop-a"]["status"], "insufficient-participants")
        self.assertEqual(conditions["resolution"]["1280x720"]["status"], "reported")

    def test_protocol_supplied_acceptance_can_be_evaluated_without_builtin_cutoffs(self) -> None:
        report = build_measurement_validation_report(
            validation_dataset(),
            session_a="day-1",
            session_b="day-2",
            bootstrap_samples=100,
            protocol_acceptance={
                "single_leg_knee_projection": {
                    "maxMaeDeg": 1.0,
                    "maxRmseDeg": 1.0,
                    "maxAbsBiasDeg": 1.0,
                    "minIccA1": 0.9,
                    "maxMdc95Deg": 2.0,
                }
            },
        )
        gate = report["metrics"]["single_leg_knee_projection::left"]["protocolAcceptance"]
        self.assertEqual(gate["status"], "evaluated")
        self.assertTrue(gate["passed"])
        self.assertTrue(report["protocolAcceptanceCriteriaProvided"])

    def test_without_protocol_no_acceptance_threshold_is_implied(self) -> None:
        report = build_measurement_validation_report(
            validation_dataset(),
            session_a="day-1",
            session_b="day-2",
            bootstrap_samples=100,
        )
        gate = report["metrics"]["single_leg_knee_projection::left"]["protocolAcceptance"]
        self.assertEqual(gate["status"], "not-specified")
        self.assertIsNone(gate["passed"])

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
