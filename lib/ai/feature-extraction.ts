import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import type { RepSummary } from "@/lib/biomechanics/rep-segmentation";
import type { MovementQualityFeatures } from "./movement-quality-model";

function valuesFor(
  readings: AngleReading[],
  angleName: AngleName,
  startedMs: number,
  endedMs: number,
): AngleReading[] {
  return readings.filter(
    (reading) =>
      reading.angleName === angleName &&
      reading.frameTimestamp >= startedMs &&
      reading.frameTimestamp <= endedMs &&
      Number.isFinite(reading.value) &&
      Number.isFinite(reading.confidence),
  );
}

function minValue(readings: AngleReading[]): number | null {
  return readings.length ? Math.min(...readings.map((reading) => reading.value)) : null;
}

function maxValue(readings: AngleReading[]): number | null {
  return readings.length ? Math.max(...readings.map((reading) => reading.value)) : null;
}

function maxAbsValue(readings: AngleReading[]): number | null {
  return readings.length
    ? Math.max(...readings.map((reading) => Math.abs(reading.value)))
    : null;
}

function range(min: number | null, max: number | null): number | null {
  return min === null || max === null ? null : max - min;
}

function absoluteDifference(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.abs(a - b);
}

/**
 * Converts one completed rep into the exact rep-level feature contract used by
 * the movement-quality model. Missing projection-specific measurements remain
 * null and are handled by the model artifact's training-set imputation values.
 *
 * This extractor does not invent clinical cutoffs. It only summarizes measured
 * kinematics in the completed rep window.
 */
export function extractMovementQualityFeatures(
  readings: AngleReading[],
  rep: RepSummary,
): MovementQualityFeatures {
  const inWindow = readings.filter(
    (reading) =>
      reading.frameTimestamp >= rep.startedMs &&
      reading.frameTimestamp <= rep.endedMs,
  );

  const leftKnee = valuesFor(readings, "leftKneeFlexion", rep.startedMs, rep.endedMs);
  const rightKnee = valuesFor(readings, "rightKneeFlexion", rep.startedMs, rep.endedMs);
  const leftFrontal = valuesFor(
    readings,
    "leftKneeFrontalDeviation",
    rep.startedMs,
    rep.endedMs,
  );
  const rightFrontal = valuesFor(
    readings,
    "rightKneeFrontalDeviation",
    rep.startedMs,
    rep.endedMs,
  );
  const trunk = valuesFor(readings, "trunkLean", rep.startedMs, rep.endedMs);
  const pelvis = valuesFor(
    readings,
    "pelvicLineObliquity",
    rep.startedMs,
    rep.endedMs,
  );
  const leftShoulder = valuesFor(
    readings,
    "leftShoulderElevation",
    rep.startedMs,
    rep.endedMs,
  );
  const rightShoulder = valuesFor(
    readings,
    "rightShoulderElevation",
    rep.startedMs,
    rep.endedMs,
  );

  const leftKneeMin = minValue(leftKnee);
  const leftKneeMax = maxValue(leftKnee);
  const rightKneeMin = minValue(rightKnee);
  const rightKneeMax = maxValue(rightKnee);
  const leftKneeRange = range(leftKneeMin, leftKneeMax);
  const rightKneeRange = range(rightKneeMin, rightKneeMax);
  const leftShoulderPeak = maxAbsValue(leftShoulder);
  const rightShoulderPeak = maxAbsValue(rightShoulder);

  const confidences = inWindow
    .map((reading) => reading.confidence)
    .filter((confidence) => Number.isFinite(confidence));

  return {
    left_knee_flexion_min: leftKneeMin,
    left_knee_flexion_max: leftKneeMax,
    left_knee_flexion_range: leftKneeRange,
    right_knee_flexion_min: rightKneeMin,
    right_knee_flexion_max: rightKneeMax,
    right_knee_flexion_range: rightKneeRange,
    peak_abs_left_knee_frontal_deviation: maxAbsValue(leftFrontal),
    peak_abs_right_knee_frontal_deviation: maxAbsValue(rightFrontal),
    peak_trunk_lean: maxAbsValue(trunk),
    peak_abs_pelvic_line_obliquity: maxAbsValue(pelvis),
    left_shoulder_elevation_peak: leftShoulderPeak,
    right_shoulder_elevation_peak: rightShoulderPeak,
    knee_flexion_asymmetry: absoluteDifference(leftKneeRange, rightKneeRange),
    shoulder_elevation_asymmetry: absoluteDifference(leftShoulderPeak, rightShoulderPeak),
    rep_duration_ms: Math.max(0, rep.endedMs - rep.startedMs),
    mean_pose_confidence: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null,
    min_pose_confidence: confidences.length ? Math.min(...confidences) : null,
  };
}
