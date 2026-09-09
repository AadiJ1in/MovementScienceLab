import { describe, expect, it } from "vitest";
import type { AngleReading } from "@/lib/biomechanics/angles";
import { DEFAULT_KNEE_REP_CONFIG, RepSegmenter } from "./rep-segmentation";

function sample(value: number, frameTimestamp: number): AngleReading {
  return {
    angleName: "leftKneeFlexion",
    value,
    confidence: 0.95,
    frameTimestamp,
  };
}

describe("RepSegmenter", () => {
  it("detects a complete flexion-return cycle", () => {
    const segmenter = new RepSegmenter(DEFAULT_KNEE_REP_CONFIG);
    const values = [2, 2, 3, 12, 25, 45, 60, 55, 42, 25, 10, 5, 3];
    const reps = values
      .map((value, index) => segmenter.ingest(sample(value, index * 100)))
      .filter(Boolean);

    expect(reps).toHaveLength(1);
    expect(reps[0]?.repIndex).toBe(1);
    expect(reps[0]?.peakValue).toBe(60);
    expect((reps[0]?.excursionDegrees ?? 0)).toBeGreaterThan(50);
  });

  it("does not count a small noisy excursion as a rep", () => {
    const segmenter = new RepSegmenter(DEFAULT_KNEE_REP_CONFIG);
    const values = [2, 3, 4, 7, 10, 8, 5, 3];
    const reps = values
      .map((value, index) => segmenter.ingest(sample(value, index * 100)))
      .filter(Boolean);

    expect(reps).toHaveLength(0);
  });
});
