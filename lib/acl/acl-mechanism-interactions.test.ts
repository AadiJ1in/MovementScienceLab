import { describe, expect, it } from "vitest";
import {
  ACL_INTERACTION_POLICY,
  computeAclMechanismInteractions,
} from "./acl-mechanism-interactions";

describe("ACL mechanism interaction candidates", () => {
  it("computes pre-specified interactions without creating a probability", () => {
    const result = computeAclMechanismInteractions({
      dynamicKneeValgusDeg: 12,
      kneeFlexionAtInitialContactDeg: 15,
      ipsilateralTrunkFlexionDeg: 10,
      acuteFatigueScore: 8,
    });
    expect(result.valgusLowFlexion).toBeCloseTo(6, 5);
    expect(result.valgusTrunk).toBeCloseTo(12, 5);
    expect(result.fatigueValgus).toBeCloseTo(9.6, 5);
    expect(ACL_INTERACTION_POLICY.clinicallyValidated).toBe(false);
  });

  it("fails closed when required measurements are absent", () => {
    const result = computeAclMechanismInteractions({
      dynamicKneeValgusDeg: 10,
      kneeFlexionAtInitialContactDeg: null,
      ipsilateralTrunkFlexionDeg: null,
      acuteFatigueScore: null,
    });
    expect(result.valgusLowFlexion).toBeNull();
    expect(result.valgusTrunk).toBeNull();
    expect(result.fatigueValgus).toBeNull();
  });
});
