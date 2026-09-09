import { describe, expect, it } from "vitest";
import {
  collapseMovementFlags,
  evaluateMovementRules,
  parseMovementRules,
  type MovementRule,
} from "./risk-rules";
import type { AngleReading } from "./angles";

const reading: AngleReading = {
  frameTimestamp: 1200,
  angleName: "leftKneeFrontalDeviation",
  value: 14,
  confidence: 0.9,
};

const rule: MovementRule = {
  id: "test-rule-1",
  angleName: "leftKneeFrontalDeviation",
  label: "Left frontal knee deviation",
  comparator: "greaterThan",
  threshold: 10,
  severity: "caution",
  sourceLabel: "Test-only supplied source",
  sourceUrl: "https://example.com/test-source",
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

  it("supports absolute thresholds for signed metrics", () => {
    const absoluteRule: MovementRule = {
      ...rule,
      angleName: "trunkLean",
      comparator: "absoluteGreaterThan",
      threshold: 8,
    };
    const [flag] = evaluateMovementRules(
      [{ ...reading, angleName: "trunkLean", value: -11 }],
      [absoluteRule],
    );
    expect(flag.excessDegrees).toBe(3);
  });
});

describe("parseMovementRules", () => {
  it("accepts a fully sourced configuration", () => {
    expect(parseMovementRules([rule])).toHaveLength(1);
  });

  it("rejects a threshold without a source URL", () => {
    const { sourceUrl: _sourceUrl, ...unsourced } = rule;
    expect(() => parseMovementRules([unsourced])).toThrow(/sourceUrl/);
  });
});

describe("collapseMovementFlags", () => {
  it("keeps the worst exceedance for the same rule and rep", () => {
    const flags = evaluateMovementRules(
      [reading, { ...reading, frameTimestamp: 1300, value: 17 }],
      [rule],
      2,
    );
    const collapsed = collapseMovementFlags(flags);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.excessDegrees).toBe(7);
  });
});
