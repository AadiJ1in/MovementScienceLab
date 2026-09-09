import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";

export type RepSegmentationConfig = {
  angleName: AngleName;
  startDeltaDegrees: number;
  reversalDeltaDegrees: number;
  returnToleranceDegrees: number;
  minExcursionDegrees: number;
  baselineSmoothing: number;
};

export type RepSummary = {
  repIndex: number;
  startedMs: number;
  endedMs: number;
  peakValue: number;
  excursionDegrees: number;
};

type Phase = "waiting" | "outbound" | "returning";

export const DEFAULT_KNEE_REP_CONFIG: RepSegmentationConfig = {
  angleName: "leftKneeFlexion",
  startDeltaDegrees: 8,
  reversalDeltaDegrees: 4,
  returnToleranceDegrees: 6,
  minExcursionDegrees: 15,
  baselineSmoothing: 0.08,
};

/**
 * Stateful rep-cycle detector for an angle signal that rises away from a resting
 * baseline and then returns. The degree deltas here are engineering hysteresis
 * parameters for signal segmentation, not clinical ROM targets or risk cutoffs.
 */
export class RepSegmenter {
  private phase: Phase = "waiting";
  private baseline: number | null = null;
  private peak = -Infinity;
  private startedMs: number | null = null;
  private nextRepIndex = 1;

  constructor(private readonly config: RepSegmentationConfig) {}

  get activeRepIndex(): number | null {
    return this.phase === "waiting" ? null : this.nextRepIndex;
  }

  reset() {
    this.phase = "waiting";
    this.baseline = null;
    this.peak = -Infinity;
    this.startedMs = null;
    this.nextRepIndex = 1;
  }

  ingest(reading: AngleReading): RepSummary | null {
    if (reading.angleName !== this.config.angleName) return null;

    const value = reading.value;
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
      }
      return null;
    }

    if (this.phase === "outbound") {
      this.peak = Math.max(this.peak, value);
      if (this.peak - value >= this.config.reversalDeltaDegrees) {
        this.phase = "returning";
      }
      return null;
    }

    this.peak = Math.max(this.peak, value);
    const excursion = this.peak - this.baseline;
    if (
      value <= this.baseline + this.config.returnToleranceDegrees &&
      excursion >= this.config.minExcursionDegrees &&
      this.startedMs !== null
    ) {
      const summary: RepSummary = {
        repIndex: this.nextRepIndex,
        startedMs: this.startedMs,
        endedMs: reading.frameTimestamp,
        peakValue: this.peak,
        excursionDegrees: excursion,
      };

      this.nextRepIndex += 1;
      this.phase = "waiting";
      this.baseline = value;
      this.peak = -Infinity;
      this.startedMs = null;
      return summary;
    }

    return null;
  }
}
