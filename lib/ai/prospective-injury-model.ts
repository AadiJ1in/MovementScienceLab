export type MetricInterval = {
  lower95: number;
  upper95: number;
  bootstrapSamplesUsed: number;
};

export type ProspectiveInjuryMetrics = {
  auroc: number;
  auprc: number;
  prevalence: number;
  brier: number;
  sensitivity: number;
  specificity: number;
  threshold: number;
  calibrationIntercept?: number | null;
  calibrationSlope?: number | null;
  expectedCalibrationError?: number;
};

export type ProspectiveInjuryModelArtifact = {
  schemaVersion: "2.0.0";
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
    nestedEvaluation: boolean;
    nParticipants: number;
    nRows: number;
    nParticipantsWithPositiveOutcome: number;
    metrics: ProspectiveInjuryMetrics;
    confidenceIntervals: Partial<Record<
      "auroc" | "auprc" | "brier" | "sensitivity" | "specificity" | "balancedAccuracy",
      MetricInterval | null
    >>;
    confidenceIntervalsReported: boolean;
    subgroupAuditReported: boolean;
    featureTimingAudited: boolean;
    externalValidated: boolean;
    externalCohort: string | null;
    cameraDomainValidated: boolean;
    calibrationReported: boolean;
  };
};

export type ProspectiveModelReadiness = {
  status: "not-ready" | "candidate-for-clinical-validation";
  canDisplayIndividualInjuryProbability: false;
  internalEngineeringGatePassed: boolean;
  reasons: string[];
};

/**
 * Product-development guardrails only. They are deliberately stricter than
 * "better than chance" but are not clinical efficacy thresholds.
 */
export const RESEARCH_ENGINEERING_GATE = {
  minAuroc: 0.7,
  minAurocLower95: 0.6,
  minAuprcLiftOverPrevalence: 1.25,
  minSensitivity: 0.7,
  minSpecificity: 0.6,
} as const;

function finiteProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validInterval(interval: MetricInterval | null | undefined): interval is MetricInterval {
  return Boolean(
    interval &&
      Number.isFinite(interval.lower95) &&
      Number.isFinite(interval.upper95) &&
      interval.lower95 <= interval.upper95 &&
      interval.bootstrapSamplesUsed > 0,
  );
}

export function evaluateProspectiveModelReadiness(
  artifact: ProspectiveInjuryModelArtifact,
): ProspectiveModelReadiness {
  const reasons: string[] = [];
  const metrics = artifact.validation.metrics;

  if (artifact.validation.splitUnit !== "participant") {
    reasons.push("Validation must separate participants; row-level random splitting is not accepted.");
  }
  if (!artifact.validation.nestedEvaluation) {
    reasons.push("Model selection, calibration, and threshold tuning must be nested inside participant-grouped validation.");
  }
  if (!artifact.validation.featureTimingAudited) {
    reasons.push("Predictor timing has not been audited to confirm every feature existed before the prediction index time.");
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

  const noSkillBrier = metrics.prevalence * (1 - metrics.prevalence);
  if (!Number.isFinite(metrics.brier) || metrics.brier >= noSkillBrier) {
    reasons.push("Calibration/overall probabilistic error does not beat the prevalence-only Brier baseline.");
  }
  if (!artifact.validation.calibrationReported) {
    reasons.push("Calibration must be explicitly reported.");
  }

  if (!artifact.validation.confidenceIntervalsReported) {
    reasons.push("Participant-cluster uncertainty intervals must be reported.");
  } else {
    const aurocInterval = artifact.validation.confidenceIntervals.auroc;
    if (!validInterval(aurocInterval)) {
      reasons.push("A valid 95% AUROC interval is required.");
    } else if (aurocInterval.lower95 < RESEARCH_ENGINEERING_GATE.minAurocLower95) {
      reasons.push(
        `The 95% AUROC lower bound is below the internal uncertainty gate of ${RESEARCH_ENGINEERING_GATE.minAurocLower95.toFixed(2)}.`,
      );
    }
  }

  if (!artifact.validation.subgroupAuditReported) {
    reasons.push("A subgroup-performance audit must be reported, including explicit insufficient-sample states.");
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
