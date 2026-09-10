import { describe, expect, it } from "vitest";
import {
  assertDeployableMovementQualityArtifact,
  inferMovementQuality,
  type MovementQualityFeatureName,
  type MovementQualityFeatures,
  type MovementQualityModelArtifact,
} from "./movement-quality-model";

const features: MovementQualityFeatureName[] = [
  "left_knee_flexion_min",
  "left_knee_flexion_max",
  "left_knee_flexion_range",
  "right_knee_flexion_min",
  "right_knee_flexion_max",
  "right_knee_flexion_range",
  "peak_abs_left_knee_frontal_deviation",
  "peak_abs_right_knee_frontal_deviation",
  "peak_trunk_lean",
  "peak_abs_pelvic_line_obliquity",
  "left_shoulder_elevation_peak",
  "right_shoulder_elevation_peak",
  "knee_flexion_asymmetry",
  "shoulder_elevation_asymmetry",
  "rep_duration_ms",
  "mean_pose_confidence",
  "min_pose_confidence",
];

function artifact(): MovementQualityModelArtifact {
  return {
    schemaVersion: "1.1.0",
    modelType: "movement-quality-deviation-classifier",
    clinicalClaim: "none",
    positiveClass: "deviation",
    negativeClass: "reference",
    features,
    preprocessing: {
      imputation: "median",
      medians: features.map(() => 0),
      means: features.map(() => 0),
      scales: features.map(() => 1),
    },
    interpretableBaseline: {
      intercept: 0,
      coefficients: Object.fromEntries(
        features.map((feature) => [feature, feature === "peak_trunk_lean" ? 1 : 0]),
      ) as Record<MovementQualityFeatureName, number>,
    },
    calibration: { method: "test", intercept: 0, coefficient: 1 },
    decisionPolicy: {
      threshold: 0.5,
      selectionMethod: "test",
      uncertaintyHalfWidth: 0,
    },
    domainGate: {
      method: "max-absolute-standardized-feature",
      maxAbsStandardizedValue: 4,
      trainingQuantile: 0.99,
      maxMissingFraction: 0.25,
    },
    validation: {
      splitUnit: "subject",
      development: {},
      untouchedTest: {},
      nSubjectsTotal: 10,
      nSubjectsTrain: 8,
      nSubjectsTest: 2,
      nRowsTrain: 80,
      nRowsTest: 20,
    },
    deploymentGate: {
      requiresExternalDatasetValidation: false,
      requiresCameraDomainValidation: false,
      mayBeDisplayedAsInjuryProbability: false,
    },
  };
}

const emptyInput = Object.fromEntries(features.map((feature) => [feature, 0])) as MovementQualityFeatures;

describe("movement quality model", () => {
  it("produces an interpretable deviation probability", () => {
    const input = { ...emptyInput, peak_trunk_lean: 2 };
    const result = inferMovementQuality(artifact(), input);
    expect(result.deviationProbability).toBeGreaterThan(0.5);
    expect(result.label).toBe("deviation-like");
    expect(result.featureContributions[0].feature).toBe("peak_trunk_lean");
    expect(result.interpretation).toContain("not an injury prediction");
  });

  it("rejects a clearly out-of-training-distribution sample", () => {
    const input = { ...emptyInput, peak_trunk_lean: 10 };
    const result = inferMovementQuality(artifact(), input);
    expect(result.label).toBe("uncertain");
    expect(result.outOfDomain).toBe(true);
    expect(result.uncertaintyReasons.join(" ")).toMatch(/outside the learned training distribution/);
  });

  it("rejects samples with too many missing active features", () => {
    const input = { ...emptyInput };
    features.slice(0, 6).forEach((feature) => {
      input[feature] = null;
    });
    const result = inferMovementQuality(artifact(), input);
    expect(result.label).toBe("uncertain");
    expect(result.outOfDomain).toBe(true);
    expect(result.uncertaintyReasons.join(" ")).toMatch(/Too many model inputs are missing/);
  });

  it("blocks artifacts that have not completed external validation", () => {
    const model = artifact();
    model.deploymentGate.requiresExternalDatasetValidation = true;
    expect(() => assertDeployableMovementQualityArtifact(model)).toThrow(/external dataset validation/);
  });

  it("blocks injury-probability presentation", () => {
    const model = artifact();
    expect(model.deploymentGate.mayBeDisplayedAsInjuryProbability).toBe(false);
  });
});
