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
  schemaVersion: "1.0.0";
  modelType: "movement-quality-deviation-classifier";
  clinicalClaim: "none";
  positiveClass: string;
  negativeClass: string;
  features: MovementQualityFeatureName[];
  preprocessing: {
    imputation: "median";
    medians: number[];
    means: number[];
    scales: number[];
  };
  interpretableBaseline: {
    intercept: number;
    coefficients: Record<MovementQualityFeatureName, number>;
  };
  calibration: {
    method: string;
    intercept: number;
    coefficient: number;
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
  label: "reference-like" | "deviation-like";
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
  const featureContributions: MovementQualityInference["featureContributions"] = [];

  features.forEach((feature, index) => {
    const observed = values[feature];
    const imputed = observed === null || !Number.isFinite(observed)
      ? preprocessing.medians[index]
      : observed;
    const scale = preprocessing.scales[index];
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`Invalid model scale for ${feature}.`);
    }
    const standardizedValue = (imputed - preprocessing.means[index]) / scale;
    const coefficient = interpretableBaseline.coefficients[feature];
    if (!Number.isFinite(coefficient)) {
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

  const label = deviationProbability >= 0.5 ? "deviation-like" : "reference-like";

  return {
    deviationProbability,
    referenceProbability: 1 - deviationProbability,
    featureContributions,
    label,
    interpretation:
      label === "deviation-like"
        ? "This repetition resembles non-optimal/deviation examples in the validated training domain. It is not an injury prediction or diagnosis."
        : "This repetition resembles reference/correct examples in the validated training domain. It does not establish that the movement is injury-free.",
  };
}
