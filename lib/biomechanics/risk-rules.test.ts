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
  captureView: "front",
  label: "Left frontal knee deviation",
  comparator: "greaterThan",
  threshold: 10,
  severity: "caution",
  sourceLabel: "Test-only supplied source",
  sourceUrl: "https://example.com/test-source",
  sourceMeasurementMethod: "Test-only 2D frontal-plane method",
};

describe("evaluateMovementRules", () => {
  it("emits an explainable flag with the amount above threshold", () => {
    const [flag] = evaluateMovementRules([reading], [rule], 4);
    expect(flag.excessDegrees).toBe(4);
    expect(flag.repIndex).toBe(4);
    expect(flag.message).toContain("4.0°");
    expect(flag.sourceMeasurementMethod).toContain("2D");
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
    const unsourced = { ...rule } as Partial<MovementRule>;
    delete unsourced.sourceUrl;
    expect(() => parseMovementRules([unsourced])).toThrow(/sourceUrl/);
  });

  it("rejects a rule without source measurement context", () => {
    const missingMethod = { ...rule } as Partial<MovementRule>;
    delete missingMethod.sourceMeasurementMethod;
    expect(() => parseMovementRules([missingMethod])).toThrow(/sourceMeasurementMethod/);
  });

  it("rejects projection-incompatible metrics", () => {
    expect(() => parseMovementRules([{ ...rule, captureView: "side" }])).toThrow(/not valid/);
  });

  it("rejects duplicate rule ids", () => {
    expect(() => parseMovementRules([rule, { ...rule }])).toThrow(/Duplicate rule id/);
  });

  it("rejects non-http source URLs", () => {
    expect(() => parseMovementRules([{ ...rule, sourceUrl: "file:///thresholds.pdf" }])).toThrow(
      /http or https/,
    );
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

  it("keeps only the worst unassigned event for a rule", () => {
    const flags = evaluateMovementRules(
      [
        reading,
        { ...reading, frameTimestamp: 1300, value: 12 },
        { ...reading, frameTimestamp: 1400, value: 18 },
      ],
      [rule],
    );
    const collapsed = collapseMovementFlags(flags);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.frameTimestamp).toBe(1400);
    expect(collapsed[0]?.excessDegrees).toBe(8);
  });
});
