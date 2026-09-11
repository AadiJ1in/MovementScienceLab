import { describe, expect, it } from "vitest";
import type { AngleReading } from "./angles";
import { aggregateReps, downsampleReadings } from "./session-aggregation";

const readings: AngleReading[] = [
  { frameTimestamp: 0, angleName: "leftKneeFlexion", value: 5, confidence: 0.8 },
  { frameTimestamp: 30, angleName: "leftKneeFlexion", value: 7, confidence: 0.9 },
  { frameTimestamp: 120, angleName: "leftKneeFlexion", value: 40, confidence: 0.95 },
  { frameTimestamp: 220, angleName: "leftKneeFlexion", value: 10, confidence: 0.92 },
];

describe("session aggregation", () => {
  it("keeps one high-confidence reading per angle/time bucket", () => {
    const sampled = downsampleReadings(readings, 100);
    expect(sampled).toHaveLength(3);
    expect(sampled[0]?.value).toBe(7);
  });

  it("aggregates readings inside rep windows", () => {
    const result = aggregateReps(
      [{
        repIndex: 1,
        startedMs: 0,
        endedMs: 220,
        peakValue: 40,
        excursionDegrees: 35,
        durationMs: 220,
        meanConfidence: 0.9,
      }],
      readings,
    );
    expect(result[0]?.angleSummary.leftKneeFlexion?.samples).toBe(4);
    expect(result[0]?.angleSummary.leftKneeFlexion?.max).toBe(40);
  });
});
