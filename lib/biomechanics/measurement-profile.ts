import {
  computeAnglesForFrame,
  trunkLeanFromBestVisibleSide,
  type AngleName,
  type AngleReading,
} from "./angles";
import { getExerciseDefinition } from "../exercises/registry";
import type { MovementType, PoseFrame } from "../pose/types";

export function angleNamesForMovement(movement: MovementType): readonly AngleName[] {
  return getExerciseDefinition(movement).availableMetrics;
}

export function isAngleValidForMovement(angleName: AngleName, movement: MovementType): boolean {
  return angleNamesForMovement(movement).includes(angleName);
}

/**
 * Restricts 2D calculations to measurements registered for the selected
 * exercise/capture projection. Side-view trunk lean is recomputed from the
 * most visible shoulder/hip chain because the far side is expected to be
 * partially occluded in a correctly positioned side-on capture.
 */
export function computeAnglesForMovement(frame: PoseFrame, movement: MovementType): AngleReading[] {
  const exercise = getExerciseDefinition(movement);
  const allowed = new Set<AngleName>(exercise.availableMetrics);
  const generic = computeAnglesForFrame(frame).filter(
    (reading) => allowed.has(reading.angleName) && !(exercise.view === "side" && reading.angleName === "trunkLean"),
  );

  if (exercise.view === "side" && allowed.has("trunkLean")) {
    const sideTrunkLean = trunkLeanFromBestVisibleSide(frame);
    if (sideTrunkLean) generic.push(sideTrunkLean);
  }

  return generic;
}
