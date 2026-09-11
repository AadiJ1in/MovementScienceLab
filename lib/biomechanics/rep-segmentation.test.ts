import { describe, expect, it } from "vitest";
import type { AngleReading } from "./angles";
import { DEFAULT_KNEE_REP_CONFIG, RepSegmenter } from "./rep-segmentation";

function sample(value: number, frameTimestamp: number, confidence = 0.95): AngleReading {
  return { angleName: "leftKneeFlexion", value, confidence, frameTimestamp };
}

function run(values: number[], interval = 100, confidence = 0.95) {
  const segmenter = new RepSegmenter(DEFAULT_KNEE_REP_CONFIG);
  return values
    .map((value, index) => segmenter.ingest(sample(value, index * interval, confidence)))
    .filter((value) => value !== null);
}

describe("RepSegmenter", () => {
  it("detects a complete flexion-return cycle", () => {
    const reps = run([2, 2, 3, 12, 25, 45, 60, 55, 42, 25, 10, 5, 3]);
    expect(reps).toHaveLength(1);
    expect(reps[0]?.repIndex).toBe(1);
    expect(reps[0]?.peakValue ?? 0).toBeGreaterThan(45);
    expect(reps[0]?.excursionDegrees ?? 0).toBeGreaterThan(40);
    expect(reps[0]?.durationMs ?? 0).toBeGreaterThanOrEqual(450);
  });

  it("does not count a small noisy excursion as a rep", () => {
    expect(run([2, 3, 4, 7, 10, 8, 5, 3])).toHaveLength(0);
  });

  it("rejects an implausibly fast jitter cycle", () => {
    expect(run([2, 3, 15, 50, 25, 4, 2], 50)).toHaveLength(0);
  });

  it("does not count when tracking confidence is below the configured gate", () => {
    expect(run([2, 3, 15, 35, 60, 35, 10, 3], 120, 0.4)).toHaveLength(0);
  });

  it("abandons a partial rep after a long tracking gap", () => {
    const segmenter = new RepSegmenter(DEFAULT_KNEE_REP_CONFIG);
    [2, 3, 14, 30, 50].forEach((value, index) => segmenter.ingest(sample(value, index * 100)));
    segmenter.ingest(sample(48, 1600, 0.2));
    const afterGap = [45, 30, 12, 4, 2]
      .map((value, index) => segmenter.ingest(sample(value, 1700 + index * 100)))
      .filter((value) => value !== null);
    expect(afterGap).toHaveLength(0);
  });

  it("reports mean confidence separately from movement amplitude", () => {
    const segmenter = new RepSegmenter({ ...DEFAULT_KNEE_REP_CONFIG, signalSmoothing: 1 });
    const sequence = [2, 2, 12, 30, 55, 45, 25, 8, 3];
    const rep = sequence
      .map((value, index) => segmenter.ingest(sample(value, index * 120, index % 2 ? 0.8 : 0.9)))
      .find((value) => value !== null);
    expect(rep?.meanConfidence ?? 0).toBeGreaterThan(0.79);
    expect(rep?.meanConfidence ?? 1).toBeLessThan(0.91);
  });
});
