import { describe, expect, it } from "vitest";
import { buildPoseStreamFrame, POSE_LANDMARK_NAMES } from "./stream";
import type { PoseFrame } from "./types";

function makePoseFrame(): PoseFrame {
  return {
    frameTimestamp: 1234.5,
    trustedKeypointCount: 33,
    keypoints: POSE_LANDMARK_NAMES.map((_, index) => ({
      index,
      x: index / 100,
      y: index / 100 + 0.1,
      z: -index / 1000,
      visibility: 0.95,
      trusted: true,
    })),
  };
}

describe("buildPoseStreamFrame", () => {
  it("emits named landmarks and capture metadata for detected poses", () => {
    const streamFrame = buildPoseStreamFrame(makePoseFrame(), {
      sequence: 7,
      callbackTimestampMs: 1300,
      capturedAtEpochMs: Date.UTC(2026, 8, 15, 17, 0, 0),
      width: 1280,
      height: 720,
      facingMode: "user",
      delegate: "GPU",
      cameraFps: 30,
      inferenceFps: 24,
      averageInferenceLatencyMs: 18.2,
    });

    expect(streamFrame.sequence).toBe(7);
    expect(streamFrame.timestampMs).toBe(1234.5);
    expect(streamFrame.timestampSource).toBe("mediapipe-inference-clock");
    expect(streamFrame.pose.detected).toBe(true);
    expect(streamFrame.pose.landmarkCount).toBe(33);
    expect(streamFrame.pose.landmarks[11].name).toBe("left_shoulder");
    expect(streamFrame.pose.landmarks[25].name).toBe("left_knee");
    expect(streamFrame.image).toEqual({ width: 1280, height: 720, mirrored: true });
    expect(streamFrame.processing.delegate).toBe("GPU");
  });

  it("keeps no-pose inference frames in the stream instead of dropping them", () => {
    const streamFrame = buildPoseStreamFrame(null, {
      sequence: 8,
      callbackTimestampMs: 1400,
      capturedAtEpochMs: Date.UTC(2026, 8, 15, 17, 0, 1),
      width: 640,
      height: 480,
      facingMode: "environment",
    });

    expect(streamFrame.timestampMs).toBe(1400);
    expect(streamFrame.timestampSource).toBe("capture-callback-clock");
    expect(streamFrame.pose.detected).toBe(false);
    expect(streamFrame.pose.landmarks).toEqual([]);
    expect(streamFrame.pose.trustedFraction).toBe(0);
    expect(streamFrame.image.mirrored).toBe(false);
  });

  it("contains the canonical 33 MediaPipe pose landmark names", () => {
    expect(POSE_LANDMARK_NAMES).toHaveLength(33);
    expect(POSE_LANDMARK_NAMES[0]).toBe("nose");
    expect(POSE_LANDMARK_NAMES[32]).toBe("right_foot_index");
  });
});
