import { describe, expect, it } from "vitest";
import {
  evaluateProspectiveModelReadiness,
  type ProspectiveInjuryModelArtifact,
} from "./prospective-injury-model";

function artifact(
  overrides: Partial<ProspectiveInjuryModelArtifact["validation"]> = {},
): ProspectiveInjuryModelArtifact {
  return {
    schemaVersion: "2.0.0",
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
      method: "nested participant-grouped validation",
      nestedEvaluation: true,
      nParticipants: 300,
      nRows: 5000,
      nParticipantsWithPositiveOutcome: 70,
      metrics: {
        auroc: 0.77,
        auprc: 0.36,
        prevalence: 0.2,
        brier: 0.13,
        sensitivity: 0.74,
        specificity: 0.68,
        threshold: 0.31,
        calibrationIntercept: 0.03,
        calibrationSlope: 0.96,
        expectedCalibrationError: 0.04,
      },
      confidenceIntervals: {
        auroc: { lower95: 0.66, upper95: 0.84, bootstrapSamplesUsed: 500 },
        auprc: { lower95: 0.27, upper95: 0.45, bootstrapSamplesUsed: 500 },
        brier: { lower95: 0.11, upper95: 0.15, bootstrapSamplesUsed: 500 },
      },
      confidenceIntervalsReported: true,
      subgroupAuditReported: true,
      featureTimingAudited: true,
      externalValidated: false,
      externalCohort: null,
      cameraDomainValidated: false,
      calibrationReported: true,
      ...overrides,
    },
  };
}

describe("prospective injury model readiness", () => {
  it("never authorizes an individual injury probability even after validation gates pass", () => {
    const result = evaluateProspectiveModelReadiness(artifact({
      externalValidated: true,
      externalCohort: "independent cohort",
      cameraDomainValidated: true,
    }));

    expect(result.internalEngineeringGatePassed).toBe(true);
    expect(result.status).toBe("candidate-for-clinical-validation");
    expect(result.canDisplayIndividualInjuryProbability).toBe(false);
  });

  it("blocks near-chance discrimination", () => {
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
      confidenceIntervals: {
        auroc: { lower95: 0.47, upper95: 0.61, bootstrapSamplesUsed: 500 },
      },
    });

    const result = evaluateProspectiveModelReadiness(weak);
    expect(result.internalEngineeringGatePassed).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("AUROC"))).toBe(true);
  });

  it("blocks optimistic point estimates when the uncertainty interval remains weak", () => {
    const result = evaluateProspectiveModelReadiness(artifact({
      confidenceIntervals: {
        auroc: { lower95: 0.52, upper95: 0.87, bootstrapSamplesUsed: 500 },
      },
    }));

    expect(result.internalEngineeringGatePassed).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("95% AUROC lower bound"))).toBe(true);
  });

  it("requires nested evaluation and predictor-timing audit", () => {
    const result = evaluateProspectiveModelReadiness(artifact({
      nestedEvaluation: false,
      featureTimingAudited: false,
    }));

    expect(result.internalEngineeringGatePassed).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("nested"))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("Predictor timing"))).toBe(true);
  });

  it("requires external and camera-domain validation after strong internal results", () => {
    const result = evaluateProspectiveModelReadiness(artifact());

    expect(result.internalEngineeringGatePassed).toBe(true);
    expect(result.status).toBe("not-ready");
    expect(result.reasons).toContain("Independent external-cohort validation is still required.");
    expect(result.reasons.some((reason) => reason.includes("webcam/pose-estimation"))).toBe(true);
  });
});
