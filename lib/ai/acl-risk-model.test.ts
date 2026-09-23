import { describe, expect, it } from "vitest";
import demoJson from "@/data/acl-risk-demo-model.json";
import {
  deriveAclInteractionFeatures,
  inferAclRisk,
  validateAclArtifact,
  type AclRiskModelArtifact,
} from "./acl-risk-model";

const artifact = demoJson as unknown as AclRiskModelArtifact;

describe("ACL-specific risk model", () => {
  it("keeps the bundled model in synthetic demonstration mode", () => {
    expect(() => validateAclArtifact(artifact)).not.toThrow();
    const result = inferAclRisk(artifact, {
      body_mass_kg: 70,
      tibia_length_cm: 38,
      quadriceps_hamstring_ratio: 0.72,
      weekly_exposure_minutes: 300,
      knee_valgus_motion_proxy_deg: 8,
      knee_flexion_rom_deg: 55,
      peak_trunk_lean_deg: 10,
    });
    expect(result.outputKind).toBe("synthetic-acl-demo-score");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it("creates the pre-specified mechanism interactions", () => {
    const derived = deriveAclInteractionFeatures({
      knee_valgus_motion_proxy_deg: 12,
      knee_flexion_rom_deg: 30,
      peak_trunk_lean_deg: 15,
      fatigue_score_0_10: 8,
    });
    expect(derived.valgus_low_flexion_interaction).toBeCloseTo(6, 5);
    expect(derived.valgus_trunk_interaction).toBeCloseTo(9, 5);
    expect(derived.fatigue_valgus_interaction).toBeCloseTo(9.6, 5);
  });

  it("reports critical data still missing instead of pretending the screen is complete", () => {
    const result = inferAclRisk(artifact, {
      knee_valgus_motion_proxy_deg: 10,
      knee_flexion_rom_deg: 45,
    });
    expect(result.missingCriticalFeatures).toContain("quadriceps_hamstring_ratio");
    expect(result.missingCriticalFeatures).toContain("weekly_exposure_minutes");
  });

  it("rejects synthetic artifacts that claim research eligibility", () => {
    const invalid = {
      ...artifact,
      deploymentGate: {
        ...artifact.deploymentGate,
        eligibleForResearchAclEstimate: true,
      },
    } as AclRiskModelArtifact;
    expect(() => validateAclArtifact(invalid)).toThrow(/Synthetic ACL artifacts/);
  });
});
