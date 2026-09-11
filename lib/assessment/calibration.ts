import { getMovementDefinition } from "./movement-definitions";
import type { MovementType, PoseFrame } from "@/lib/pose/types";

export type CalibrationCheck = {
  id: "head" | "torso" | "hips" | "knees" | "ankles" | "required" | "frame-edge";
  label: string;
  passed: boolean;
};

const trusted = (frame: PoseFrame | null, index: number) => frame?.keypoints[index]?.trusted === true;

function pairVisible(frame: PoseFrame | null, a: number, b: number, sideMode: boolean) {
  return sideMode ? trusted(frame, a) || trusted(frame, b) : trusted(frame, a) && trusted(frame, b);
}

export function buildCalibrationChecks(frame: PoseFrame | null, movement: MovementType): CalibrationCheck[] {
  const definition = getMovementDefinition(movement);
  const sideMode = movement.endsWith("-side");
  const requiredPoints = definition.requiredLandmarks
    .map((index) => frame?.keypoints[index])
    .filter((point): point is NonNullable<typeof point> => Boolean(point?.trusted));

  const frameEdgePassed =
    requiredPoints.length > 0 &&
    requiredPoints.every((point) => point.x >= 0.04 && point.x <= 0.96 && point.y >= 0.04 && point.y <= 0.96);

  const requiredPassed = sideMode
    ? pairVisible(frame, 11, 12, true) &&
      pairVisible(frame, 23, 24, true) &&
      pairVisible(frame, 25, 26, true) &&
      pairVisible(frame, 27, 28, true)
    : definition.requiredLandmarks.every((index) => trusted(frame, index));

  return [
    { id: "head", label: "Head visible", passed: trusted(frame, 0) },
    { id: "torso", label: "Torso visible", passed: pairVisible(frame, 11, 12, sideMode) && pairVisible(frame, 23, 24, sideMode) },
    { id: "hips", label: "Hips visible", passed: pairVisible(frame, 23, 24, sideMode) },
    { id: "knees", label: "Knees visible", passed: pairVisible(frame, 25, 26, sideMode) },
    { id: "ankles", label: "Ankles visible", passed: pairVisible(frame, 27, 28, sideMode) },
    { id: "required", label: "Required joints have sufficient confidence", passed: requiredPassed },
    { id: "frame-edge", label: "Required joints clear of frame edges", passed: frameEdgePassed },
  ];
}

export function calibrationPassed(checks: readonly CalibrationCheck[]) {
  return checks.every((check) => check.passed);
}
