import { describe, expect, it } from "vitest";
import { buildCalibrationChecks, calibrationPassed } from "./calibration";
import type { PoseFrame, PoseKeypoint } from "@/lib/pose/types";

function makeFrame(overrides: Record<number, Partial<PoseKeypoint>> = {}): PoseFrame {
  const layout: Record<number, Partial<PoseKeypoint>> = {
    0: { x: 0.5, y: 0.08 },
    11: { x: 0.40, y: 0.27 },
    12: { x: 0.60, y: 0.27 },
    13: { x: 0.38, y: 0.40 },
    14: { x: 0.62, y: 0.40 },
    15: { x: 0.37, y: 0.54 },
    16: { x: 0.63, y: 0.54 },
    23: { x: 0.43, y: 0.50 },
    24: { x: 0.57, y: 0.50 },
    25: { x: 0.43, y: 0.69 },
    26: { x: 0.57, y: 0.69 },
    27: { x: 0.43, y: 0.86 },
    28: { x: 0.57, y: 0.86 },
    31: { x: 0.40, y: 0.91 },
    32: { x: 0.60, y: 0.91 },
  };
  const keypoints = Array.from({ length: 33 }, (_, index): PoseKeypoint => ({
    index,
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    trusted: true,
    ...layout[index],
    ...overrides[index],
  }));
  return {
    frameTimestamp: 100,
    keypoints,
    trustedKeypointCount: keypoints.filter((point) => point.trusted).length,
  };
}

const goodImageQuality = {
  meanLuminance: 120,
  darkFraction: 0.02,
  brightFraction: 0.01,
  sharpnessScore: 8,
  lightingAcceptable: true,
  blurAcceptable: true,
  interpretationBoundary: "engineering-capture-quality-not-measurement-accuracy" as const,
};

describe("assessment calibration", () => {
  it("passes a fully visible, centered front-view squat", () => {
    const checks = buildCalibrationChecks(makeFrame(), "squat-front", {
      imageQuality: goodImageQuality,
      cameraStable: true,
    });
    expect(calibrationPassed(checks)).toBe(true);
    expect(checks.find((item) => item.id === "body-centered")?.passed).toBe(true);
    expect(checks.find((item) => item.id === "framing-distance")?.passed).toBe(true);
    expect(checks.find((item) => item.id === "view-alignment")?.passed).toBe(true);
  });

  it("fails front calibration when a required knee is not trusted", () => {
    const checks = buildCalibrationChecks(
      makeFrame({ 25: { trusted: false, visibility: 0.2 } }),
      "squat-front",
      { imageQuality: goodImageQuality },
    );
    expect(checks.find((item) => item.id === "knees")?.passed).toBe(false);
    expect(calibrationPassed(checks)).toBe(false);
  });

  it("allows one complete visible side chain for side-view capture", () => {
    const frame = makeFrame({
      11: { x: 0.5 },
      13: { x: 0.5 },
      15: { x: 0.5 },
      23: { x: 0.5 },
      25: { x: 0.5 },
      27: { x: 0.5 },
      31: { x: 0.5 },
      12: { trusted: false },
      24: { trusted: false },
      26: { trusted: false },
      28: { trusted: false },
      32: { trusted: false },
    });
    const checks = buildCalibrationChecks(frame, "squat-side", {
      imageQuality: goodImageQuality,
    });
    expect(checks.find((item) => item.id === "required")?.passed).toBe(true);
    expect(checks.find((item) => item.id === "view-alignment")?.passed).toBe(true);
    expect(calibrationPassed(checks)).toBe(true);
  });

  it("fails calibration when a required trusted point is too close to the frame edge", () => {
    const checks = buildCalibrationChecks(makeFrame({ 27: { x: 0.01 } }), "squat-front", {
      imageQuality: goodImageQuality,
    });
    expect(checks.find((item) => item.id === "frame-edge")?.passed).toBe(false);
    expect(calibrationPassed(checks)).toBe(false);
  });

  it("blocks capture when measured lighting or blur is clearly unsuitable", () => {
    const checks = buildCalibrationChecks(makeFrame(), "squat-front", {
      imageQuality: {
        ...goodImageQuality,
        lightingAcceptable: false,
        blurAcceptable: false,
      },
    });
    expect(checks.find((item) => item.id === "lighting")?.status).toBe("fail");
    expect(checks.find((item) => item.id === "blur")?.status).toBe("fail");
    expect(calibrationPassed(checks)).toBe(false);
  });

  it("does not pretend unavailable camera-level calibration is a failure", () => {
    const checks = buildCalibrationChecks(makeFrame(), "squat-side", {
      imageQuality: goodImageQuality,
    });
    const level = checks.find((item) => item.id === "camera-level");
    expect(level?.status).toBe("unavailable");
    expect(level?.blocking).toBe(false);
  });
});
