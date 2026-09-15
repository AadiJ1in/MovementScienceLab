import { describe, expect, it } from "vitest";
import type { AngleName, AngleReading } from "../biomechanics/angles";
import { createExerciseRepSegmenter } from "./segmentation";

function reading(
  value: number,
  time: number,
  confidence = 0.95,
  angleName: AngleName = "leftKneeFlexion",
): AngleReading {
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

  it("keeps repetition detection disabled for profiles without registered cycle logic", () => {
    expect(createExerciseRepSegmenter("squat-front")).toBeNull();
    expect(createExerciseRepSegmenter("general-front")).toBeNull();
    expect(createExerciseRepSegmenter("general-side")).toBeNull();
  });

  it("registers elbow-flexion cycles for side-view push-ups", () => {
    const segmenter = createExerciseRepSegmenter("push-up-side");
    expect(segmenter).not.toBeNull();
    segmenter?.ingest([
      reading(4, 0, 0.94, "leftElbowFlexion"),
      reading(4, 0, 0.82, "rightElbowFlexion"),
    ]);
    expect(segmenter?.getCurrentState().signalAngleName).toBe("leftElbowFlexion");
  });

  it("registers shoulder-elevation cycles for side-view shoulder flexion", () => {
    const segmenter = createExerciseRepSegmenter("shoulder-flexion-side");
    expect(segmenter).not.toBeNull();
    segmenter?.ingest([
      reading(8, 0, 0.78, "leftShoulderElevation"),
      reading(8, 0, 0.96, "rightShoulderElevation"),
    ]);
    expect(segmenter?.getCurrentState().signalAngleName).toBe(
      "rightShoulderElevation",
    );
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
