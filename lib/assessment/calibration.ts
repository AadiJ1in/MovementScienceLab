import { getExerciseDefinition } from "../exercises/registry";
import type { MovementType, PoseFrame } from "../pose/types";

export type CalibrationCheck = {
  id: "head" | "torso" | "hips" | "knees" | "ankles" | "required" | "frame-edge";
  label: string;
  passed: boolean;
};

const trusted = (frame: PoseFrame | null, index: number) => frame?.keypoints[index]?.trusted === true;

function pairVisible(frame: PoseFrame | null, a: number, b: number, sideMode: boolean) {
  return sideMode ? trusted(frame, a) || trusted(frame, b) : trusted(frame, a) && trusted(frame, b);
}

function trustedCount(frame: PoseFrame | null, indices: readonly number[]) {
  return indices.filter((index) => trusted(frame, index)).length;
}

function includesAny(indices: readonly number[], candidates: readonly number[]) {
  return candidates.some((index) => indices.includes(index));
}

export function buildCalibrationChecks(frame: PoseFrame | null, movement: MovementType): CalibrationCheck[] {
  const exercise = getExerciseDefinition(movement);
  const calibration = exercise.calibration;
  const sideMode = calibration.mode === "best-visible-side";

  let activeRequired = calibration.requiredLandmarks;
  let requiredPassed = activeRequired.every((index) => trusted(frame, index));
  if (sideMode) {
    const left = calibration.leftSideLandmarks ?? [];
    const right = calibration.rightSideLandmarks ?? [];
    activeRequired = trustedCount(frame, left) >= trustedCount(frame, right) ? left : right;
    requiredPassed = activeRequired.length > 0 && activeRequired.every((index) => trusted(frame, index));
  }

  const requiredPoints = activeRequired
    .map((index) => frame?.keypoints[index])
    .filter((point): point is NonNullable<typeof point> => Boolean(point?.trusted));
  const frameEdgePassed = requiredPoints.length > 0 && requiredPoints.every(
    (point) => point.x >= 0.04 && point.x <= 0.96 && point.y >= 0.04 && point.y <= 0.96,
  );

  const checks: CalibrationCheck[] = [];
  if (activeRequired.includes(0)) checks.push({ id: "head", label: "Head visible", passed: trusted(frame, 0) });
  if (includesAny(activeRequired, [11, 12]) && includesAny(activeRequired, [23, 24])) {
    checks.push({ id: "torso", label: "Torso visible", passed: pairVisible(frame, 11, 12, sideMode) && pairVisible(frame, 23, 24, sideMode) });
  }
  if (includesAny(activeRequired, [23, 24])) checks.push({ id: "hips", label: "Hips visible", passed: pairVisible(frame, 23, 24, sideMode) });
  if (includesAny(activeRequired, [25, 26])) checks.push({ id: "knees", label: "Knees visible", passed: pairVisible(frame, 25, 26, sideMode) });
  if (includesAny(activeRequired, [27, 28])) checks.push({ id: "ankles", label: "Ankles visible", passed: pairVisible(frame, 27, 28, sideMode) });

  checks.push(
    { id: "required", label: "Required joints have sufficient confidence", passed: requiredPassed },
    { id: "frame-edge", label: "Required joints clear of frame edges", passed: frameEdgePassed },
  );
  return checks;
}

export function calibrationPassed(checks: readonly CalibrationCheck[]) {
  return checks.length > 0 && checks.every((check) => check.passed);
}
