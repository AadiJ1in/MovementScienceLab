import { describe, expect, it } from "vitest";
import {
  computeLiteratureSeededAclSignal,
  exposureAdjustedAclHazard,
} from "./acl-risk-equation";

describe("ACL literature-seeded equation", () => {
  it("reports complete coverage when all five core prospective features are present", () => {
    const result = computeLiteratureSeededAclSignal({
      priorAclRupture: 0,
      dynamicKneeValgusDeg: 0,
      ipsilateralTrunkFlexionDeg: 8,
      cmjPeakTakeoffForceBw: 1.19,
      hipAdductorAbductorRatio: 0.97,
    });
    expect(result.coreFeatureCoverage).toBe(1);
    expect(result.missingCoreFeatures).toEqual([]);
    expect(result.relativeLogOddsSignal).toBeCloseTo(0, 10);
    expect(result.clinicalProbabilityAllowed).toBe(false);
  });

  it("increases the relative signal for the direction reported in the source cohort", () => {
    const reference = computeLiteratureSeededAclSignal({
      priorAclRupture: 0,
      dynamicKneeValgusDeg: 0,
      ipsilateralTrunkFlexionDeg: 8,
      cmjPeakTakeoffForceBw: 1.19,
      hipAdductorAbductorRatio: 0.97,
    });
    const higher = computeLiteratureSeededAclSignal({
      priorAclRupture: 1,
      dynamicKneeValgusDeg: 7.2,
      ipsilateralTrunkFlexionDeg: 10.4,
      cmjPeakTakeoffForceBw: 1.32,
      hipAdductorAbductorRatio: 0.83,
    });
    expect(higher.relativeLogOddsSignal).toBeGreaterThan(reference.relativeLogOddsSignal);
  });

  it("fails closed on missing core measurements by reporting them explicitly", () => {
    const result = computeLiteratureSeededAclSignal({
      priorAclRupture: 0,
      dynamicKneeValgusDeg: 5,
      ipsilateralTrunkFlexionDeg: null,
      cmjPeakTakeoffForceBw: null,
      hipAdductorAbductorRatio: null,
    });
    expect(result.coreFeatureCoverage).toBe(0.4);
    expect(result.missingCoreFeatures).toHaveLength(3);
  });
});

describe("exposure-adjusted ACL hazard target", () => {
  it("is zero for zero exposure and monotonic with exposure", () => {
    expect(exposureAdjustedAclHazard(-5, 0)).toBe(0);
    expect(exposureAdjustedAclHazard(-5, 20)).toBeGreaterThan(
      exposureAdjustedAclHazard(-5, 10),
    );
  });

  it("rejects invalid exposure", () => {
    expect(() => exposureAdjustedAclHazard(-5, -1)).toThrow(/non-negative/);
  });
});
