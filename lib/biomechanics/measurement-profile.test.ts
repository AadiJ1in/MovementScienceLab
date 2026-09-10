import { describe, expect, it } from "vitest";
import type { PoseFrame, PoseKeypoint } from "@/lib/pose/types";
import {
  angleNamesForMovement,
  computeAnglesForMovement,
  isAngleValidForMovement,
} from "./measurement-profile";

function keypoint(index: number, x: number, y: number, visibility = 0.95): PoseKeypoint {
  return { index, x, y, z: 0, visibility, trusted: visibility >= 0.7 };
}

function completeFrame(): PoseFrame {
  const points = Array.from({ length: 33 }, (_, index) => keypoint(index, 0.5, 0.5));
  points[11] = keypoint(11, 0.4, 0.2);
  points[12] = keypoint(12, 0.6, 0.2);
  points[13] = keypoint(13, 0.35, 0.45);
  points[14] = keypoint(14, 0.65, 0.45);
  points[23] = keypoint(23, 0.45, 0.5);
  points[24] = keypoint(24, 0.55, 0.5);
  points[25] = keypoint(25, 0.45, 0.7);
  points[26] = keypoint(26, 0.55, 0.7);
  points[27] = keypoint(27, 0.5, 0.9);
  points[28] = keypoint(28, 0.6, 0.9);

  return {
    frameTimestamp: 1000,
    keypoints: points,
    trustedKeypointCount: points.length,
  };
}

describe("capture-view measurement profiles", () => {
  it("does not expose sagittal knee flexion from front-view capture", () => {
    expect(isAngleValidForMovement("leftKneeFlexion", "squat-front")).toBe(false);
    expect(angleNamesForMovement("squat-front")).toContain("leftKneeFrontalDeviation");
  });

  it("does not expose frontal knee deviation or pelvic obliquity from side view", () => {
    expect(isAngleValidForMovement("leftKneeFrontalDeviation", "squat-side")).toBe(false);
    expect(isAngleValidForMovement("pelvicLineObliquity", "squat-side")).toBe(false);
    expect(angleNamesForMovement("squat-side")).toContain("leftKneeFlexion");
  });

  it("filters emitted measurements to the selected projection", () => {
    const front = computeAnglesForMovement(completeFrame(), "squat-front");
    const side = computeAnglesForMovement(completeFrame(), "squat-side");

    expect(front.some((reading) => reading.angleName === "leftKneeFlexion")).toBe(false);
    expect(front.some((reading) => reading.angleName === "leftKneeFrontalDeviation")).toBe(true);
    expect(side.some((reading) => reading.angleName === "leftKneeFlexion")).toBe(true);
    expect(side.some((reading) => reading.angleName === "leftKneeFrontalDeviation")).toBe(false);
  });
});
