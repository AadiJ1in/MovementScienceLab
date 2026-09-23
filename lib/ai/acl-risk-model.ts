export type AclModelOrigin = "synthetic-development-fixture" | "prospective-human";

export type AclRiskFeatureName =
  | "prior_acl_injury_count"
  | "previous_lower_extremity_injury_count"
  | "body_mass_kg"
  | "tibia_length_cm"
  | "quadriceps_hamstring_ratio"
  | "weekly_exposure_minutes"
  | "acute_chronic_load_ratio"
  | "fatigue_score_0_10"
  | "knee_valgus_motion_proxy_deg"
  | "knee_flexion_rom_deg"
  | "peak_trunk_lean_deg"
  | "peak_pelvic_obliquity_deg"
  | "bilateral_knee_flexion_asymmetry_deg"
  | "generalized_joint_laxity_score"
  | "posterior_tibial_slope_deg"
  | "intercondylar_notch_width_index"
  | "family_history_acl"
  | "valgus_low_flexion_interaction"
  | "valgus_trunk_interaction"
  | "fatigue_valgus_interaction";

export type AclRiskInputs = Partial<Record<AclRiskFeatureName, number>>;

export type AclRiskModelArtifact = {
  schemaVersion: "1.0.0";
  modelType: "acl-logistic-risk-research";
  modelOrigin: AclModelOrigin;
  modelName: string;
  modelVersion: string;
  outcome: {
    label: "acl_tear_within_horizon";
    horizonDays: number;
    mechanismScope: "primary-noncontact-or-indirect-contact-acl-tear";
    population: string;
  };
  features: AclRiskFeatureName[];
  medians: number[];
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
  calibration: { intercept: number; coefficient: number };
  validation: {
    nParticipants: number;
    nAclEvents: number;
    participantGrouped: boolean;
    nestedEvaluation: boolean;
    externalValidated: boolean;
    sameCameraDomainValidated: boolean;
    auroc: number | null;
    auprc: number | null;
    brier: number | null;
  };
  deploymentGate: {
    eligibleForResearchAclEstimate: boolean;
    eligibleForClinicalAclProbability: false;
  };
  provenance: {
    label: string;
    note: string;
  };
};

export type AclRiskContribution = {
  feature: AclRiskFeatureName;
  observedValue: number | null;
  imputedValue: number;
  standardizedValue: number;
  coefficient: number;
  logitContribution: number;
};

export type AclRiskResult = {
  outputKind: "synthetic-acl-demo-score" | "research-acl-risk-estimate";
  score: number;
  rawScore: number;
  featureCoverage: number;
  observedFeatureCount: number;
  totalFeatureCount: number;
  missingCriticalFeatures: AclRiskFeatureName[];
  contributions: AclRiskContribution[];
  topDrivers: AclRiskContribution[];
  interpretation: string;
};

export const ACL_CRITICAL_FEATURES: readonly AclRiskFeatureName[] = [
  "knee_valgus_motion_proxy_deg",
  "knee_flexion_rom_deg",
  "peak_trunk_lean_deg",
  "quadriceps_hamstring_ratio",
  "body_mass_kg",
  "tibia_length_cm",
  "weekly_exposure_minutes",
];

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function finite(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function deriveAclInteractionFeatures(inputs: AclRiskInputs): AclRiskInputs {
  const next: AclRiskInputs = { ...inputs };
  const valgus = finite(inputs.knee_valgus_motion_proxy_deg);
  const flexion = finite(inputs.knee_flexion_rom_deg);
  const trunk = finite(inputs.peak_trunk_lean_deg);
  const fatigue = finite(inputs.fatigue_score_0_10);

  if (valgus !== null && flexion !== null) {
    // Physics-informed interaction only: larger frontal deviation combined with
    // lower sagittal excursion. This is a candidate term, not a validated ACL law.
    next.valgus_low_flexion_interaction = valgus * Math.max(0, 60 - flexion) / 60;
  }
  if (valgus !== null && trunk !== null) {
    next.valgus_trunk_interaction = valgus * Math.abs(trunk) / 20;
  }
  if (valgus !== null && fatigue !== null) {
    next.fatigue_valgus_interaction = valgus * fatigue / 10;
  }
  return next;
}

export function validateAclArtifact(artifact: AclRiskModelArtifact): void {
  const n = artifact.features.length;
  if (!n) throw new Error("ACL model artifact has no predictors.");
  if (
    artifact.medians.length !== n ||
    artifact.means.length !== n ||
    artifact.scales.length !== n ||
    artifact.coefficients.length !== n
  ) {
    throw new Error("ACL model parameter arrays must match the feature list.");
  }
  if (new Set(artifact.features).size !== n) {
    throw new Error("ACL model contains duplicate predictors.");
  }
  artifact.scales.forEach((scale) => {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("ACL model scales must be positive.");
  });
  if (artifact.deploymentGate.eligibleForClinicalAclProbability !== false) {
    throw new Error("ACL research artifacts cannot enable clinical ACL probability.");
  }
  if (
    artifact.modelOrigin === "synthetic-development-fixture" &&
    artifact.deploymentGate.eligibleForResearchAclEstimate
  ) {
    throw new Error("Synthetic ACL artifacts cannot be marked as research ACL estimates.");
  }
  if (
    artifact.modelOrigin === "prospective-human" &&
    artifact.deploymentGate.eligibleForResearchAclEstimate &&
    (!artifact.validation.participantGrouped || !artifact.validation.nestedEvaluation)
  ) {
    throw new Error("Prospective ACL estimates require participant-grouped nested evaluation.");
  }
}

export function inferAclRisk(
  artifact: AclRiskModelArtifact,
  rawInputs: AclRiskInputs,
): AclRiskResult {
  validateAclArtifact(artifact);
  const inputs = deriveAclInteractionFeatures(rawInputs);
  let logit = artifact.intercept;
  let observed = 0;

  const contributions = artifact.features.map((feature, index): AclRiskContribution => {
    const observedValue = finite(inputs[feature]);
    if (observedValue !== null) observed += 1;
    const imputedValue = observedValue ?? artifact.medians[index];
    const standardizedValue = (imputedValue - artifact.means[index]) / artifact.scales[index];
    const coefficient = artifact.coefficients[index];
    const logitContribution = standardizedValue * coefficient;
    logit += logitContribution;
    return {
      feature,
      observedValue,
      imputedValue,
      standardizedValue,
      coefficient,
      logitContribution,
    };
  });

  const rawScore = sigmoid(logit);
  const boundedRaw = Math.min(1 - 1e-6, Math.max(1e-6, rawScore));
  const rawLogOdds = Math.log(boundedRaw / (1 - boundedRaw));
  const score = sigmoid(
    artifact.calibration.intercept + artifact.calibration.coefficient * rawLogOdds,
  );
  const missingCriticalFeatures = ACL_CRITICAL_FEATURES.filter(
    (feature) => finite(inputs[feature]) === null,
  );
  const outputKind =
    artifact.modelOrigin === "prospective-human" &&
    artifact.deploymentGate.eligibleForResearchAclEstimate
      ? "research-acl-risk-estimate"
      : "synthetic-acl-demo-score";

  return {
    outputKind,
    score,
    rawScore,
    featureCoverage: observed / artifact.features.length,
    observedFeatureCount: observed,
    totalFeatureCount: artifact.features.length,
    missingCriticalFeatures,
    contributions,
    topDrivers: [...contributions]
      .sort((a, b) => Math.abs(b.logitContribution) - Math.abs(a.logitContribution))
      .slice(0, 6),
    interpretation:
      outputKind === "research-acl-risk-estimate"
        ? "Prospective-human ACL research estimate. It is not a diagnosis, treatment recommendation, or clinically validated individual probability."
        : "Synthetic ACL engineering score. It demonstrates the ACL-specific math and software path but must not be interpreted as a person's probability of tearing an ACL.",
  };
}

export const ACL_FORMULA_TEXT =
  "P(ACL tear within horizon) = sigmoid(β0 + Σ βj·z(xj) + βVF·[valgus×low-flexion] + βVT·[valgus×trunk] + βFV·[fatigue×valgus]); coefficients must be learned from prospectively labeled ACL outcomes.";
