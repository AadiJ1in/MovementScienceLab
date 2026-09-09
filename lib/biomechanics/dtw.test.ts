import { describe, expect, it } from "vitest";
import { compareRepToReference, dynamicTimeWarping } from "./dtw";

describe("dynamicTimeWarping", () => {
  it("returns zero distance for identical signals", () => {
    const result = dynamicTimeWarping([0, 10, 20, 10, 0], [0, 10, 20, 10, 0]);
    expect(result.normalizedDistance).toBe(0);
  });

  it("handles different-length signals", () => {
    const result = dynamicTimeWarping([0, 10, 20, 10, 0], [0, 5, 10, 15, 20, 15, 10, 5, 0]);
    expect(Number.isFinite(result.normalizedDistance)).toBe(true);
    expect(result.pathLength).toBeGreaterThan(0);
  });

  it("uses a caller supplied form-deviation boundary", () => {
    const result = compareRepToReference("leftKneeFlexion", [0, 30, 60], [0, 10, 20], 5);
    expect(result.interpretation).toBe("more-deviant-from-reference");
  });
});
