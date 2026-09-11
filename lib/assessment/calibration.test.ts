import { describe, expect, it } from "vitest";
import { buildCalibrationChecks, calibrationPassed } from "./calibration";
import type { PoseFrame, PoseKeypoint } from "@/lib/pose/types";

function makeFrame(overrides: Record<number, Partial<PoseKeypoint>> = {}): PoseFrame {
  const keypoints = Array.from({ length: 33 }, (_, index): PoseKeypoint => ({
    index,
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    trusted: true,
    ...overrides[index],
  }));
  return { frameTimestamp: 100, keypoints, trustedKeypointCount: keypoints.filter((point) => point.trusted).length };
}

describe("assessment calibration", () => {
  it("passes a fully visible front-view squat", () => {
    const checks = buildCalibrationChecks(makeFrame(), "squat-front");
    expect(calibrationPassed(checks)).toBe(true);
  });

  it("fails front calibration when a required knee is not trusted", () => {
    const checks = buildCalibrationChecks(makeFrame({ 25: { trusted: false, visibility: 0.2 } }), "squat-front");
    expect(checks.find((check) => check.id === "knees")?.passed).toBe(false);
    expect(calibrationPassed(checks)).toBe(false);
  });

  it("allows one complete visible side chain for side-view capture", () => {
    const frame = makeFrame({
      12: { trusted: false }, 24: { trusted: false }, 26: { trusted: false }, 28: { trusted: false }, 32: { trusted: false },
    });
    const checks = buildCalibrationChecks(frame, "squat-side");
    expect(checks.find((check) => check.id === "required")?.passed).toBe(true);
  });

  it("fails calibration when a required trusted point is too close to the frame edge", () => {
    const checks = buildCalibrationChecks(makeFrame({ 27: { x: 0.01 } }), "squat-front");
    expect(checks.find((check) => check.id === "frame-edge")?.passed).toBe(false);
    expect(calibrationPassed(checks)).toBe(false);
  });
});
