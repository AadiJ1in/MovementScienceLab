export type OneEuroFilterConfig = {
  minCutoffHz: number;
  beta: number;
  derivativeCutoffHz: number;
  resetGapMs: number;
};

export const DEFAULT_MOVEMENT_FILTER_CONFIG: OneEuroFilterConfig = {
  minCutoffHz: 1.2,
  beta: 0.035,
  derivativeCutoffHz: 1.0,
  resetGapMs: 750,
};

function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0) return 1;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 1;
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

function lowPass(previous: number, current: number, alpha: number): number {
  return previous + alpha * (current - previous);
}

/**
 * Real-time scalar One Euro filter.
 *
 * It applies stronger low-pass smoothing when movement is slow and increases
 * the cutoff as the signal derivative grows. This reduces stationary pose
 * jitter without adding as much lag during faster movement as a fixed moving
 * average would.
 *
 * All parameters are signal-processing settings. They are not clinical ROM,
 * injury-risk, or treatment thresholds.
 */
export class OneEuroFilter {
  private lastTimestampMs: number | null = null;
  private lastRawValue: number | null = null;
  private filteredValue: number | null = null;
  private filteredDerivative = 0;

  constructor(private readonly config: OneEuroFilterConfig = DEFAULT_MOVEMENT_FILTER_CONFIG) {}

  reset() {
    this.lastTimestampMs = null;
    this.lastRawValue = null;
    this.filteredValue = null;
    this.filteredDerivative = 0;
  }

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) return value;

    if (
      this.lastTimestampMs === null ||
      this.lastRawValue === null ||
      this.filteredValue === null ||
      timestampMs <= this.lastTimestampMs ||
      timestampMs - this.lastTimestampMs > this.config.resetGapMs
    ) {
      this.lastTimestampMs = timestampMs;
      this.lastRawValue = value;
      this.filteredValue = value;
      this.filteredDerivative = 0;
      return value;
    }

    const dtSeconds = (timestampMs - this.lastTimestampMs) / 1000;
    const derivative = (value - this.lastRawValue) / dtSeconds;
    const derivativeAlpha = smoothingFactor(this.config.derivativeCutoffHz, dtSeconds);
    this.filteredDerivative = lowPass(
      this.filteredDerivative,
      derivative,
      derivativeAlpha,
    );

    const adaptiveCutoff =
      this.config.minCutoffHz + this.config.beta * Math.abs(this.filteredDerivative);
    const signalAlpha = smoothingFactor(adaptiveCutoff, dtSeconds);
    this.filteredValue = lowPass(this.filteredValue, value, signalAlpha);

    this.lastTimestampMs = timestampMs;
    this.lastRawValue = value;
    return this.filteredValue;
  }
}
