import type { StageTwoAnalysisSnapshot } from "@/lib/biomechanics/stage-two-analysis";

export type AclVideoFeatureSnapshot = {
  dynamicKneeValgusProxyDeg: number | null;
  trunkLeanProxyDeg: number | null;
  kneeFlexionPeakDeg: number | null;
  kneeFlexionMinimumDeg: number | null;
  interlimbKneeFlexionAsymmetryDeg: number | null;
  repVariabilityDeg: number | null;
  measurementFrameFraction: number;
  meanMeasurementConfidence: number | null;
  measurementCompatibility: "2d-proxy-research-only";
};

function summary(snapshot: StageTwoAnalysisSnapshot, name: string) {
  return snapshot.metricSummaries.find((item) => item.angleName === name) ?? null;
}

function maxAbs(values: Array<number | null | undefined>): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return finite.length ? Math.max(...finite.map(Math.abs)) : null;
}

function mean(values: Array<number | null | undefined>): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return finite.length
    ? finite.reduce((total, value) => total + value, 0) / finite.length
    : null;
}

function sd(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      values.length,
  );
}

/**
 * ACL-specific camera feature adapter.
 *
 * These are 2D MediaPipe projection measurements. They are candidates for a
 * prospective ACL model and mechanism-oriented screening; they are not assumed
 * equivalent to the 3D/force-plate variables in published ACL cohorts.
 */
export function extractAclVideoFeatures(
  snapshot: StageTwoAnalysisSnapshot,
): AclVideoFeatureSnapshot {
  const leftFrontal = summary(snapshot, "leftKneeFrontalDeviation");
  const rightFrontal = summary(snapshot, "rightKneeFrontalDeviation");
  const trunk = summary(snapshot, "trunkLean");
  const leftKnee = summary(snapshot, "leftKneeFlexion");
  const rightKnee = summary(snapshot, "rightKneeFlexion");

  const leftMean = leftKnee?.meanDeg ?? null;
  const rightMean = rightKnee?.meanDeg ?? null;
  const asymmetry =
    leftMean !== null && rightMean !== null
      ? Math.abs(leftMean - rightMean)
      : null;

  return {
    dynamicKneeValgusProxyDeg: maxAbs([
      leftFrontal?.sessionMinDeg,
      leftFrontal?.sessionMaxDeg,
      rightFrontal?.sessionMinDeg,
      rightFrontal?.sessionMaxDeg,
    ]),
    trunkLeanProxyDeg: maxAbs([
      trunk?.sessionMinDeg,
      trunk?.sessionMaxDeg,
    ]),
    kneeFlexionPeakDeg: maxAbs([
      leftKnee?.sessionMaxDeg,
      rightKnee?.sessionMaxDeg,
    ]),
    kneeFlexionMinimumDeg:
      mean([leftKnee?.sessionMinDeg, rightKnee?.sessionMinDeg]),
    interlimbKneeFlexionAsymmetryDeg: asymmetry,
    repVariabilityDeg: sd(
      snapshot.completedReps
        .map((rep) => rep.excursionDegrees)
        .filter((value) => Number.isFinite(value)),
    ),
    measurementFrameFraction: snapshot.measurementFrameFraction,
    meanMeasurementConfidence: mean(
      snapshot.metricSummaries.map((item) => item.meanConfidence),
    ),
    measurementCompatibility: "2d-proxy-research-only",
  };
}
