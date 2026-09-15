import { describe, expect, it } from "vitest";
import { buildPoseStreamFrame } from "../pose/stream";
import type { PoseFrame, PoseKeypoint } from "../pose/types";
import {
  StageTwoMovementAnalyzer,
  summarizeConsistency,
  type StageTwoRepSummary,
} from "./stage-two-analysis";

const FAST_FILTER = {
  minCutoffHz: 1000,
  beta: 0,
  derivativeCutoffHz: 1000,
  resetGapMs: 750,
};

function point(index: number, x: number, y: number, visibility = 0): PoseKeypoint {
  return {
    index,
    x,
    y,
    z: 0,
    visibility,
    trusted: visibility >= 0.7,
  };
}

function kneeFrame(
  flexionDeg: number,
  timestampMs: number,
  side: "left" | "right" = "left",
  visibility = 0.95,
): PoseFrame {
  const keypoints = Array.from({ length: 33 }, (_, index) => point(index, 0, 0));
  const hipIndex = side === "left" ? 23 : 24;
  const kneeIndex = side === "left" ? 25 : 26;
  const ankleIndex = side === "left" ? 27 : 28;
  const shoulderIndex = side === "left" ? 11 : 12;

  const radians = (flexionDeg * Math.PI) / 180;
  keypoints[hipIndex] = point(hipIndex, 0.5, 0.3, visibility);
  keypoints[kneeIndex] = point(kneeIndex, 0.5, 0.5, visibility);
  keypoints[ankleIndex] = point(
    ankleIndex,
    0.5 + 0.2 * Math.sin(radians),
    0.5 + 0.2 * Math.cos(radians),
    visibility,
  );
  keypoints[shoulderIndex] = point(shoulderIndex, 0.5, 0.15, visibility);

  return {
    frameTimestamp: timestampMs,
    keypoints,
    trustedKeypointCount: keypoints.filter((item) => item.trusted).length,
  };
}

function streamFrame(frame: PoseFrame, sequence: number) {
  return buildPoseStreamFrame(frame, {
    sequence,
    callbackTimestampMs: frame.frameTimestamp,
    capturedAtEpochMs: 1_700_000_000_000 + frame.frameTimestamp,
    mediaTimeMs: frame.frameTimestamp,
    frameClock: "request-video-frame-callback",
    width: 1280,
    height: 720,
    facingMode: "user",
    delegate: "GPU",
    cameraFps: 30,
    inferenceFps: 28,
    averageInferenceLatencyMs: 18,
    inferenceLatencyMs: 16,
  });
}

function fakeRep(index: number, durationMs: number, excursionDegrees: number): StageTwoRepSummary {
  return {
    repIndex: index,
    startedMs: 0,
    endedMs: durationMs,
    peakValue: excursionDegrees,
    excursionDegrees,
    durationMs,
    meanConfidence: 0.95,
    signalAngleName: "leftKneeFlexion",
    signalLabel: "Left knee flexion",
    peakTimestampMs: durationMs / 2,
    outboundDurationMs: durationMs / 2,
    returnDurationMs: durationMs / 2,
    cadenceRpm: 60000 / durationMs,
    angleSummary: {},
  };
}

describe("StageTwoMovementAnalyzer", () => {
  it("measures filtered knee flexion and counts a complete side-view squat cycle", () => {
    const analyzer = new StageTwoMovementAnalyzer("squat-side", {
      filterConfig: FAST_FILTER,
    });
    const values = [
      ...Array.from({ length: 14 }, () => 2),
      12,
      25,
      45,
      65,
      58,
      45,
      30,
      16,
      7,
      3,
      2,
    ];

    let snapshot = analyzer.ingest(streamFrame(kneeFrame(values[0], 0), 1));
    values.slice(1).forEach((value, index) => {
      const timestampMs = (index + 1) * 120;
      snapshot = analyzer.ingest(
        streamFrame(kneeFrame(value, timestampMs), index + 2),
      );
    });

    expect(snapshot.selectedSignalAngle).toBe("leftKneeFlexion");
    expect(snapshot.consistency.repCount).toBe(1);
    expect(snapshot.completedReps[0]?.excursionDegrees ?? 0).toBeGreaterThan(50);
    expect(snapshot.completedReps[0]?.outboundDurationMs ?? 0).toBeGreaterThan(0);
    expect(snapshot.completedReps[0]?.returnDurationMs ?? 0).toBeGreaterThan(0);
    const knee = snapshot.metricSummaries.find(
      (metric) => metric.angleName === "leftKneeFlexion",
    );
    expect(knee?.sessionRangeDeg ?? 0).toBeGreaterThan(55);
  });

  it("locks rep segmentation to the more visible side", () => {
    const analyzer = new StageTwoMovementAnalyzer("squat-side", {
      filterConfig: FAST_FILTER,
    });
    let snapshot = analyzer.ingest(streamFrame(kneeFrame(2, 0, "right"), 1));
    for (let index = 1; index < 14; index += 1) {
      snapshot = analyzer.ingest(
        streamFrame(kneeFrame(2, index * 100, "right"), index + 1),
      );
    }
    expect(snapshot.selectedSignalAngle).toBe("rightKneeFlexion");
    expect(snapshot.selectedSide).toBe("right");
  });

  it("does not create rep counts for frontal exploratory metrics", () => {
    const analyzer = new StageTwoMovementAnalyzer("general-front", {
      filterConfig: FAST_FILTER,
    });
    const snapshot = analyzer.ingest(streamFrame(kneeFrame(40, 0), 1));
    expect(snapshot.selectedSignalAngle).toBeNull();
    expect(snapshot.consistency.repCount).toBe(0);
    expect(snapshot.interpretationBoundary).toBe(
      "measurement-only-no-risk-classification",
    );
  });
});

describe("summarizeConsistency", () => {
  it("reports duration and excursion variability after multiple reps", () => {
    const summary = summarizeConsistency([
      fakeRep(1, 2000, 60),
      fakeRep(2, 2200, 64),
      fakeRep(3, 1800, 56),
    ]);
    expect(summary.repCount).toBe(3);
    expect(summary.meanRepDurationMs).toBeCloseTo(2000, 6);
    expect(summary.durationCoefficientOfVariationPct ?? 0).toBeGreaterThan(0);
    expect(summary.excursionCoefficientOfVariationPct ?? 0).toBeGreaterThan(0);
  });

  it("does not invent a consistency statistic from one rep", () => {
    const summary = summarizeConsistency([fakeRep(1, 2000, 60)]);
    expect(summary.durationCoefficientOfVariationPct).toBeNull();
    expect(summary.excursionCoefficientOfVariationPct).toBeNull();
  });
});
