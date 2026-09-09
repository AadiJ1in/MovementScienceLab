import { describe, expect, it } from "vitest";
import { evaluateMovementRules, type MovementRule } from "./risk-rules";
import type { AngleReading } from "./angles";

const reading: AngleReading = {
  frameTimestamp: 1200,
  angleName: "leftKneeFrontalDeviation",
  value: 14,
  confidence: 0.9,
};

const rule: MovementRule = {
  id: "literature-rule-1",
  angleName: "leftKneeFrontalDeviation",
  label: "Left frontal knee deviation",
  comparator: "greaterThan",
  threshold: 10,
  severity: "caution",
  sourceLabel: "Example supplied source",
};

describe("evaluateMovementRules", () => {
  it("emits an explainable flag with the amount above threshold", () => {
    const [flag] = evaluateMovementRules([reading], [rule], 4);
    expect(flag.excessDegrees).toBe(4);
    expect(flag.repIndex).toBe(4);
    expect(flag.message).toContain("4.0°");
  });

  it("emits no flag inside the configured rule", () => {
    expect(evaluateMovementRules([{ ...reading, value: 9 }], [rule])).toHaveLength(0);
  });
});
