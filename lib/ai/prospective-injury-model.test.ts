import { describe, expect, it } from "vitest";
import {
  evaluateProspectiveModelReadiness,
  type ProspectiveInjuryModelArtifact,
} from "./prospective-injury-model";

function artifact(
  overrides: Partial<ProspectiveInjuryModelArtifact["validation"]> = {},
): ProspectiveInjuryModelArtifact {
  return {
    schemaVersion: "1.0.0",
    modelType: "prospective-injury-risk-research",
    clinicalClaim: "research-risk-estimation-only",
    outcome: {
      label: "new lower-extremity injury",
      horizonDays: 28,
      indexTimeDefinition: "prediction time before the outcome window",
    },
    population: "research cohort",
    features: ["previous_injury_count", "training_minutes_7d", "sls_knee_asymmetry_deg"],
    validation: {
      splitUnit: "participant",
      method: "nested grouped cross-validation",
      nParticipants: 300,
      nRows: 5000,
      metrics: {
        auroc: 0.77,
        auprc: 0.36,
        prevalence: 0.2,
        brier: 0.13,
        sensitivity: 0.74,
        specificity: 0.68,
        threshold: 0.31,
      },
      externalValidated: false,
      externalCohort: null,
      cameraDomainValidated: false,
      calibrationReported: true,
      ...overrides,
    },
  };
}

describe("prospective injury model readiness", () => {
  it("never authorizes an individual injury probability from the research gate alone", () => {
    const result = evaluateProspectiveModelReadiness(artifact({
      externalValidated: true,
      externalCohort: "independent cohort",
      cameraDomainValidated: true,
    }));

    expect(result.internalEngineeringGatePassed).toBe(true);
    expect(result.status).toBe("candidate-for-clinical-validation");
    expect(result.canDisplayIndividualInjuryProbability).toBe(false);
  });

  it("blocks a model with near-chance discrimination", () => {
    const weak = artifact({
      metrics: {
        auroc: 0.54,
        auprc: 0.2,
        prevalence: 0.2,
        brier: 0.17,
        sensitivity: 0.52,
        specificity: 0.52,
        threshold: 0.5,
      },
    });

    const result = evaluateProspectiveModelReadiness(weak);
    expect(result.internalEngineeringGatePassed).toBe(false);
    expect(result.status).toBe("not-ready");
    expect(result.reasons.some((reason) => reason.includes("AUROC"))).toBe(true);
  });

  it("requires external and camera-domain validation even after strong internal results", () => {
    const result = evaluateProspectiveModelReadiness(artifact());

    expect(result.internalEngineeringGatePassed).toBe(true);
    expect(result.status).toBe("not-ready");
    expect(result.reasons).toContain("Independent external-cohort validation is still required.");
    expect(result.reasons.some((reason) => reason.includes("webcam/pose-estimation"))).toBe(true);
  });
});
