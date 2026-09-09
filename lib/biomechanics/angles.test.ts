import { describe, expect, it } from "vitest";
import {
  angleAtVertex,
  angleFromHorizontal,
  angleFromVertical,
  computeAnglesForFrame,
} from "./angles";
import type { PoseFrame, PoseKeypoint } from "@/lib/pose/types";

function keypoint(index: number, x: number, y: number, visibility = 0.95): PoseKeypoint {
  return { index, x, y, z: 0, visibility, trusted: visibility >= 0.7 };
}

function frame(points: PoseKeypoint[]): PoseFrame {
  const keypoints = Array.from({ length: 33 }, (_, index) =>
    keypoint(index, 0, 0, 0),
  );
  for (const value of points) keypoints[value.index] = value;
  return {
    frameTimestamp: 1000,
    keypoints,
    trustedKeypointCount: keypoints.filter((point) => point.trusted).length,
  };
}

describe("vector angle primitives", () => {
  it("returns a 90 degree vertex angle", () => {
    expect(
      angleAtVertex({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }),
    ).toBeCloseTo(90, 6);
  });

  it("returns zero for an upward vertical vector", () => {
    expect(angleFromVertical({ x: 0, y: 1 }, { x: 0, y: 0 })).toBeCloseTo(0, 6);
  });

  it("returns zero for a horizontal pelvic line", () => {
    expect(angleFromHorizontal({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
  });
});

describe("computeAnglesForFrame", () => {
  it("reports 0 degrees knee flexion for a straight leg", () => {
    const result = computeAnglesForFrame(
      frame([
        keypoint(23, 0, 0),
        keypoint(25, 0, 1),
        keypoint(27, 0, 2),
      ]),
    );
    expect(result.find((r) => r.angleName === "leftKneeFlexion")?.value).toBeCloseTo(0, 6);
  });

  it("reports 90 degrees knee flexion for a right-angle knee", () => {
    const result = computeAnglesForFrame(
      frame([
        keypoint(23, 0, 0),
        keypoint(25, 0, 1),
        keypoint(27, 1, 1),
      ]),
    );
    expect(result.find((r) => r.angleName === "leftKneeFlexion")?.value).toBeCloseTo(90, 6);
  });

  it("uses the minimum landmark visibility as measurement confidence", () => {
    const result = computeAnglesForFrame(
      frame([
        keypoint(23, 0, 0, 0.91),
        keypoint(25, 0, 1, 0.84),
        keypoint(27, 1, 1, 0.76),
      ]),
    );
    expect(result.find((r) => r.angleName === "leftKneeFlexion")?.confidence).toBeCloseTo(0.76);
  });

  it("does not emit an angle when a required landmark is untrusted", () => {
    const result = computeAnglesForFrame(
      frame([
        keypoint(23, 0, 0, 0.95),
        keypoint(25, 0, 1, 0.95),
        keypoint(27, 1, 1, 0.4),
      ]),
    );
    expect(result.some((r) => r.angleName === "leftKneeFlexion")).toBe(false);
  });
});
