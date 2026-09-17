export type InjuryRiskTrainingDataType =
  | "prospective-human"
  | "synthetic-development-fixture";

export type InjuryRiskFeatureValue = number | null;

export type InjuryRiskFeatureDomain =
  | "history"
  | "symptoms_readiness"
  | "training_exposure"
  | "strength_balance"
  | "camera_biomechanics"
  | "longitudinal_change";

export type PortableInjuryRiskModelArtifact = {
  schemaVersion: "1.0.0";
  modelType: "portable-logistic-prospective-injury-risk";
  trainingDataType: InjuryRiskTrainingDataType;
  clinicalClaim: "research-risk-estimation-only";
  modelName: string;
  modelVersion: string;
  outcome: {
    label: string;
    horizonDays: number;
    population: string;
  };
  cameraMeasurementVersion: string;
  features: string[];
  featureDomains: Record<string, InjuryRiskFeatureDomain>;
  preprocessing: {
    medians: number[];
    means: number[];
    scales: number[];
  };
  model: {
    intercept: number;
    coefficients: number[];
  };
  calibration: {
    method: "platt-logistic";
    intercept: number;
    coefficient: number;
  };
  validation: {
    nParticipants: number;
    nRows: number;
    auroc: number | null;
    auprc: number | null;
    brier: number | null;
    calibrationSlope: number | null;
    calibrationIntercept: number | null;
    internalEngineeringGatePassed: boolean;
    participantGrouped: boolean;
    nestedEvaluation: boolean;
    externalValidated: boolean;
    cameraDomainValidated: boolean;
  };
  deploymentGate: {
    eligibleForResearchRiskEstimate: boolean;
    eligibleForUserFacingInjuryProbability: false;
    requiresIndependentExternalCohort: boolean;
    requiresSameCameraPoseDomainValidation: boolean;
    requiresClinicalGovernanceReview: boolean;
  };
  provenance: {
    sourceLabel: string;
    sourceUrl: string | null;
    note: string;
  };
};

export type InjuryRiskContribution = {
  feature: string;
  domain: InjuryRiskFeatureDomain;
  observedValue: number | null;
  imputedValue: number;
  standardizedValue: number;
  coefficient: number;
  logitContribution: number;
};

export type InjuryRiskDomainContribution = {
  domain: InjuryRiskFeatureDomain;
  absoluteContribution: number;
  signedContribution: number;
  featureCount: number;
};

export type InjuryRiskInference = {
  outputKind: "research-risk-estimate" | "synthetic-demo-score";
  calibratedScore: number;
  rawScore: number;
  threshold: number;
  thresholdLabel: "below-model-threshold" | "above-model-threshold";
  featureCoverage: number;
  observedFeatureCount: number;
  totalFeatureCount: number;
  observedDomains: InjuryRiskFeatureDomain[];
  contributions: InjuryRiskContribution[];
  topDrivers: InjuryRiskContribution[];
  domainContributions: InjuryRiskDomainContribution[];
  evidenceLabel: string;
  interpretation: string;
};

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function finiteOrNull(value: InjuryRiskFeatureValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function assertPortableInjuryRiskArtifact(
  artifact: PortableInjuryRiskModelArtifact,
): void {
  const n = artifact.features.length;
  if (!n) throw new Error("Injury-risk artifact must include at least one feature.");
  if (
    artifact.preprocessing.medians.length !== n ||
    artifact.preprocessing.means.length !== n ||
    artifact.preprocessing.scales.length !== n ||
    artifact.model.coefficients.length !== n
  ) {
    throw new Error("Injury-risk artifact arrays must match the feature count.");
  }
  const unique = new Set(artifact.features);
  if (unique.size !== n) throw new Error("Injury-risk artifact contains duplicate features.");

  artifact.features.forEach((feature, index) => {
    if (!artifact.featureDomains[feature]) {
      throw new Error(`Injury-risk artifact is missing a domain for ${feature}.`);
    }
    const scale = artifact.preprocessing.scales[index];
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`Injury-risk artifact has an invalid scale for ${feature}.`);
    }
    const values = [
      artifact.preprocessing.medians[index],
      artifact.preprocessing.means[index],
      artifact.model.coefficients[index],
    ];
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Injury-risk artifact contains non-finite parameters for ${feature}.`);
    }
  });

  if (artifact.deploymentGate.eligibleForUserFacingInjuryProbability !== false) {
    throw new Error("Research injury-risk artifacts cannot enable clinical injury probability.");
  }
  if (
    artifact.trainingDataType === "synthetic-development-fixture" &&
    artifact.deploymentGate.eligibleForResearchRiskEstimate
  ) {
    throw new Error("Synthetic development artifacts cannot be marked as research risk estimates.");
  }
  if (
    artifact.trainingDataType === "prospective-human" &&
    artifact.deploymentGate.eligibleForResearchRiskEstimate &&
    (!artifact.validation.participantGrouped ||
      !artifact.validation.nestedEvaluation ||
      !artifact.validation.internalEngineeringGatePassed)
  ) {
    throw new Error(
      "Prospective-human research estimates require participant-grouped nested evaluation and the internal research gate.",
    );
  }
}

export function inferPortableInjuryRisk(
  artifact: PortableInjuryRiskModelArtifact,
  values: Record<string, InjuryRiskFeatureValue | undefined>,
): InjuryRiskInference {
  assertPortableInjuryRiskArtifact(artifact);

  let rawLogit = artifact.model.intercept;
  let observed = 0;
  const observedDomains = new Set<InjuryRiskFeatureDomain>();
  const contributions: InjuryRiskContribution[] = artifact.features.map((feature, index) => {
    const observedValue = finiteOrNull(values[feature]);
    const imputedValue = observedValue ?? artifact.preprocessing.medians[index];
    const standardizedValue =
      (imputedValue - artifact.preprocessing.means[index]) /
      artifact.preprocessing.scales[index];
    const coefficient = artifact.model.coefficients[index];
    const logitContribution = standardizedValue * coefficient;
    rawLogit += logitContribution;

    const domain = artifact.featureDomains[feature];
    if (observedValue !== null) {
      observed += 1;
      observedDomains.add(domain);
    }
    return {
      feature,
      domain,
      observedValue,
      imputedValue,
      standardizedValue,
      coefficient,
      logitContribution,
    };
  });

  const rawScore = sigmoid(rawLogit);
  const rawLogOdds = Math.log(
    Math.min(1 - 1e-6, Math.max(1e-6, rawScore)) /
      (1 - Math.min(1 - 1e-6, Math.max(1e-6, rawScore))),
  );
  const calibratedScore = sigmoid(
    artifact.calibration.intercept + artifact.calibration.coefficient * rawLogOdds,
  );

  const topDrivers = [...contributions]
    .sort((a, b) => Math.abs(b.logitContribution) - Math.abs(a.logitContribution))
    .slice(0, 6);

  const domainMap = new Map<InjuryRiskFeatureDomain, InjuryRiskDomainContribution>();
  for (const contribution of contributions) {
    const current = domainMap.get(contribution.domain) ?? {
      domain: contribution.domain,
      absoluteContribution: 0,
      signedContribution: 0,
      featureCount: 0,
    };
    current.absoluteContribution += Math.abs(contribution.logitContribution);
    current.signedContribution += contribution.logitContribution;
    current.featureCount += 1;
    domainMap.set(contribution.domain, current);
  }
  const domainContributions = [...domainMap.values()].sort(
    (a, b) => b.absoluteContribution - a.absoluteContribution,
  );

  const outputKind =
    artifact.trainingDataType === "prospective-human" &&
    artifact.deploymentGate.eligibleForResearchRiskEstimate
      ? "research-risk-estimate"
      : "synthetic-demo-score";

  return {
    outputKind,
    calibratedScore,
    rawScore,
    threshold: 0.5,
    thresholdLabel:
      calibratedScore >= 0.5 ? "above-model-threshold" : "below-model-threshold",
    featureCoverage: observed / artifact.features.length,
    observedFeatureCount: observed,
    totalFeatureCount: artifact.features.length,
    observedDomains: [...observedDomains],
    contributions,
    topDrivers,
    domainContributions,
    evidenceLabel:
      outputKind === "research-risk-estimate"
        ? "Prospective-human research model"
        : "Synthetic end-to-end demonstration model",
    interpretation:
      outputKind === "research-risk-estimate"
        ? "Research-only estimate from a prospectively labeled model. It is not a diagnosis, treatment recommendation, or clinically validated probability."
        : "Engineering demonstration score showing the complete MediaPipe-to-model pipeline. It is not trained on real injury outcomes and must not be interpreted as injury probability.",
  };
}
