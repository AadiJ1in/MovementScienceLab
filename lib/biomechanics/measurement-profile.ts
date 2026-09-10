import {
  computeAnglesForFrame,
  trunkLeanFromBestVisibleSide,
  type AngleName,
  type AngleReading,
} from "./angles";
import { MOVEMENT_GUIDANCE } from "../pose/camera-guidance";
import type { CaptureView, MovementType, PoseFrame } from "../pose/types";

export const ANGLE_NAMES_BY_VIEW: Record<CaptureView, readonly AngleName[]> = {
  front: [
    "leftKneeFrontalDeviation",
    "rightKneeFrontalDeviation",
    "trunkLean",
    "pelvicLineObliquity",
    "leftShoulderElevation",
    "rightShoulderElevation",
  ],
  side: [
    "leftKneeFlexion",
    "rightKneeFlexion",
    "trunkLean",
    "leftShoulderElevation",
    "rightShoulderElevation",
  ],
};

export function angleNamesForMovement(movement: MovementType): readonly AngleName[] {
  return ANGLE_NAMES_BY_VIEW[MOVEMENT_GUIDANCE[movement].view];
}

export function isAngleValidForMovement(angleName: AngleName, movement: MovementType): boolean {
  return angleNamesForMovement(movement).includes(angleName);
}

/**
 * Restricts 2D calculations to measurements that are interpretable in the
 * selected capture projection. Side-view trunk lean is recomputed from the
 * most visible shoulder/hip chain because the far side is expected to be
 * partially occluded in a correctly positioned side-on capture.
 */
export function computeAnglesForMovement(
  frame: PoseFrame,
  movement: MovementType,
): AngleReading[] {
  const view = MOVEMENT_GUIDANCE[movement].view;
  const allowed = new Set<AngleName>(angleNamesForMovement(movement));
  const generic = computeAnglesForFrame(frame).filter(
    (reading) => allowed.has(reading.angleName) && !(view === "side" && reading.angleName === "trunkLean"),
  );

  if (view === "side") {
    const sideTrunkLean = trunkLeanFromBestVisibleSide(frame);
    if (sideTrunkLean) generic.push(sideTrunkLean);
  }

  return generic;
}
