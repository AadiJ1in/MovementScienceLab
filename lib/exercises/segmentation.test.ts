import { describe, expect, it } from "vitest";
import type { AngleName, AngleReading } from "../biomechanics/angles";
import { createExerciseRepSegmenter } from "./segmentation";

function reading(value: number, time: number, confidence = 0.95, angleName: AngleName = "leftKneeFlexion"): AngleReading {
  return { angleName, value, confidence, frameTimestamp: time };
}

describe("exercise-specific segmentation", () => {
  it("builds the registered squat-side angle-cycle detector", () => {
    const segmenter = createExerciseRepSegmenter("squat-side");
    expect(segmenter).not.toBeNull();
    const values = [2, 2, 3, 12, 25, 45, 60, 55, 42, 25, 10, 5, 3, 2];
    values.forEach((value, index) => segmenter?.ingest([reading(value, index * 100)]));
    expect(segmenter?.getCompletedReps()).toHaveLength(1);
    expect(segmenter?.getCurrentState().signalAngleName).toBe("leftKneeFlexion");
  });

  it("detects a complete shoulder-abduction angle cycle", () => {
    const segmenter = createExerciseRepSegmenter("shoulder-abduction-front");
    expect(segmenter).not.toBeNull();
    const values = [4, 5, 7, 20, 40, 70, 100, 110, 100, 75, 45, 20, 10, 6, 5];
    values.forEach((value, index) => segmenter?.ingest([reading(value, index * 100, 0.95, "leftShoulderElevation")]));
    expect(segmenter?.getCompletedReps()).toHaveLength(1);
    expect(segmenter?.getCurrentState().signalAngleName).toBe("leftShoulderElevation");
  });

  it("returns no detector for exercises whose repetition logic is not registered", () => {
    expect(createExerciseRepSegmenter("squat-front")).toBeNull();
    expect(createExerciseRepSegmenter("push-up-side")).toBeNull();
  });

  it("selects the higher-confidence registered side as its signal", () => {
    const segmenter = createExerciseRepSegmenter("squat-side");
    segmenter?.ingest([
      reading(2, 0, 0.72, "leftKneeFlexion"),
      reading(2, 0, 0.96, "rightKneeFlexion"),
    ]);
    expect(segmenter?.getCurrentState().signalAngleName).toBe("rightKneeFlexion");
  });
});
