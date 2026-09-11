import { describe, expect, it } from "vitest";
import { getPrimaryMeasurementMarker } from "./measurement-marker";
import type { PoseFrame, PoseKeypoint } from "./types";

function frameWith(overrides: Record<number, Partial<PoseKeypoint>> = {}): PoseFrame {
  const keypoints = Array.from({ length: 33 }, (_, index): PoseKeypoint => ({
    index,
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
    trusted: true,
    ...overrides[index],
  }));
  return { frameTimestamp: 10, keypoints, trustedKeypointCount: keypoints.filter((point) => point.trusted).length };
}

describe("getPrimaryMeasurementMarker", () => {
  it("places side-squat measurement at the more confident visible knee", () => {
    const frame = frameWith({
      23: { x: 0.4, y: 0.35, visibility: 0.6 },
      25: { x: 0.42, y: 0.55, visibility: 0.6 },
      27: { x: 0.5, y: 0.78, visibility: 0.6 },
      24: { x: 0.58, y: 0.35, visibility: 0.96 },
      26: { x: 0.6, y: 0.56, visibility: 0.96 },
      28: { x: 0.68, y: 0.78, visibility: 0.96 },
    });
    const marker = getPrimaryMeasurementMarker(frame, "squat-side");
    expect(marker?.angleName).toBe("rightKneeFlexion");
    expect(marker?.x).toBeCloseTo(0.6);
    expect(marker?.interpretation).toBe("2d-angle");
  });

  it("labels frontal knee measurement as a projection proxy", () => {
    const marker = getPrimaryMeasurementMarker(frameWith(), "squat-front");
    expect(marker?.label).toBe("Knee tracking proxy");
    expect(marker?.interpretation).toBe("2d-projection-proxy");
  });

  it("returns null when required primary landmarks are not trusted", () => {
    const marker = getPrimaryMeasurementMarker(frameWith({
      23: { trusted: false }, 24: { trusted: false }, 25: { trusted: false }, 26: { trusted: false }, 27: { trusted: false }, 28: { trusted: false },
    }), "squat-side");
    expect(marker).toBeNull();
  });
});
