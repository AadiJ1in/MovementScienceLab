import type { AngleName, AngleReading } from "./angles";

export type RepSegmentationConfig = {
  angleName: AngleName;
  startDeltaDegrees: number;
  reversalDeltaDegrees: number;
  returnToleranceDegrees: number;
  minExcursionDegrees: number;
  baselineSmoothing: number;
  signalSmoothing?: number;
  minConfidence?: number;
  minRepDurationMs?: number;
  maxRepDurationMs?: number;
  maxTrackingGapMs?: number;
};

export type RepSummary = {
  repIndex: number;
  startedMs: number;
  endedMs: number;
  peakValue: number;
  excursionDegrees: number;
  durationMs: number;
  meanConfidence: number;
};

type Phase = "waiting" | "outbound" | "returning";

export const DEFAULT_KNEE_REP_CONFIG: RepSegmentationConfig = {
  angleName: "leftKneeFlexion",
  startDeltaDegrees: 8,
  reversalDeltaDegrees: 4,
  returnToleranceDegrees: 6,
  minExcursionDegrees: 15,
  baselineSmoothing: 0.08,
  signalSmoothing: 0.28,
  minConfidence: 0.7,
  minRepDurationMs: 450,
  maxRepDurationMs: 8000,
  maxTrackingGapMs: 750,
};

/**
 * Stateful exercise-cycle detector for an angle signal that rises away from a
 * resting baseline and returns. All degree/time parameters are engineering
 * segmentation parameters, not clinical ROM targets or injury thresholds.
 *
 * Confidence gating, smoothing, hysteresis, duration checks, and tracking-gap
 * resets reduce jitter counts, half-rep counts, and counts after landmarks disappear.
 */
export class RepSegmenter {
  private phase: Phase = "waiting";
  private baseline: number | null = null;
  private peak = -Infinity;
  private startedMs: number | null = null;
  private nextRepIndex = 1;
  private smoothedValue: number | null = null;
  private lastAcceptedMs: number | null = null;
  private confidenceSum = 0;
  private confidenceSamples = 0;

  constructor(private readonly config: RepSegmentationConfig) {}

  get activeRepIndex(): number | null {
    return this.phase === "waiting" ? null : this.nextRepIndex;
  }

  get signalAngleName(): AngleName {
    return this.config.angleName;
  }

  reset() {
    this.phase = "waiting";
    this.baseline = null;
    this.peak = -Infinity;
    this.startedMs = null;
    this.nextRepIndex = 1;
    this.smoothedValue = null;
    this.lastAcceptedMs = null;
    this.confidenceSum = 0;
    this.confidenceSamples = 0;
  }

  ingest(reading: AngleReading): RepSummary | null {
    if (reading.angleName !== this.config.angleName) return null;

    const minConfidence = this.config.minConfidence ?? 0;
    if (reading.confidence < minConfidence) {
      this.resetActiveIfTrackingGapExceeded(reading.frameTimestamp);
      return null;
    }

    if (
      this.phase !== "waiting" &&
      this.lastAcceptedMs !== null &&
      this.config.maxTrackingGapMs !== undefined &&
      reading.frameTimestamp - this.lastAcceptedMs > this.config.maxTrackingGapMs
    ) {
      this.resetActiveCycle(reading.value);
    }

    this.lastAcceptedMs = reading.frameTimestamp;
    const alpha = this.config.signalSmoothing ?? 1;
    this.smoothedValue =
      this.smoothedValue === null
        ? reading.value
        : this.smoothedValue * (1 - alpha) + reading.value * alpha;
    const value = this.smoothedValue;

    if (this.baseline === null) {
      this.baseline = value;
      return null;
    }

    if (this.phase === "waiting") {
      this.baseline =
        this.baseline * (1 - this.config.baselineSmoothing) +
        value * this.config.baselineSmoothing;

      if (value >= this.baseline + this.config.startDeltaDegrees) {
        this.phase = "outbound";
        this.startedMs = reading.frameTimestamp;
        this.peak = value;
        this.confidenceSum = reading.confidence;
        this.confidenceSamples = 1;
      }
      return null;
    }

    this.confidenceSum += reading.confidence;
    this.confidenceSamples += 1;
    this.peak = Math.max(this.peak, value);

    if (this.startedMs !== null && this.config.maxRepDurationMs !== undefined) {
      if (reading.frameTimestamp - this.startedMs > this.config.maxRepDurationMs) {
        this.resetActiveCycle(value);
        return null;
      }
    }

    if (this.phase === "outbound") {
      if (this.peak - value >= this.config.reversalDeltaDegrees) {
        this.phase = "returning";
      }
      return null;
    }

    const excursion = this.peak - this.baseline;
    const durationMs = this.startedMs === null ? 0 : reading.frameTimestamp - this.startedMs;
    const returned = value <= this.baseline + this.config.returnToleranceDegrees;
    const longEnough = durationMs >= (this.config.minRepDurationMs ?? 0);

    if (returned && excursion >= this.config.minExcursionDegrees && this.startedMs !== null) {
      if (!longEnough) {
        this.resetActiveCycle(value);
        return null;
      }

      const summary: RepSummary = {
        repIndex: this.nextRepIndex,
        startedMs: this.startedMs,
        endedMs: reading.frameTimestamp,
        peakValue: this.peak,
        excursionDegrees: excursion,
        durationMs,
        meanConfidence: this.confidenceSamples
          ? this.confidenceSum / this.confidenceSamples
          : reading.confidence,
      };

      this.nextRepIndex += 1;
      this.resetActiveCycle(value);
      return summary;
    }

    return null;
  }

  private resetActiveIfTrackingGapExceeded(timestamp: number) {
    if (
      this.phase !== "waiting" &&
      this.lastAcceptedMs !== null &&
      this.config.maxTrackingGapMs !== undefined &&
      timestamp - this.lastAcceptedMs > this.config.maxTrackingGapMs
    ) {
      this.resetActiveCycle(null);
    }
  }

  private resetActiveCycle(nextBaseline: number | null) {
    this.phase = "waiting";
    this.baseline = nextBaseline;
    this.peak = -Infinity;
    this.startedMs = null;
    this.confidenceSum = 0;
    this.confidenceSamples = 0;
    if (nextBaseline !== null) this.smoothedValue = nextBaseline;
  }
}
