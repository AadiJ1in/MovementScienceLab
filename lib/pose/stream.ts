import type { PoseFrame } from "@/lib/pose/types";

export const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
] as const;

export type PoseLandmarkName = (typeof POSE_LANDMARK_NAMES)[number];
export type PoseFrameClock = "request-video-frame-callback" | "animation-frame-fallback";

export type PoseStreamLandmark = {
  index: number;
  name: PoseLandmarkName;
  x: number;
  y: number;
  z: number;
  visibility: number;
  trusted: boolean;
};

export type PoseWorldLandmarkInput = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseStreamFrame = {
  schemaVersion: "1.1.0";
  sequence: number;
  timestampMs: number;
  timestampSource: "mediapipe-inference-clock" | "capture-callback-clock";
  capturedAtIso: string;
  mediaTimeMs: number | null;
  frameClock: PoseFrameClock;
  image: {
    width: number | null;
    height: number | null;
    mirrored: boolean;
  };
  pose: {
    detected: boolean;
    landmarkCount: number;
    trustedLandmarkCount: number;
    trustedFraction: number;
    meanVisibility: number | null;
    landmarks: PoseStreamLandmark[];
    worldLandmarks: PoseStreamLandmark[];
    worldCoordinateNote: "mediapipe-model-relative-not-calibrated-metric-3d";
  };
  processing: {
    delegate: "GPU" | "CPU" | null;
    cameraFps: number | null;
    inferenceFps: number | null;
    averageInferenceLatencyMs: number | null;
    inferenceLatencyMs: number | null;
  };
};

export type PoseStreamContext = {
  sequence: number;
  callbackTimestampMs: number;
  capturedAtEpochMs: number;
  mediaTimeMs?: number;
  frameClock?: PoseFrameClock;
  width?: number;
  height?: number;
  facingMode?: string;
  delegate?: "GPU" | "CPU";
  cameraFps?: number;
  inferenceFps?: number;
  averageInferenceLatencyMs?: number;
  inferenceLatencyMs?: number;
};

export function buildPoseStreamFrame(
  frame: PoseFrame | null,
  context: PoseStreamContext,
  worldLandmarksInput: readonly PoseWorldLandmarkInput[] = [],
): PoseStreamFrame {
  const landmarks: PoseStreamLandmark[] = frame
    ? frame.keypoints.slice(0, POSE_LANDMARK_NAMES.length).map((point) => ({
        index: point.index,
        name: POSE_LANDMARK_NAMES[point.index] ?? POSE_LANDMARK_NAMES[0],
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility,
        trusted: point.trusted,
      }))
    : [];

  const trustedLandmarkCount = landmarks.filter((point) => point.trusted).length;
  const meanVisibility = landmarks.length
    ? landmarks.reduce((sum, point) => sum + point.visibility, 0) / landmarks.length
    : null;

  const worldLandmarks: PoseStreamLandmark[] = worldLandmarksInput
    .slice(0, POSE_LANDMARK_NAMES.length)
    .map((point, index) => ({
      index,
      name: POSE_LANDMARK_NAMES[index],
      x: point.x,
      y: point.y,
      z: point.z ?? 0,
      visibility: point.visibility ?? landmarks[index]?.visibility ?? 0,
      trusted: landmarks[index]?.trusted ?? false,
    }));

  return {
    schemaVersion: "1.1.0",
    sequence: context.sequence,
    timestampMs: frame?.frameTimestamp ?? context.callbackTimestampMs,
    timestampSource: frame ? "mediapipe-inference-clock" : "capture-callback-clock",
    capturedAtIso: new Date(context.capturedAtEpochMs).toISOString(),
    mediaTimeMs: context.mediaTimeMs ?? null,
    frameClock: context.frameClock ?? "animation-frame-fallback",
    image: {
      width: context.width ?? null,
      height: context.height ?? null,
      mirrored: context.facingMode !== "environment",
    },
    pose: {
      detected: landmarks.length === POSE_LANDMARK_NAMES.length,
      landmarkCount: landmarks.length,
      trustedLandmarkCount,
      trustedFraction: landmarks.length ? trustedLandmarkCount / landmarks.length : 0,
      meanVisibility,
      landmarks,
      worldLandmarks,
      worldCoordinateNote: "mediapipe-model-relative-not-calibrated-metric-3d",
    },
    processing: {
      delegate: context.delegate ?? null,
      cameraFps: context.cameraFps ?? null,
      inferenceFps: context.inferenceFps ?? null,
      averageInferenceLatencyMs: context.averageInferenceLatencyMs ?? null,
      inferenceLatencyMs: context.inferenceLatencyMs ?? null,
    },
  };
}
