import type { StageTwoAnalysisSnapshot } from "@/lib/biomechanics/stage-two-analysis";
import type { AclRiskInputs } from "@/lib/ai/acl-risk-model";

function metric(snapshot: StageTwoAnalysisSnapshot, angleName: string) {
  return snapshot.metricSummaries.find((item) => item.angleName === angleName) ?? null;
}

function absMax(minimum: number | null, maximum: number | null): number | null {
  const values = [minimum, maximum].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return values.length ? Math.max(...values.map(Math.abs)) : null;
}

function finiteMax(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

export type AclCameraFeatureBundle = {
  knee_valgus_motion_proxy_deg: number | null;
  knee_flexion_rom_deg: number | null;
  peak_trunk_lean_deg: number | null;
  peak_pelvic_obliquity_deg: number | null;
  bilateral_knee_flexion_asymmetry_deg: number | null;
  mean_pose_confidence: number | null;
  measurement_frame_fraction: number | null;
};

export const EMPTY_ACL_CAMERA_FEATURES: AclCameraFeatureBundle = {
  knee_valgus_motion_proxy_deg: null,
  knee_flexion_rom_deg: null,
  peak_trunk_lean_deg: null,
  peak_pelvic_obliquity_deg: null,
  bilateral_knee_flexion_asymmetry_deg: null,
  mean_pose_confidence: null,
  measurement_frame_fraction: null,
};

export function extractAclCameraFeatures(
  snapshot: StageTwoAnalysisSnapshot,
): AclCameraFeatureBundle {
  const leftKneeFlexion = metric(snapshot, "leftKneeFlexion");
  const rightKneeFlexion = metric(snapshot, "rightKneeFlexion");
  const leftFrontal = metric(snapshot, "leftKneeFrontalDeviation");
  const rightFrontal = metric(snapshot, "rightKneeFrontalDeviation");
  const trunk = metric(snapshot, "trunkLean");
  const pelvis = metric(snapshot, "pelvicLineObliquity");

  const leftMean = leftKneeFlexion?.meanDeg ?? null;
  const rightMean = rightKneeFlexion?.meanDeg ?? null;
  const asymmetry =
    leftMean !== null && rightMean !== null ? Math.abs(leftMean - rightMean) : null;

  const confidenceValues = snapshot.metricSummaries
    .map((item) => item.meanConfidence)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return {
    knee_valgus_motion_proxy_deg: finiteMax([
      absMax(leftFrontal?.sessionMinDeg ?? null, leftFrontal?.sessionMaxDeg ?? null),
      absMax(rightFrontal?.sessionMinDeg ?? null, rightFrontal?.sessionMaxDeg ?? null),
    ]),
    knee_flexion_rom_deg: finiteMax([
      leftKneeFlexion?.sessionRangeDeg ?? null,
      rightKneeFlexion?.sessionRangeDeg ?? null,
    ]),
    peak_trunk_lean_deg: absMax(
      trunk?.sessionMinDeg ?? null,
      trunk?.sessionMaxDeg ?? null,
    ),
    peak_pelvic_obliquity_deg: absMax(
      pelvis?.sessionMinDeg ?? null,
      pelvis?.sessionMaxDeg ?? null,
    ),
    bilateral_knee_flexion_asymmetry_deg: asymmetry,
    mean_pose_confidence: confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null,
    measurement_frame_fraction: snapshot.measurementFrameFraction,
  };
}

export function mergeAclCameraFeatures(
  current: AclCameraFeatureBundle,
  next: AclCameraFeatureBundle,
): AclCameraFeatureBundle {
  const result = { ...current };
  (Object.keys(result) as Array<keyof AclCameraFeatureBundle>).forEach((key) => {
    const value = next[key];
    if (value !== null && Number.isFinite(value)) result[key] = value;
  });
  return result;
}

export function aclCameraFeaturesToRiskInputs(
  features: AclCameraFeatureBundle,
): AclRiskInputs {
  return {
    knee_valgus_motion_proxy_deg: features.knee_valgus_motion_proxy_deg ?? undefined,
    knee_flexion_rom_deg: features.knee_flexion_rom_deg ?? undefined,
    peak_trunk_lean_deg: features.peak_trunk_lean_deg ?? undefined,
    peak_pelvic_obliquity_deg: features.peak_pelvic_obliquity_deg ?? undefined,
    bilateral_knee_flexion_asymmetry_deg:
      features.bilateral_knee_flexion_asymmetry_deg ?? undefined,
  };
}
