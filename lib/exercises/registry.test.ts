import { describe, expect, it } from "vitest";
import { EXERCISE_REGISTRY, getExerciseDefinition } from "./registry";

const IDS = ["squat-front", "squat-side", "push-up-side", "shoulder-abduction-front", "general-front", "general-side"] as const;

describe("exercise registry", () => {
  it("contains one complete definition for every supported movement", () => {
    expect(Object.keys(EXERCISE_REGISTRY).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const definition = getExerciseDefinition(id);
      expect(definition.id).toBe(id);
      expect(definition.availableMetrics).toContain(definition.primaryMetric);
      expect(definition.calibration.requiredLandmarks.length).toBeGreaterThan(0);
      expect(definition.cameraInstructions.length).toBeGreaterThan(20);
      expect(["prototype", "research", "validated-internally", "externally-validated"]).toContain(definition.developmentStatus);
    }
  });

  it("keeps engineering rep segmentation distinct from clinical thresholds", () => {
    const squat = getExerciseDefinition("squat-side");
    expect(squat.segmentation.strategy).toBe("angle-cycle");
    expect(squat.segmentation.signalAngles).toEqual(["leftKneeFlexion", "rightKneeFlexion"]);
    expect(squat.segmentation.config?.minConfidence).toBeGreaterThan(0);
  });

  it("registers shoulder abduction as a prototype front-view angle cycle", () => {
    const shoulder = getExerciseDefinition("shoulder-abduction-front");
    expect(shoulder.developmentStatus).toBe("prototype");
    expect(shoulder.view).toBe("front");
    expect(shoulder.availableMetrics).toEqual(["leftShoulderElevation", "rightShoulderElevation", "trunkLean"]);
    expect(shoulder.segmentation.strategy).toBe("angle-cycle");
    expect(shoulder.referenceTrajectorySupport).toBe(false);
  });

  it("does not claim reference-trajectory support for prototype movements without it", () => {
    expect(getExerciseDefinition("push-up-side").referenceTrajectorySupport).toBe(false);
    expect(getExerciseDefinition("shoulder-abduction-front").referenceTrajectorySupport).toBe(false);
    expect(getExerciseDefinition("general-front").referenceTrajectorySupport).toBe(false);
  });
});
