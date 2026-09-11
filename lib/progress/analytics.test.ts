import { describe, expect, it } from "vitest";
import {
  areSessionsCompatible,
  baselineChange,
  compatibilityKey,
  computeBaseline,
  filterByDateRange,
  metricValue,
  normalizeRepTrajectory,
  type ProgressSession,
} from "./analytics";

function session(overrides: Partial<ProgressSession> = {}): ProgressSession {
  return {
    id: overrides.id ?? "s1",
    startedAt: overrides.startedAt ?? "2026-09-01T12:00:00.000Z",
    endedAt: overrides.endedAt ?? "2026-09-01T12:00:10.000Z",
    captureMode: overrides.captureMode ?? "squat-side",
    measurementVersion: overrides.measurementVersion ?? "mediapipe-2d-v1",
    measurementDefinitionVersion: overrides.measurementDefinitionVersion ?? "movement-definitions-v1",
    captureFps: overrides.captureFps ?? 30,
    angleSamples: overrides.angleSamples ?? [
      { frameTimestampMs: 0, angleName: "leftKneeFlexion", valueDegrees: 5, confidence: 0.9 },
      { frameTimestampMs: 500, angleName: "leftKneeFlexion", valueDegrees: 55, confidence: 0.8 },
      { frameTimestampMs: 1000, angleName: "leftKneeFlexion", valueDegrees: 10, confidence: 0.95 },
      { frameTimestampMs: 0, angleName: "rightKneeFlexion", valueDegrees: 8, confidence: 0.9 },
      { frameTimestampMs: 500, angleName: "rightKneeFlexion", valueDegrees: 48, confidence: 0.85 },
      { frameTimestampMs: 1000, angleName: "rightKneeFlexion", valueDegrees: 12, confidence: 0.9 },
    ],
    reps: overrides.reps ?? [
      { repIndex: 1, startedMs: 0, endedMs: 1000, angleSummary: { leftKneeFlexion: { min: 5, max: 55 }, rightKneeFlexion: { min: 8, max: 48 } } },
    ],
  };
}

describe("progress compatibility", () => {
  it("requires capture mode, measurement version, definition version, and metric to match", () => {
    const a = session();
    expect(areSessionsCompatible(a, session({ id: "s2" }), "leftKneeFlexion")).toBe(true);
    expect(areSessionsCompatible(a, session({ id: "s2", captureMode: "squat-front" }), "leftKneeFlexion")).toBe(false);
    expect(areSessionsCompatible(a, session({ id: "s2", measurementVersion: "v2" }), "leftKneeFlexion")).toBe(false);
    expect(areSessionsCompatible(a, session({ id: "s2", measurementDefinitionVersion: "definition-v2" }), "leftKneeFlexion")).toBe(false);
    expect(compatibilityKey(a, "leftKneeFlexion")).toContain("squat-side::side::mediapipe-2d-v1::movement-definitions-v1");
  });
});

describe("progress metrics", () => {
  it("computes angle excursion and a neutral left/right difference proxy", () => {
    const value = session();
    expect(metricValue(value, "excursion", "leftKneeFlexion")).toBe(50);
    expect(metricValue(value, "symmetry-proxy", "leftKneeFlexion")).toBe(10);
  });

  it("computes tracking confidence and session duration", () => {
    const value = session();
    expect(metricValue(value, "tracking-confidence", "leftKneeFlexion")).toBeCloseTo((0.9 + 0.8 + 0.95) / 3 * 100);
    expect(metricValue(value, "session-duration", "leftKneeFlexion")).toBe(10);
  });
});

describe("baselines", () => {
  it("uses the earliest compatible N sessions and reports robust summary statistics", () => {
    const sessions = [
      session({ id: "three", startedAt: "2026-09-03T00:00:00Z", angleSamples: [
        { frameTimestampMs: 0, angleName: "leftKneeFlexion", valueDegrees: 0, confidence: 0.9 },
        { frameTimestampMs: 100, angleName: "leftKneeFlexion", valueDegrees: 30, confidence: 0.9 },
      ] }),
      session({ id: "one", startedAt: "2026-09-01T00:00:00Z", angleSamples: [
        { frameTimestampMs: 0, angleName: "leftKneeFlexion", valueDegrees: 0, confidence: 0.9 },
        { frameTimestampMs: 100, angleName: "leftKneeFlexion", valueDegrees: 10, confidence: 0.9 },
      ] }),
      session({ id: "two", startedAt: "2026-09-02T00:00:00Z", angleSamples: [
        { frameTimestampMs: 0, angleName: "leftKneeFlexion", valueDegrees: 0, confidence: 0.9 },
        { frameTimestampMs: 100, angleName: "leftKneeFlexion", valueDegrees: 20, confidence: 0.9 },
      ] }),
    ];
    const baseline = computeBaseline(sessions, "excursion", "leftKneeFlexion", 3);
    expect(baseline?.mean).toBe(20);
    expect(baseline?.median).toBe(20);
    expect(baseline?.sessionIds).toEqual(["one", "two", "three"]);
    expect(baselineChange(28, baseline)?.delta).toBe(8);
  });
});

describe("trajectory normalization", () => {
  it("interpolates a repetition onto a 0–100% movement cycle without discarding raw timing data", () => {
    const normalized = normalizeRepTrajectory(session(), session().reps[0], "leftKneeFlexion", 3);
    expect(normalized.map((point) => point.cyclePercent)).toEqual([0, 50, 100]);
    expect(normalized.map((point) => point.value)).toEqual([5, 55, 10]);
  });
});

describe("date filtering", () => {
  it("filters by elapsed calendar window and preserves all sessions for all", () => {
    const now = new Date("2026-09-11T00:00:00Z").getTime();
    const sessions = [session({ id: "recent", startedAt: "2026-09-10T00:00:00Z" }), session({ id: "old", startedAt: "2026-08-01T00:00:00Z" })];
    expect(filterByDateRange(sessions, 7, now).map((item) => item.id)).toEqual(["recent"]);
    expect(filterByDateRange(sessions, "all", now)).toHaveLength(2);
  });
});
