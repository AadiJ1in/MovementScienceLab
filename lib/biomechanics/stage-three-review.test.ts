import { describe, expect, it } from "vitest";
import type { StageTwoAnalysisSnapshot, StageTwoRepSummary } from "./stage-two-analysis";
import {
  DEFAULT_STAGE_THREE_RULES,
  evaluateStageThreeSnapshot,
  mergeStageThreeFlags,
  parseStageThreeRules,
  type StageThreeRule,
} from "./stage-three-review";

const frameRule: StageThreeRule = {
  id: "squat-front-left-knee-test",
  protocolId: "test-protocol-v1",
  movement: "squat-front",
  scope: "frame",
  metric: "leftKneeFrontalDeviation",
  label: "Test-only left knee projection review",
  comparator: "greaterThan",
  threshold: 10,
  severity: "caution",
  sourceLabel: "Test-only source",
  sourceUrl: "https://example.com/stage-three-test",
  sourceMeasurementMethod: "Test-only frontal 2D projection method",
  reviewedBy: "Test Reviewer",
  reviewedAt: "2026-09-15T12:00:00Z",
};

const repRule: StageThreeRule = {
  ...frameRule,
  id: "squat-side-excursion-test",
  movement: "squat-side",
  scope: "rep",
  metric: "repExcursionDeg",
  label: "Test-only rep excursion review",
  comparator: "lessThan",
  threshold: 40,
};

function snapshot(
  movement: StageTwoAnalysisSnapshot["movement"] = "squat-front",
  latestRep: StageTwoRepSummary | null = null,
): StageTwoAnalysisSnapshot {
  return {
    schemaVersion: "2.0.0",
    movement,
    movementLabel: movement,
    processedFrames: 100,
    framesWithMeasurements: 95,
    measurementFrameFraction: 0.95,
    selectedSignalAngle: movement === "squat-side" ? "leftKneeFlexion" : null,
    selectedSide: movement === "squat-side" ? "left" : null,
    latestMetrics: [
      {
        angleName: "leftKneeFrontalDeviation",
        label: "Left knee line deviation",
        rawValueDeg: 15,
        filteredValueDeg: 14,
        confidence: 0.94,
        timestampMs: 1200,
      },
    ],
    metricSummaries: [],
    completedReps: latestRep ? [latestRep] : [],
    consistency: {
      repCount: latestRep ? 1 : 0,
      meanRepDurationMs: latestRep?.durationMs ?? null,
      meanCadenceRpm: latestRep?.cadenceRpm ?? null,
      durationCoefficientOfVariationPct: null,
      excursionCoefficientOfVariationPct: null,
    },
    latestCompletedRep: latestRep,
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

function completedRep(): StageTwoRepSummary {
  return {
    repIndex: 1,
    startedMs: 1000,
    endedMs: 3000,
    peakValue: 90,
    excursionDegrees: 35,
    durationMs: 2000,
    meanConfidence: 0.92,
    signalAngleName: "leftKneeFlexion",
    signalLabel: "Left knee flexion",
    peakTimestampMs: 1800,
    outboundDurationMs: 800,
    returnDurationMs: 1200,
    cadenceRpm: 30,
    angleSummary: {},
  };
}

describe("Stage 3 rule parsing", () => {
  it("ships with no invented default clinical thresholds", () => {
    expect(DEFAULT_STAGE_THREE_RULES).toEqual([]);
  });

  it("accepts a fully sourced and reviewed frame rule", () => {
    expect(parseStageThreeRules([frameRule])).toEqual([frameRule]);
  });

  it("rejects rules without review provenance", () => {
    const candidate = { ...frameRule } as Partial<StageThreeRule>;
    delete candidate.reviewedBy;
    expect(() => parseStageThreeRules([candidate])).toThrow(/reviewedBy/);
  });

  it("rejects exercise-incompatible metrics", () => {
    expect(() =>
      parseStageThreeRules([
        {
          ...frameRule,
          movement: "shoulder-flexion-side",
          metric: "leftKneeFrontalDeviation",
        },
      ]),
    ).toThrow(/not available/);
  });

  it("rejects rep rules for profiles without rep segmentation", () => {
    expect(() =>
      parseStageThreeRules([
        {
          ...repRule,
          movement: "squat-front",
        },
      ]),
    ).toThrow(/requires rep segmentation/);
  });
});

describe("Stage 3 snapshot evaluation", () => {
  it("flags a filtered frame measurement and preserves provenance", () => {
    const [flag] = evaluateStageThreeSnapshot(snapshot(), [frameRule]);
    expect(flag?.scope).toBe("frame");
    expect(flag?.measuredValue).toBe(14);
    expect(flag?.excess).toBe(4);
    expect(flag?.timestampMs).toBe(1200);
    expect(flag?.sourceLabel).toBe("Test-only source");
    expect(flag?.interpretationBoundary).toBe("review-indicator-not-injury-risk");
  });

  it("flags a completed rep metric without converting it into injury probability", () => {
    const [flag] = evaluateStageThreeSnapshot(snapshot("squat-side", completedRep()), [repRule]);
    expect(flag?.scope).toBe("rep");
    expect(flag?.repIndex).toBe(1);
    expect(flag?.measuredValue).toBe(35);
    expect(flag?.excess).toBe(5);
    expect(flag?.unit).toBe("deg");
  });

  it("does not apply a rule to another exercise", () => {
    expect(evaluateStageThreeSnapshot(snapshot("squat-side", completedRep()), [frameRule])).toEqual([]);
  });
});

describe("Stage 3 event reduction", () => {
  it("keeps the larger nearby frame exceedance for the same rule", () => {
    const first = evaluateStageThreeSnapshot(snapshot(), [frameRule])[0]!;
    const second = {
      ...first,
      id: `${first.ruleId}:frame:1500`,
      timestampMs: 1500,
      measuredValue: 18,
      excess: 8,
    };
    const merged = mergeStageThreeFlags([first], [second]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.excess).toBe(8);
    expect(merged[0]?.timestampMs).toBe(1500);
  });

  it("keeps only one event per rule and completed rep", () => {
    const first = evaluateStageThreeSnapshot(snapshot("squat-side", completedRep()), [repRule])[0]!;
    const duplicate = { ...first, excess: first.excess + 1 };
    const merged = mergeStageThreeFlags([first], [duplicate]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.excess).toBe(6);
  });
});
