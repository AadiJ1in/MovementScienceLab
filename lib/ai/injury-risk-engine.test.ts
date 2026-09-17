import { describe, expect, it } from "vitest";
import demoJson from "../../data/injury-risk-demo-model.json";
import {
  assertPortableInjuryRiskArtifact,
  inferPortableInjuryRisk,
  type PortableInjuryRiskModelArtifact,
} from "./injury-risk-engine";

const demo = demoJson as unknown as PortableInjuryRiskModelArtifact;

describe("portable injury-risk engine", () => {
  it("accepts the synthetic demo artifact but never upgrades it to a research estimate", () => {
    expect(() => assertPortableInjuryRiskArtifact(demo)).not.toThrow();
    const result = inferPortableInjuryRisk(demo, {
      previous_injury_count: 2,
      pain_score: 4,
      readiness_score: 5,
      camera_peak_knee_frontal_deviation_deg: 12,
    });
    expect(result.outputKind).toBe("synthetic-demo-score");
    expect(result.calibratedScore).toBeGreaterThan(0);
    expect(result.calibratedScore).toBeLessThan(1);
    expect(result.featureCoverage).toBeGreaterThan(0);
    expect(result.topDrivers.length).toBeGreaterThan(0);
  });

  it("changes the score when high-weight factors change", () => {
    const low = inferPortableInjuryRisk(demo, {
      previous_injury_count: 0,
      days_since_last_injury: 500,
      pain_score: 0,
      soreness_score: 1,
      sleep_quality_score: 9,
      readiness_score: 9,
      camera_peak_knee_frontal_deviation_deg: 3,
    });
    const high = inferPortableInjuryRisk(demo, {
      previous_injury_count: 3,
      days_since_last_injury: 30,
      pain_score: 7,
      soreness_score: 8,
      sleep_quality_score: 4,
      readiness_score: 4,
      camera_peak_knee_frontal_deviation_deg: 18,
    });
    expect(high.calibratedScore).toBeGreaterThan(low.calibratedScore);
  });

  it("rejects a synthetic artifact marked eligible for research estimation", () => {
    const invalid = {
      ...demo,
      deploymentGate: {
        ...demo.deploymentGate,
        eligibleForResearchRiskEstimate: true,
      },
    };
    expect(() => assertPortableInjuryRiskArtifact(invalid)).toThrow(
      /Synthetic development artifacts/,
    );
  });

  it("requires participant-grouped nested evaluation before human research estimates", () => {
    const invalid: PortableInjuryRiskModelArtifact = {
      ...demo,
      trainingDataType: "prospective-human",
      validation: {
        ...demo.validation,
        internalEngineeringGatePassed: true,
        participantGrouped: false,
        nestedEvaluation: true,
      },
      deploymentGate: {
        ...demo.deploymentGate,
        eligibleForResearchRiskEstimate: true,
      },
    };
    expect(() => assertPortableInjuryRiskArtifact(invalid)).toThrow(
      /participant-grouped nested evaluation/,
    );
  });
});
