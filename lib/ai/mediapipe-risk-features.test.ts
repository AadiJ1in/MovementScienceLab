import { describe, expect, it } from "vitest";
import {
  EMPTY_MEDIAPIPE_RISK_FEATURES,
  extractMediaPipeRiskFeatures,
  mergeMediaPipeRiskFeatures,
} from "./mediapipe-risk-features";
import type { StageTwoAnalysisSnapshot } from "@/lib/biomechanics/stage-two-analysis";

function snapshot(): StageTwoAnalysisSnapshot {
  return {
    schemaVersion: "2.0.0",
    movement: "squat-side",
    movementLabel: "Squat — side view",
    processedFrames: 120,
    framesWithMeasurements: 108,
    measurementFrameFraction: 0.9,
    selectedSignalAngle: "leftKneeFlexion",
    selectedSide: "left",
    latestMetrics: [],
    metricSummaries: [
      {
        angleName: "leftKneeFlexion",
        label: "Left knee flexion",
        currentDeg: 55,
        rawCurrentDeg: 56,
        sessionMinDeg: 5,
        sessionMaxDeg: 90,
        sessionRangeDeg: 85,
        meanDeg: 44,
        meanConfidence: 0.92,
        samples: 100,
      },
      {
        angleName: "rightKneeFlexion",
        label: "Right knee flexion",
        currentDeg: 52,
        rawCurrentDeg: 53,
        sessionMinDeg: 5,
        sessionMaxDeg: 84,
        sessionRangeDeg: 79,
        meanDeg: 40,
        meanConfidence: 0.88,
        samples: 95,
      },
      {
        angleName: "trunkLean",
        label: "Trunk lean",
        currentDeg: 10,
        rawCurrentDeg: 11,
        sessionMinDeg: 2,
        sessionMaxDeg: 18,
        sessionRangeDeg: 16,
        meanDeg: 9,
        meanConfidence: 0.9,
        samples: 100,
      },
    ],
    completedReps: [
      {
        repIndex: 1,
        startedMs: 0,
        endedMs: 1000,
        durationMs: 1000,
        excursionDegrees: 70,
        peakValue: 80,
        signalAngleName: "leftKneeFlexion",
        signalLabel: "Left knee flexion",
        peakTimestampMs: 500,
        outboundDurationMs: 500,
        returnDurationMs: 500,
        cadenceRpm: 60,
        angleSummary: {},
      },
      {
        repIndex: 2,
        startedMs: 1200,
        endedMs: 2300,
        durationMs: 1100,
        excursionDegrees: 76,
        peakValue: 86,
        signalAngleName: "leftKneeFlexion",
        signalLabel: "Left knee flexion",
        peakTimestampMs: 1750,
        outboundDurationMs: 550,
        returnDurationMs: 550,
        cadenceRpm: 54.5,
        angleSummary: {},
      },
    ],
    consistency: {
      repCount: 2,
      meanRepDurationMs: 1050,
      meanCadenceRpm: 57.25,
      durationCoefficientOfVariationPct: 4.76,
      excursionCoefficientOfVariationPct: 4.11,
    },
    latestCompletedRep: null,
    filter: {
      type: "one-euro",
      minCutoffHz: 1.2,
      beta: 0.035,
      derivativeCutoffHz: 1,
      resetGapMs: 750,
    },
    interpretationBoundary: "measurement-only-no-risk-classification",
  };
}

describe("MediaPipe research-risk feature extraction", () => {
  it("derives asymmetry, trunk, rep variability, and tracking quality", () => {
    const result = extractMediaPipeRiskFeatures(snapshot());
    expect(result.camera_knee_flexion_asymmetry_deg).toBe(4);
    expect(result.camera_peak_trunk_lean_deg).toBe(18);
    expect(result.camera_rep_excursion_variability_deg).toBeCloseTo(3, 6);
    expect(result.camera_rep_duration_cv_pct).toBeCloseTo(4.76, 6);
    expect(result.mean_pose_confidence).toBeCloseTo(0.9, 6);
    expect(result.camera_measurement_frame_fraction).toBe(0.9);
  });

  it("merges complementary front and side signatures without erasing known values", () => {
    const merged = mergeMediaPipeRiskFeatures(
      {
        ...EMPTY_MEDIAPIPE_RISK_FEATURES,
        camera_peak_knee_frontal_deviation_deg: 11,
      },
      {
        ...EMPTY_MEDIAPIPE_RISK_FEATURES,
        camera_knee_flexion_asymmetry_deg: 4,
      },
    );
    expect(merged.camera_peak_knee_frontal_deviation_deg).toBe(11);
    expect(merged.camera_knee_flexion_asymmetry_deg).toBe(4);
  });
});
