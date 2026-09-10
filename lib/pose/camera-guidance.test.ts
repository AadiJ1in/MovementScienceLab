import { describe, expect, it } from "vitest";
import { evaluateCameraGuidance } from "./camera-guidance";
import type { PoseFrame, PoseKeypoint } from "./types";

function keypoint(index: number, trusted = true, x = 0.5, y = 0.5): PoseKeypoint {
  return {
    index,
    x,
    y,
    z: 0,
    visibility: trusted ? 0.95 : 0.2,
    trusted,
  };
}

function frame(overrides: PoseKeypoint[] = []): PoseFrame {
  const keypoints = Array.from({ length: 33 }, (_, index) => keypoint(index, false));
  for (const override of overrides) keypoints[override.index] = override;
  return {
    frameTimestamp: 1000,
    keypoints,
    trustedKeypointCount: keypoints.filter((point) => point.trusted).length,
  };
}

const FRONT_REQUIRED = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32];
const LEFT_SIDE = [11, 13, 15, 23, 25, 27, 31];

describe("evaluateCameraGuidance", () => {
  it("rejects a missing pose", () => {
    expect(evaluateCameraGuidance(null, "squat-front").ready).toBe(false);
  });

  it("accepts a fully visible front-view core pose", () => {
    const result = evaluateCameraGuidance(
      frame(FRONT_REQUIRED.map((index) => keypoint(index))),
      "squat-front",
    );
    expect(result.ready).toBe(true);
  });

  it("rejects a front view with a required ankle untrusted", () => {
    const visible = FRONT_REQUIRED
      .filter((index) => index !== 27)
      .map((index) => keypoint(index));
    const result = evaluateCameraGuidance(frame(visible), "squat-front");
    expect(result.ready).toBe(false);
    expect(result.messages.join(" ")).toMatch(/ankles/i);
  });

  it("accepts one sufficiently visible side of the body", () => {
    const result = evaluateCameraGuidance(
      frame(LEFT_SIDE.map((index) => keypoint(index))),
      "squat-side",
    );
    expect(result.ready).toBe(true);
  });

  it("rejects a pose touching the frame boundary", () => {
    const points = FRONT_REQUIRED.map((index) =>
      keypoint(index, true, index === 11 ? 0.01 : 0.5, 0.5),
    );
    const result = evaluateCameraGuidance(frame(points), "squat-front");
    expect(result.ready).toBe(false);
    expect(result.messages.join(" ")).toMatch(/farther from the camera/i);
  });
});
