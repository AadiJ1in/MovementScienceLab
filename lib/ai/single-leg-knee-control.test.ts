import { describe, expect, it } from "vitest";
import {
  emptySingleLegRepSamples,
  summarizeSingleLegRep,
  summarizeSingleLegSide,
  type SingleLegRepSamples,
} from "./single-leg-knee-control";

function rep(overrides: Partial<SingleLegRepSamples> = {}): SingleLegRepSamples {
  return {
    kneeByPhase: {
      down: [3, 5, 7, 9],
      hold: [10, 11, 10, 12],
      up: [9, 7, 5, 3],
    },
    trunkLean: [2, 3, 4, 3, 2],
    kneeConfidence: Array.from({ length: 12 }, () => 0.92),
    ...overrides,
  };
}

describe("single-leg knee-control summaries", () => {
  it("uses a stable hold estimate and a robust peak instead of a raw maximum", () => {
    const samples = rep({
      kneeByPhase: {
        down: [3, 5, 7, 9],
        hold: [10, 11, 10, 12],
        up: [9, 7, 5, 60],
      },
    });

    const result = summarizeSingleLegRep(samples);

    expect(result.valid).toBe(true);
    expect(result.stableHoldKneeDeg).toBe(10.5);
    expect(result.robustPeakKneeDeg).toBe(12);
  });

  it("fails closed when the stabilization window or confidence is inadequate", () => {
    const tooFewHold = summarizeSingleLegRep(rep({
      kneeByPhase: { down: [3, 4, 5, 6], hold: [8], up: [7, 6, 5, 4] },
    }));
    expect(tooFewHold.valid).toBe(false);
    expect(tooFewHold.exclusionReason).toBe("too-few-hold-samples");

    const lowConfidence = summarizeSingleLegRep(rep({
      kneeConfidence: Array.from({ length: 12 }, () => 0.5),
    }));
    expect(lowConfidence.valid).toBe(false);
    expect(lowConfidence.exclusionReason).toBe("low-confidence");
  });

  it("grades a side from valid repetitions and reports rep-to-rep variability", () => {
    const summary = summarizeSingleLegSide([
      rep(),
      rep({ kneeByPhase: { down: [4, 6, 8, 10], hold: [12, 12, 13, 11], up: [10, 8, 6, 4] } }),
      rep({ kneeByPhase: { down: [2, 4, 6, 8], hold: [9, 9, 10, 8], up: [8, 6, 4, 2] } }),
    ]);

    expect(summary.validRepCount).toBe(3);
    expect(summary.dataQuality).toBe("high");
    expect(summary.stableHoldKneeDeg).toBe(10.5);
    expect(summary.repVariabilityDeg).not.toBeNull();
  });

  it("returns low quality for empty repetitions rather than inventing measurements", () => {
    const summary = summarizeSingleLegSide([
      emptySingleLegRepSamples(),
      emptySingleLegRepSamples(),
      emptySingleLegRepSamples(),
    ]);

    expect(summary.dataQuality).toBe("low");
    expect(summary.validRepCount).toBe(0);
    expect(summary.stableHoldKneeDeg).toBeNull();
  });
});
