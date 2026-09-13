import { describe, expect, it } from "vitest";
import {
  evaluateInjuryRiskResearch,
  summarizeKneeResearchFeatures,
} from "./injury-risk-research";

describe("injury-risk research screen", () => {
  it("summarizes bilateral knee-control features without inventing injury probability", () => {
    const features = summarizeKneeResearchFeatures({
      leftKneeDeviation: [3, 8, 12],
      rightKneeDeviation: [4, 6, 9],
      trunkLean: [2, 4, 3],
      pelvicObliquity: [1, 2, 1],
      poseConfidence: Array.from({ length: 40 }, () => 0.93),
    });

    expect(features.peakKneeDeviationDeg).toBe(12);
    expect(features.kneeAsymmetryDeg).toBe(3);
    expect(features.sampleCount).toBe(3);
    expect(evaluateInjuryRiskResearch(features)).not.toHaveProperty("injuryProbability");
  });

  it("fails to a low-data state when capture quality is insufficient", () => {
    const result = evaluateInjuryRiskResearch({
      leftKneeDeviationDeg: 15,
      rightKneeDeviationDeg: 12,
      peakKneeDeviationDeg: 15,
      kneeAsymmetryDeg: 3,
      trunkLeanDeg: 5,
      pelvicObliquityDeg: 2,
      meanPoseConfidence: 0.5,
      sampleCount: 10,
    });

    expect(result.dataQuality).toBe("low");
    expect(result.associations[0].status).toBe("insufficient-data");
  });

  it("never promotes the current webcam screen to ACL prediction", () => {
    const result = evaluateInjuryRiskResearch({
      leftKneeDeviationDeg: 20,
      rightKneeDeviationDeg: 18,
      peakKneeDeviationDeg: 20,
      kneeAsymmetryDeg: 2,
      trunkLeanDeg: 5,
      pelvicObliquityDeg: 2,
      meanPoseConfidence: 0.95,
      sampleCount: 100,
    });

    expect(result.associations.find((item) => item.target === "acl-injury")?.status)
      .toBe("not-supported-for-prediction");
  });
});
