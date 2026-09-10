import { describe, expect, it } from "vitest";
import type { AngleReading } from "@/lib/biomechanics/angles";
import { extractMovementQualityFeatures } from "./feature-extraction";

function reading(
  frameTimestamp: number,
  angleName: AngleReading["angleName"],
  value: number,
  confidence = 0.9,
): AngleReading {
  return { frameTimestamp, angleName, value, confidence };
}

describe("extractMovementQualityFeatures", () => {
  it("extracts ranges, asymmetry, peaks, duration, and confidence from one rep", () => {
    const readings: AngleReading[] = [
      reading(100, "leftKneeFlexion", 10, 0.8),
      reading(200, "leftKneeFlexion", 80, 0.9),
      reading(300, "leftKneeFlexion", 15, 0.85),
      reading(100, "rightKneeFlexion", 12, 0.8),
      reading(200, "rightKneeFlexion", 72, 0.9),
      reading(300, "rightKneeFlexion", 16, 0.85),
      reading(200, "trunkLean", -18, 0.95),
      reading(200, "leftShoulderElevation", 9, 0.9),
      reading(200, "rightShoulderElevation", -5, 0.9),
      // Outside the rep window and therefore ignored.
      reading(999, "leftKneeFlexion", 150, 0.1),
    ];

    const features = extractMovementQualityFeatures(readings, {
      repIndex: 1,
      startedMs: 100,
      endedMs: 300,
      peakValue: 80,
      excursionDegrees: 70,
    });

    expect(features.left_knee_flexion_min).toBe(10);
    expect(features.left_knee_flexion_max).toBe(80);
    expect(features.left_knee_flexion_range).toBe(70);
    expect(features.right_knee_flexion_range).toBe(60);
    expect(features.knee_flexion_asymmetry).toBe(10);
    expect(features.peak_trunk_lean).toBe(18);
    expect(features.left_shoulder_elevation_peak).toBe(9);
    expect(features.right_shoulder_elevation_peak).toBe(5);
    expect(features.shoulder_elevation_asymmetry).toBe(4);
    expect(features.rep_duration_ms).toBe(200);
    expect(features.mean_pose_confidence).not.toBeNull();
    expect(features.min_pose_confidence).toBe(0.8);
    expect(features.peak_abs_left_knee_frontal_deviation).toBeNull();
  });

  it("leaves measurements null when that projection was not observed", () => {
    const features = extractMovementQualityFeatures(
      [reading(10, "trunkLean", 5)],
      {
        repIndex: 1,
        startedMs: 0,
        endedMs: 20,
        peakValue: 0,
        excursionDegrees: 0,
      },
    );

    expect(features.left_knee_flexion_range).toBeNull();
    expect(features.knee_flexion_asymmetry).toBeNull();
    expect(features.peak_abs_pelvic_line_obliquity).toBeNull();
    expect(features.peak_trunk_lean).toBe(5);
  });
});
