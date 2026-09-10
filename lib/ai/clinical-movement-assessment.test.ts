import { describe, expect, it } from "vitest";
import { assessMovementForClinicalReview } from "./clinical-movement-assessment";
import type { MovementQualityInference } from "./movement-quality-model";

function inference(
  label: MovementQualityInference["label"],
  outOfDomain = false,
): MovementQualityInference {
  return {
    deviationProbability: label === "deviation-like" ? 0.8 : 0.2,
    referenceProbability: label === "deviation-like" ? 0.2 : 0.8,
    featureContributions: [],
    label,
    outOfDomain,
    uncertaintyReasons: label === "uncertain" ? ["gray zone"] : [],
    interpretation: "test",
  };
}

describe("assessMovementForClinicalReview", () => {
  it("never claims current or future injury", () => {
    const result = assessMovementForClinicalReview("squat-front", inference("deviation-like"), {
      repeatedDeviationCount: 8,
    });
    expect(result.canDiagnoseCurrentInjury).toBe(false);
    expect(result.canPredictFutureInjury).toBe(false);
  });

  it("routes repeated deviations for review", () => {
    const result = assessMovementForClinicalReview("squat-front", inference("deviation-like"), {
      repeatedDeviationCount: 3,
    });
    expect(result.reviewPriority).toBe("review");
  });

  it("routes out-of-domain samples for review", () => {
    const result = assessMovementForClinicalReview("general-side", inference("uncertain", true));
    expect(result.reviewPriority).toBe("review");
  });

  it("escalates reported acute symptoms independently of model score", () => {
    const result = assessMovementForClinicalReview("squat-side", inference("reference-like"), {
      painOrAcuteSymptomsReported: true,
    });
    expect(result.reviewPriority).toBe("high-priority");
    expect(result.summary).toContain("cannot diagnose");
  });
});
