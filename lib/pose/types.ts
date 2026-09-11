import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type CaptureView = "front" | "side";

export type MovementType =
  | "squat-front"
  | "squat-side"
  | "push-up-side"
  | "shoulder-abduction-front"
  | "general-front"
  | "general-side";

export type PoseKeypoint = {
  index: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
  trusted: boolean;
};

export type PoseFrame = {
  frameTimestamp: number;
  keypoints: PoseKeypoint[];
  trustedKeypointCount: number;
};

export function toPoseFrame(
  landmarks: NormalizedLandmark[],
  frameTimestamp: number,
  trustThreshold: number,
): PoseFrame {
  const keypoints = landmarks.map((landmark, index) => {
    const visibility = landmark.visibility ?? 0;

    return {
      index,
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
      visibility,
      trusted: visibility >= trustThreshold,
    };
  });

  return {
    frameTimestamp,
    keypoints,
    trustedKeypointCount: keypoints.filter((point) => point.trusted).length,
  };
}
