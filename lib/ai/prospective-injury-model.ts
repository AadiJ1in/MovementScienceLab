export type ProspectiveInjuryMetrics = {
  auroc: number;
  auprc: number;
  prevalence: number;
  brier: number;
  sensitivity: number;
  specificity: number;
  threshold: number;
};

export type ProspectiveInjuryModelArtifact = {
  schemaVersion: "1.0.0";
  modelType: "prospective-injury-risk-research";
  clinicalClaim: "research-risk-estimation-only";
  outcome: {
    label: string;
    horizonDays: number;
    indexTimeDefinition: string;
  };
  population: string;
  features: string[];
  validation: {
    splitUnit: "participant";
    method: string;
    nParticipants: number;
    nRows: number;
    metrics: ProspectiveInjuryMetrics;
    externalValidated: boolean;
    externalCohort: string | null;
    cameraDomainValidated: boolean;
    calibrationReported: boolean;
  };
};

export type ProspectiveModelReadiness = {
  status: "research-only" | "not-ready" | "candidate-for-clinical-validation";
  canDisplayIndividualInjuryProbability: false;
  internalEngineeringGatePassed: boolean;
  reasons: string[];
};

/**
 * These are product-development guardrails, not clinical cut-points or a claim
 * that a model meeting them is medically validated. External clinical
 * validation, population-specific review, and regulatory/clinical governance
 * remain separate requirements.
 */
export const RESEARCH_ENGINEERING_GATE = {
  minAuroc: 0.7,
  minAuprcLiftOverPrevalence: 1.25,
  minSensitivity: 0.7,
  minSpecificity: 0.6,
} as const;

function finiteProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function evaluateProspectiveModelReadiness(
  artifact: ProspectiveInjuryModelArtifact,
): ProspectiveModelReadiness {
  const reasons: string[] = [];
  const metrics = artifact.validation.metrics;

  if (artifact.validation.splitUnit !== "participant") {
    reasons.push("Validation must separate participants; row-level random splitting is not accepted.");
  }
  if (!finiteProbability(metrics.auroc) || metrics.auroc < RESEARCH_ENGINEERING_GATE.minAuroc) {
    reasons.push(`AUROC is below the internal research gate of ${RESEARCH_ENGINEERING_GATE.minAuroc.toFixed(2)}.`);
  }
  const auprcLift = metrics.prevalence > 0 ? metrics.auprc / metrics.prevalence : 0;
  if (!finiteProbability(metrics.auprc) || auprcLift < RESEARCH_ENGINEERING_GATE.minAuprcLiftOverPrevalence) {
    reasons.push("AUPRC does not provide enough lift over outcome prevalence for the internal research gate.");
  }
  if (!finiteProbability(metrics.sensitivity) || metrics.sensitivity < RESEARCH_ENGINEERING_GATE.minSensitivity) {
    reasons.push(`Sensitivity is below the internal research gate of ${RESEARCH_ENGINEERING_GATE.minSensitivity.toFixed(2)}.`);
  }
  if (!finiteProbability(metrics.specificity) || metrics.specificity < RESEARCH_ENGINEERING_GATE.minSpecificity) {
    reasons.push(`Specificity is below the internal research gate of ${RESEARCH_ENGINEERING_GATE.minSpecificity.toFixed(2)}.`);
  }

  // The no-skill Brier score for a constant prediction equal to prevalence is p(1-p).
  const noSkillBrier = metrics.prevalence * (1 - metrics.prevalence);
  if (!Number.isFinite(metrics.brier) || metrics.brier >= noSkillBrier) {
    reasons.push("Calibration/overall probabilistic error does not beat the prevalence-only Brier baseline.");
  }
  if (!artifact.validation.calibrationReported) {
    reasons.push("Calibration must be explicitly reported.");
  }

  const internalEngineeringGatePassed = reasons.length === 0;

  if (!artifact.validation.externalValidated) {
    reasons.push("Independent external-cohort validation is still required.");
  }
  if (!artifact.validation.cameraDomainValidated) {
    reasons.push("Validation through the same webcam/pose-estimation domain used by the application is still required.");
  }

  const candidate =
    internalEngineeringGatePassed &&
    artifact.validation.externalValidated &&
    artifact.validation.cameraDomainValidated;

  return {
    status: candidate ? "candidate-for-clinical-validation" : "not-ready",
    canDisplayIndividualInjuryProbability: false,
    internalEngineeringGatePassed,
    reasons,
  };
}
