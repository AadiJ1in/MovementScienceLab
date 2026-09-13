export type SingleLegMeasurementPhase = "down" | "hold" | "up";

export type SingleLegRepSamples = {
  kneeByPhase: Record<SingleLegMeasurementPhase, number[]>;
  trunkLean: number[];
  kneeConfidence: number[];
};

export type SingleLegRepSummary = {
  stableHoldKneeDeg: number | null;
  robustPeakKneeDeg: number | null;
  robustPeakTrunkLeanDeg: number | null;
  meanKneeConfidence: number | null;
  activeSampleCount: number;
  holdSampleCount: number;
  valid: boolean;
  exclusionReason: "too-few-active-samples" | "too-few-hold-samples" | "low-confidence" | null;
};

export type SingleLegSideSummary = {
  stableHoldKneeDeg: number | null;
  robustPeakKneeDeg: number | null;
  robustPeakTrunkLeanDeg: number | null;
  repVariabilityDeg: number | null;
  meanKneeConfidence: number | null;
  validRepCount: number;
  totalRepCount: number;
  dataQuality: "high" | "moderate" | "low";
  reps: SingleLegRepSummary[];
};

const MIN_ACTIVE_SAMPLES = 8;
const MIN_HOLD_SAMPLES = 2;
const MIN_MEAN_CONFIDENCE = 0.7;

function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function mean(values: readonly number[]): number | null {
  const clean = finite(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values: readonly number[]): number | null {
  const clean = finite(values).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function percentile(values: readonly number[], p: number): number | null {
  const clean = finite(values).sort((a, b) => a - b);
  if (!clean.length) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil(clamped * clean.length) - 1));
  return clean[index];
}

function sampleStdDev(values: readonly number[]): number | null {
  const clean = finite(values);
  if (clean.length < 2) return null;
  const average = mean(clean);
  if (average === null) return null;
  const variance = clean.reduce((sum, value) => sum + (value - average) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

export function emptySingleLegRepSamples(): SingleLegRepSamples {
  return {
    kneeByPhase: { down: [], hold: [], up: [] },
    trunkLean: [],
    kneeConfidence: [],
  };
}

/**
 * Summarizes one standardized single-leg squat repetition.
 *
 * The hold median is intentionally separate from the movement peak so a single
 * noisy frame cannot masquerade as the primary measurement. The movement peak
 * uses the 90th percentile of absolute values rather than a raw maximum.
 */
export function summarizeSingleLegRep(samples: SingleLegRepSamples): SingleLegRepSummary {
  const down = finite(samples.kneeByPhase.down);
  const hold = finite(samples.kneeByPhase.hold);
  const up = finite(samples.kneeByPhase.up);
  const active = [...down, ...hold, ...up];
  const confidence = finite(samples.kneeConfidence);
  const meanConfidence = mean(confidence);

  let exclusionReason: SingleLegRepSummary["exclusionReason"] = null;
  if (active.length < MIN_ACTIVE_SAMPLES) exclusionReason = "too-few-active-samples";
  else if (hold.length < MIN_HOLD_SAMPLES) exclusionReason = "too-few-hold-samples";
  else if ((meanConfidence ?? 0) < MIN_MEAN_CONFIDENCE) exclusionReason = "low-confidence";

  return {
    stableHoldKneeDeg: median(hold.map(Math.abs)),
    robustPeakKneeDeg: percentile(active.map(Math.abs), 0.9),
    robustPeakTrunkLeanDeg: percentile(finite(samples.trunkLean).map(Math.abs), 0.9),
    meanKneeConfidence: meanConfidence,
    activeSampleCount: active.length,
    holdSampleCount: hold.length,
    valid: exclusionReason === null,
    exclusionReason,
  };
}

export function summarizeSingleLegSide(reps: readonly SingleLegRepSamples[]): SingleLegSideSummary {
  const repSummaries = reps.map(summarizeSingleLegRep);
  const validReps = repSummaries.filter((rep) => rep.valid);
  const stable = validReps
    .map((rep) => rep.stableHoldKneeDeg)
    .filter((value): value is number => value !== null);
  const peaks = validReps
    .map((rep) => rep.robustPeakKneeDeg)
    .filter((value): value is number => value !== null);
  const trunk = validReps
    .map((rep) => rep.robustPeakTrunkLeanDeg)
    .filter((value): value is number => value !== null);
  const confidence = validReps
    .map((rep) => rep.meanKneeConfidence)
    .filter((value): value is number => value !== null);
  const meanConfidence = mean(confidence);

  const dataQuality: SingleLegSideSummary["dataQuality"] =
    validReps.length === reps.length && reps.length >= 3 && (meanConfidence ?? 0) >= 0.85
      ? "high"
      : validReps.length >= 2 && (meanConfidence ?? 0) >= 0.75
        ? "moderate"
        : "low";

  return {
    stableHoldKneeDeg: median(stable),
    robustPeakKneeDeg: median(peaks),
    robustPeakTrunkLeanDeg: median(trunk),
    repVariabilityDeg: sampleStdDev(stable),
    meanKneeConfidence: meanConfidence,
    validRepCount: validReps.length,
    totalRepCount: reps.length,
    dataQuality,
    reps: repSummaries,
  };
}
