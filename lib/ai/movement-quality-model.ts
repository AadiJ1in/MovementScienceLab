export type MovementQualityFeatureName =
  | "left_knee_flexion_min"
  | "left_knee_flexion_max"
  | "left_knee_flexion_range"
  | "right_knee_flexion_min"
  | "right_knee_flexion_max"
  | "right_knee_flexion_range"
  | "peak_abs_left_knee_frontal_deviation"
  | "peak_abs_right_knee_frontal_deviation"
  | "peak_trunk_lean"
  | "peak_abs_pelvic_line_obliquity"
  | "left_shoulder_elevation_peak"
  | "right_shoulder_elevation_peak"
  | "knee_flexion_asymmetry"
  | "shoulder_elevation_asymmetry"
  | "rep_duration_ms"
  | "mean_pose_confidence"
  | "min_pose_confidence";

export type MovementQualityFeatures = Record<MovementQualityFeatureName, number | null>;

export type MovementQualityModelArtifact = {
  schemaVersion: "1.0.0" | "1.1.0";
  modelType: "movement-quality-deviation-classifier";
  clinicalClaim: "none";
  positiveClass: string;
  negativeClass: string;
  features: MovementQualityFeatureName[];
  unavailableSourceFeatures?: MovementQualityFeatureName[];
  preprocessing: {
    imputation: "median";
    medians: number[];
    means: number[];
    scales: number[];
  };
  interpretableBaseline: {
    intercept: number;
    coefficients: Partial<Record<MovementQualityFeatureName, number>>;
  };
  calibration: {
    method: string;
    intercept: number;
    coefficient: number;
  };
  decisionPolicy?: {
    threshold: number;
    selectionMethod: string;
    uncertaintyHalfWidth: number;
  };
  domainGate?: {
    method: "max-absolute-standardized-feature";
    maxAbsStandardizedValue: number;
    trainingQuantile: number;
    maxMissingFraction: number;
  };
  validation: {
    splitUnit: "subject";
    development: unknown;
    untouchedTest: unknown;
    nSubjectsTotal: number;
    nSubjectsTrain: number;
    nSubjectsTest: number;
    nRowsTrain: number;
    nRowsTest: number;
  };
  deploymentGate: {
    requiresExternalDatasetValidation: boolean;
    requiresCameraDomainValidation: boolean;
    mayBeDisplayedAsInjuryProbability: false;
  };
};

export type MovementQualityInference = {
  deviationProbability: number;
  referenceProbability: number;
  featureContributions: Array<{
    feature: MovementQualityFeatureName;
    standardizedValue: number;
    logitContribution: number;
  }>;
  label: "reference-like" | "deviation-like" | "uncertain";
  outOfDomain: boolean;
  uncertaintyReasons: string[];
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

export function assertDeployableMovementQualityArtifact(
  artifact: MovementQualityModelArtifact,
): void {
  if (artifact.clinicalClaim !== "none") {
    throw new Error("Movement-quality artifact must not contain an injury/diagnostic clinical claim.");
  }
  if (artifact.deploymentGate.mayBeDisplayedAsInjuryProbability !== false) {
    throw new Error("Movement-quality probability cannot be presented as injury probability.");
  }
  if (artifact.deploymentGate.requiresExternalDatasetValidation) {
    throw new Error("Model is blocked: external dataset validation has not been cleared.");
  }
  if (artifact.deploymentGate.requiresCameraDomainValidation) {
    throw new Error("Model is blocked: webcam/MediaPipe domain validation has not been cleared.");
  }
}

export function inferMovementQuality(
  artifact: MovementQualityModelArtifact,
  values: MovementQualityFeatures,
): MovementQualityInference {
  const { features, preprocessing, interpretableBaseline, calibration } = artifact;
  if (
    features.length !== preprocessing.medians.length ||
    features.length !== preprocessing.means.length ||
    features.length !== preprocessing.scales.length
  ) {
    throw new Error("Model artifact preprocessing arrays do not match feature count.");
  }

  let rawLogit = interpretableBaseline.intercept;
  let missingCount = 0;
  let maxAbsStandardizedValue = 0;
  const featureContributions: MovementQualityInference["featureContributions"] = [];

  features.forEach((feature, index) => {
    const observed = values[feature];
    const missing = observed === null || !Number.isFinite(observed);
    if (missing) missingCount += 1;
    const imputed = missing ? preprocessing.medians[index] : observed;
    const scale = preprocessing.scales[index];
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`Invalid model scale for ${feature}.`);
    }
    const standardizedValue = ((imputed as number) - preprocessing.means[index]) / scale;
    maxAbsStandardizedValue = Math.max(maxAbsStandardizedValue, Math.abs(standardizedValue));
    const coefficient = interpretableBaseline.coefficients[feature];
    if (coefficient === undefined || !Number.isFinite(coefficient)) {
      throw new Error(`Missing model coefficient for ${feature}.`);
    }
    const logitContribution = standardizedValue * coefficient;
    rawLogit += logitContribution;
    featureContributions.push({ feature, standardizedValue, logitContribution });
  });

  const rawProbability = sigmoid(rawLogit);
  const eps = 1e-6;
  const clipped = Math.min(1 - eps, Math.max(eps, rawProbability));
  const rawProbabilityLogit = Math.log(clipped / (1 - clipped));
  const deviationProbability = sigmoid(
    calibration.intercept + calibration.coefficient * rawProbabilityLogit,
  );

  featureContributions.sort(
    (a, b) => Math.abs(b.logitContribution) - Math.abs(a.logitContribution),
  );

  const threshold = artifact.decisionPolicy?.threshold ?? 0.5;
  const uncertaintyHalfWidth = artifact.decisionPolicy?.uncertaintyHalfWidth ?? 0;
  const uncertaintyReasons: string[] = [];
  let outOfDomain = false;

  if (artifact.domainGate) {
    const missingFraction = features.length ? missingCount / features.length : 1;
    if (missingFraction > artifact.domainGate.maxMissingFraction) {
      outOfDomain = true;
      uncertaintyReasons.push(
        `Too many model inputs are missing (${Math.round(missingFraction * 100)}%).`,
      );
    }
    if (maxAbsStandardizedValue > artifact.domainGate.maxAbsStandardizedValue) {
      outOfDomain = true;
      uncertaintyReasons.push("One or more measured features fall outside the learned training distribution.");
    }
  }

  if (Math.abs(deviationProbability - threshold) <= uncertaintyHalfWidth) {
    uncertaintyReasons.push("The model score falls inside its configured gray zone around the development cutoff.");
  }

  const label = outOfDomain || uncertaintyReasons.length > 0
    ? "uncertain"
    : deviationProbability >= threshold
      ? "deviation-like"
      : "reference-like";

  const interpretation = label === "uncertain"
    ? "The model does not have enough in-domain evidence to classify this repetition confidently. Re-capture under the validated protocol or request human review. This is not an injury prediction or diagnosis."
    : label === "deviation-like"
      ? "This repetition resembles non-optimal/deviation examples in the validated training domain. It is not an injury prediction or diagnosis."
      : "This repetition resembles reference/correct examples in the validated training domain. It does not establish that the movement is injury-free.";

  return {
    deviationProbability,
    referenceProbability: 1 - deviationProbability,
    featureContributions,
    label,
    outOfDomain,
    uncertaintyReasons,
    interpretation,
  };
}
