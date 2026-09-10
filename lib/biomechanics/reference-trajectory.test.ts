import { describe, expect, it } from "vitest";
import { parseReferenceTrajectory } from "./reference-trajectory";

const reference = {
  angleName: "leftKneeFlexion" as const,
  captureView: "side" as const,
  values: [10, 45, 80, 45, 10],
  sourceLabel: "Test-only labeled reference",
  sourceUrl: "https://example.com/reference",
  sourceMeasurementMethod: "Test-only side-view 2D angle trajectory",
};

describe("parseReferenceTrajectory", () => {
  it("accepts a sourced projection-compatible trajectory", () => {
    expect(parseReferenceTrajectory(reference, "leftKneeFlexion", "side").values).toHaveLength(5);
  });

  it("rejects the wrong capture projection", () => {
    expect(() => parseReferenceTrajectory(reference, "leftKneeFlexion", "front")).toThrow(
      /captureView must match/,
    );
  });

  it("rejects projection-incompatible angle definitions", () => {
    expect(() =>
      parseReferenceTrajectory({
        ...reference,
        angleName: "leftKneeFrontalDeviation",
        captureView: "side",
      }),
    ).toThrow(/not valid/);
  });

  it("requires measurement-method provenance", () => {
    const value = { ...reference } as Record<string, unknown>;
    delete value.sourceMeasurementMethod;
    expect(() => parseReferenceTrajectory(value)).toThrow(/sourceMeasurementMethod/);
  });

  it("requires explicit provenance for a classification boundary", () => {
    expect(() => parseReferenceTrajectory({ ...reference, deviationBoundary: 5 })).toThrow(
      /deviationBoundarySourceLabel/,
    );
  });

  it("accepts a sourced non-negative classification boundary", () => {
    expect(
      parseReferenceTrajectory({
        ...reference,
        deviationBoundary: 5,
        deviationBoundarySourceLabel: "Test-only validation dataset",
        deviationBoundarySourceUrl: "https://example.com/boundary",
      }).deviationBoundary,
    ).toBe(5);
  });
});
