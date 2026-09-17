import type { StageTwoAnalysisSnapshot } from "@/lib/biomechanics/stage-two-analysis";

export type MediaPipeRiskFeatures = {
  camera_knee_flexion_asymmetry_deg: number | null;
  camera_peak_knee_frontal_deviation_deg: number | null;
  camera_peak_trunk_lean_deg: number | null;
  camera_peak_pelvic_obliquity_deg: number | null;
  camera_rep_excursion_variability_deg: number | null;
  camera_rep_duration_cv_pct: number | null;
  mean_pose_confidence: number | null;
  camera_measurement_frame_fraction: number | null;
};

function metric(
  snapshot: StageTwoAnalysisSnapshot,
  angleName: string,
) {
  return snapshot.metricSummaries.find((item) => item.angleName === angleName) ?? null;
}

function maxAbs(min: number | null, max: number | null): number | null {
  const values = [min, max].filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length ? Math.max(...values.map(Math.abs)) : null;
}

function meanFinite(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function extractMediaPipeRiskFeatures(
  snapshot: StageTwoAnalysisSnapshot,
): MediaPipeRiskFeatures {
  const leftKnee = metric(snapshot, "leftKneeFlexion");
  const rightKnee = metric(snapshot, "rightKneeFlexion");
  const leftFrontal = metric(snapshot, "leftKneeFrontalDeviation");
  const rightFrontal = metric(snapshot, "rightKneeFrontalDeviation");
  const trunk = metric(snapshot, "trunkLean");
  const pelvis = metric(snapshot, "pelvicLineObliquity");

  const kneeFlexionAsymmetry =
    leftKnee?.meanDeg !== null &&
    leftKnee?.meanDeg !== undefined &&
    rightKnee?.meanDeg !== null &&
    rightKnee?.meanDeg !== undefined
      ? Math.abs(leftKnee.meanDeg - rightKnee.meanDeg)
      : null;

  const frontalCandidates = [
    maxAbs(leftFrontal?.sessionMinDeg ?? null, leftFrontal?.sessionMaxDeg ?? null),
    maxAbs(rightFrontal?.sessionMinDeg ?? null, rightFrontal?.sessionMaxDeg ?? null),
  ].filter((value): value is number => value !== null);

  const repExcursions = snapshot.completedReps
    .map((rep) => rep.excursionDegrees)
    .filter((value) => Number.isFinite(value));

  return {
    camera_knee_flexion_asymmetry_deg: kneeFlexionAsymmetry,
    camera_peak_knee_frontal_deviation_deg:
      frontalCandidates.length ? Math.max(...frontalCandidates) : null,
    camera_peak_trunk_lean_deg: maxAbs(
      trunk?.sessionMinDeg ?? null,
      trunk?.sessionMaxDeg ?? null,
    ),
    camera_peak_pelvic_obliquity_deg: maxAbs(
      pelvis?.sessionMinDeg ?? null,
      pelvis?.sessionMaxDeg ?? null,
    ),
    camera_rep_excursion_variability_deg: standardDeviation(repExcursions),
    camera_rep_duration_cv_pct:
      snapshot.consistency.durationCoefficientOfVariationPct,
    mean_pose_confidence: meanFinite(
      snapshot.metricSummaries.map((item) => item.meanConfidence),
    ),
    camera_measurement_frame_fraction: snapshot.measurementFrameFraction,
  };
}

export function mergeMediaPipeRiskFeatures(
  current: MediaPipeRiskFeatures,
  next: MediaPipeRiskFeatures,
): MediaPipeRiskFeatures {
  const merged = { ...current };
  (Object.keys(merged) as Array<keyof MediaPipeRiskFeatures>).forEach((key) => {
    if (next[key] !== null && Number.isFinite(next[key])) merged[key] = next[key];
  });
  return merged;
}

export const EMPTY_MEDIAPIPE_RISK_FEATURES: MediaPipeRiskFeatures = {
  camera_knee_flexion_asymmetry_deg: null,
  camera_peak_knee_frontal_deviation_deg: null,
  camera_peak_trunk_lean_deg: null,
  camera_peak_pelvic_obliquity_deg: null,
  camera_rep_excursion_variability_deg: null,
  camera_rep_duration_cv_pct: null,
  mean_pose_confidence: null,
  camera_measurement_frame_fraction: null,
};
