import { EXERCISES, getExerciseDefinition, type ExerciseDevelopmentStatus } from "../exercises/registry";
import type { AngleName } from "../biomechanics/angles";
import type { MovementType } from "../pose/types";

export type ExerciseStatus = ExerciseDevelopmentStatus;

export type MovementDefinition = {
  id: MovementType;
  title: string;
  viewLabel: string;
  shortDescription: string;
  supportedMeasurements: readonly string[];
  primaryMetric: AngleName;
  requiredLandmarks: readonly number[];
  status: ExerciseStatus;
  /** Compatibility adapter for the existing patient capture UI. New segmentation logic lives in the exercise registry. */
  repCounting: "side-knee-cycle" | "not-yet-validated";
};

function toLegacyDefinition(id: MovementType): MovementDefinition {
  const exercise = getExerciseDefinition(id);
  return {
    id: exercise.id,
    title: exercise.label.replace(/ — (front|side) view$/i, ""),
    viewLabel: exercise.view === "front" ? "Front view" : "Side view",
    shortDescription: exercise.shortDescription,
    supportedMeasurements: exercise.supportedMeasurementLabels,
    primaryMetric: exercise.primaryMetric,
    requiredLandmarks: exercise.calibration.requiredLandmarks,
    status: exercise.developmentStatus,
    repCounting: exercise.id === "squat-side" && exercise.segmentation.strategy === "angle-cycle" ? "side-knee-cycle" : "not-yet-validated",
  };
}

export const MOVEMENT_DEFINITIONS: readonly MovementDefinition[] = EXERCISES.map((exercise) => toLegacyDefinition(exercise.id));
export function getMovementDefinition(id: MovementType): MovementDefinition { return toLegacyDefinition(id); }

export function statusLabel(status: ExerciseStatus) {
  switch (status) {
    case "prototype": return "Prototype";
    case "research": return "Research";
    case "validated-internally": return "Validated internally";
    case "externally-validated": return "Externally validated";
  }
}
