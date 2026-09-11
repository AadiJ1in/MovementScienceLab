import { describe, expect, it } from "vitest";
import { MOVEMENT_DEFINITIONS, getMovementDefinition } from "./movement-definitions";

describe("movement definitions", () => {
  it("uses unique movement ids", () => {
    const ids = MOVEMENT_DEFINITIONS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps validated status conservative", () => {
    expect(MOVEMENT_DEFINITIONS.some((item) => item.status === "externally-validated")).toBe(false);
  });

  it("only enables the existing side-squat rep detector", () => {
    const enabled = MOVEMENT_DEFINITIONS.filter((item) => item.repCounting === "side-knee-cycle");
    expect(enabled.map((item) => item.id)).toEqual(["squat-side"]);
  });

  it("retrieves a configured movement", () => {
    expect(getMovementDefinition("squat-side").primaryMetric).toBe("leftKneeFlexion");
  });
});
