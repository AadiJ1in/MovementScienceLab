import { computeAnglesForFrame, type AngleName, type AngleReading } from "./angles";
import { MOVEMENT_GUIDANCE } from "@/lib/pose/camera-guidance";
import type { CaptureView, MovementType, PoseFrame } from "@/lib/pose/types";

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
 * Filters generic 2D calculations to measurements that are interpretable in
 * the selected capture projection. This prevents a side-view hip-knee-ankle
 * angle from being presented as a frontal-plane knee-deviation metric, and
 * prevents front-view projection from being presented as sagittal knee flexion.
 */
export function computeAnglesForMovement(
  frame: PoseFrame,
  movement: MovementType,
): AngleReading[] {
  const allowed = new Set<AngleName>(angleNamesForMovement(movement));
  return computeAnglesForFrame(frame).filter((reading) => allowed.has(reading.angleName));
}
