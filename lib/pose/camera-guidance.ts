import { EXERCISES, getExerciseDefinition } from "../exercises/registry";
import type { CaptureView, MovementType, PoseFrame, PoseKeypoint } from "./types";

export const KEYPOINT_VISIBILITY_THRESHOLD = 0.7;

export const MOVEMENT_GUIDANCE = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, {
    label: exercise.label,
    view: exercise.view,
    instruction: exercise.cameraInstructions,
  }]),
) as Record<MovementType, { label: string; view: CaptureView; instruction: string }>;

export type CameraGuidanceStatus = { ready: boolean; messages: string[] };

function allTrusted(frame: PoseFrame, indices: readonly number[]) {
  return indices.every((index) => frame.keypoints[index]?.trusted === true);
}
function trustedCount(frame: PoseFrame, indices: readonly number[]) {
  return indices.filter((index) => frame.keypoints[index]?.trusted === true).length;
}
function isTrustedPoint(point: PoseKeypoint | undefined): point is PoseKeypoint {
  return point?.trusted === true;
}

export function evaluateCameraGuidance(frame: PoseFrame | null, movement: MovementType): CameraGuidanceStatus {
  if (!frame || frame.keypoints.length !== 33) {
    return { ready: false, messages: ["Move into view so MediaPipe can detect one complete body pose."] };
  }

  const exercise = getExerciseDefinition(movement);
  const calibration = exercise.calibration;
  const messages: string[] = [];
  let framingIndices = calibration.requiredLandmarks;

  if (calibration.mode === "bilateral") {
    if (!allTrusted(frame, calibration.requiredLandmarks)) {
      messages.push(`Keep the required landmarks clearly visible: ${calibration.description}.`);
    }
  } else {
    const left = calibration.leftSideLandmarks ?? [];
    const right = calibration.rightSideLandmarks ?? [];
    const useLeft = trustedCount(frame, left) >= trustedCount(frame, right);
    framingIndices = useLeft ? left : right;
    if (!framingIndices.length || !allTrusted(frame, framingIndices)) {
      messages.push(`Keep one complete visible-side chain clear: ${calibration.description}. Remove occlusions or adjust the camera.`);
    }
  }

  const framingPoints = framingIndices.map((index) => frame.keypoints[index]).filter(isTrustedPoint);
  if (framingPoints.length > 0) {
    const xs = framingPoints.map((point) => point.x);
    const ys = framingPoints.map((point) => point.y);
    const margin = 0.03;
    if (Math.min(...xs) < margin || Math.max(...xs) > 1 - margin || Math.min(...ys) < margin || Math.max(...ys) > 1 - margin) {
      messages.push("Move slightly farther from the camera so the required body landmarks stay inside the frame.");
    }
  }

  return {
    ready: messages.length === 0,
    messages: messages.length ? messages : [`${exercise.label} positioning looks usable. This confirms required landmark visibility and framing, not perfect 3D camera alignment.`],
  };
}
