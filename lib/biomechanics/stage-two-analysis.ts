import {
  computeAnglesForFrame,
  trunkLeanFromBestVisibleSide,
  type AngleName,
  type AngleReading,
} from "./angles";
import {
  DEFAULT_MOVEMENT_FILTER_CONFIG,
  OneEuroFilter,
  type OneEuroFilterConfig,
} from "./filters";
import { aggregateReps, type AngleAggregate } from "./session-aggregation";
import { RepSegmenter, type RepSummary } from "./rep-segmentation";
import { getExerciseDefinition } from "../exercises/registry";
import type { PoseStreamFrame } from "../pose/stream";
import type { MovementType, PoseFrame } from "../pose/types";

const SIGNAL_SELECTION_FRAMES = 12;
const MAX_READING_HISTORY = 30000;

export const ANGLE_LABELS: Record<AngleName, string> = {
  leftKneeFlexion: "Left knee flexion",
  rightKneeFlexion: "Right knee flexion",
  leftKneeFrontalDeviation: "Left knee line deviation",
  rightKneeFrontalDeviation: "Right knee line deviation",
  trunkLean: "Trunk lean",
  pelvicLineObliquity: "Pelvic-line tilt",
  leftShoulderElevation: "Left shoulder elevation",
  rightShoulderElevation: "Right shoulder elevation",
  leftElbowFlexion: "Left elbow flexion",
  rightElbowFlexion: "Right elbow flexion",
};

export type StageTwoMetricReading = {
  angleName: AngleName;
  label: string;
  rawValueDeg: number;
  filteredValueDeg: number;
  confidence: number;
  timestampMs: number;
};

export type StageTwoMetricSummary = {
  angleName: AngleName;
  label: string;
  currentDeg: number | null;
  rawCurrentDeg: number | null;
  sessionMinDeg: number | null;
  sessionMaxDeg: number | null;
  sessionRangeDeg: number | null;
  meanDeg: number | null;
  meanConfidence: number | null;
  samples: number;
};

export type StageTwoRepSummary = RepSummary & {
  signalAngleName: AngleName;
  signalLabel: string;
  peakTimestampMs: number;
  outboundDurationMs: number;
  returnDurationMs: number;
  cadenceRpm: number;
  angleSummary: Partial<Record<AngleName, AngleAggregate>>;
};

export type StageTwoConsistencySummary = {
  repCount: number;
  meanRepDurationMs: number | null;
  meanCadenceRpm: number | null;
  durationCoefficientOfVariationPct: number | null;
  excursionCoefficientOfVariationPct: number | null;
};

export type StageTwoAnalysisSnapshot = {
  schemaVersion: "2.0.0";
  movement: MovementType;
  movementLabel: string;
  processedFrames: number;
  framesWithMeasurements: number;
  measurementFrameFraction: number;
  selectedSignalAngle: AngleName | null;
  selectedSide: "left" | "right" | null;
  latestMetrics: StageTwoMetricReading[];
  metricSummaries: StageTwoMetricSummary[];
  completedReps: StageTwoRepSummary[];
  consistency: StageTwoConsistencySummary;
  latestCompletedRep: StageTwoRepSummary | null;
  filter: {
    type: "one-euro";
    minCutoffHz: number;
    beta: number;
    derivativeCutoffHz: number;
    resetGapMs: number;
  };
  interpretationBoundary: "measurement-only-no-risk-classification";
};

type RunningAggregate = {
  min: number;
  max: number;
  sum: number;
  confidenceSum: number;
  samples: number;
};

type SignalCandidateState = {
  confidenceSum: number;
  samples: number;
};

export type StageTwoAnalyzerOptions = {
  filterConfig?: OneEuroFilterConfig;
};

/**
 * Real-time Stage 2 movement measurement engine.
 *
 * This class consumes the Stage 1 landmark stream and produces filtered 2D
 * projection measurements, engineering rep segmentation, ROM/excursion, and
 * tempo consistency. It intentionally contains no clinical thresholds, injury
 * labels, diagnostic logic, or automatic treatment changes.
 */
export class StageTwoMovementAnalyzer {
  private readonly exercise;
  private readonly filterConfig: OneEuroFilterConfig;
  private readonly filters = new Map<AngleName, OneEuroFilter>();
  private readonly aggregates = new Map<AngleName, RunningAggregate>();
  private readonly latestByMetric = new Map<AngleName, StageTwoMetricReading>();
  private readonly signalCandidates = new Map<AngleName, SignalCandidateState>();
  private readonly readings: AngleReading[] = [];
  private readonly completedReps: StageTwoRepSummary[] = [];
  private processedFrames = 0;
  private framesWithMeasurements = 0;
  private signalSelectionFrames = 0;
  private selectedSignalAngle: AngleName | null = null;
  private segmenter: RepSegmenter | null = null;

  constructor(
    private readonly movement: MovementType,
    options: StageTwoAnalyzerOptions = {},
  ) {
    this.exercise = getExerciseDefinition(movement);
    this.filterConfig = options.filterConfig ?? DEFAULT_MOVEMENT_FILTER_CONFIG;
    for (const angleName of this.exercise.availableMetrics) {
      this.filters.set(angleName, new OneEuroFilter(this.filterConfig));
    }
  }

  reset() {
    this.filters.forEach((filter) => filter.reset());
    this.aggregates.clear();
    this.latestByMetric.clear();
    this.signalCandidates.clear();
    this.readings.length = 0;
    this.completedReps.length = 0;
    this.processedFrames = 0;
    this.framesWithMeasurements = 0;
    this.signalSelectionFrames = 0;
    this.selectedSignalAngle = null;
    this.segmenter = null;
  }

  ingest(frame: PoseStreamFrame): StageTwoAnalysisSnapshot {
    this.processedFrames += 1;
    let latestCompletedRep: StageTwoRepSummary | null = null;

    const poseFrame = poseStreamToPoseFrame(frame);
    if (poseFrame) {
      const readings = this.measureFrame(poseFrame);
      if (readings.length > 0) {
        this.framesWithMeasurements += 1;
        const filtered = readings.map((reading) => this.filterReading(reading));
        for (const reading of filtered) this.recordReading(reading);

        this.updateSignalSelection(filtered);
        const signal = this.selectedSignalAngle
          ? filtered.find((reading) => reading.angleName === this.selectedSignalAngle)
          : undefined;
        if (signal && this.segmenter) {
          const rep = this.segmenter.ingest({
            frameTimestamp: signal.timestampMs,
            angleName: signal.angleName,
            value: signal.filteredValueDeg,
            confidence: signal.confidence,
          });
          if (rep) {
            latestCompletedRep = this.completeRep(rep);
            this.completedReps.push(latestCompletedRep);
          }
        }
      }
    }

    return this.snapshot(latestCompletedRep);
  }

  private measureFrame(frame: PoseFrame): AngleReading[] {
    let readings = computeAnglesForFrame(frame).filter((reading) =>
      this.exercise.availableMetrics.includes(reading.angleName),
    );

    if (this.exercise.view === "side" && this.exercise.availableMetrics.includes("trunkLean")) {
      const sideTrunk = trunkLeanFromBestVisibleSide(frame);
      if (sideTrunk) {
        readings = readings.filter((reading) => reading.angleName !== "trunkLean");
        readings.push(sideTrunk);
      }
    }

    return readings;
  }

  private filterReading(reading: AngleReading): StageTwoMetricReading {
    let filter = this.filters.get(reading.angleName);
    if (!filter) {
      filter = new OneEuroFilter(this.filterConfig);
      this.filters.set(reading.angleName, filter);
    }
    const filteredValueDeg = filter.filter(reading.value, reading.frameTimestamp);
    return {
      angleName: reading.angleName,
      label: ANGLE_LABELS[reading.angleName],
      rawValueDeg: reading.value,
      filteredValueDeg,
      confidence: reading.confidence,
      timestampMs: reading.frameTimestamp,
    };
  }

  private recordReading(reading: StageTwoMetricReading) {
    this.latestByMetric.set(reading.angleName, reading);
    const existing = this.aggregates.get(reading.angleName);
    if (existing) {
      existing.min = Math.min(existing.min, reading.filteredValueDeg);
      existing.max = Math.max(existing.max, reading.filteredValueDeg);
      existing.sum += reading.filteredValueDeg;
      existing.confidenceSum += reading.confidence;
      existing.samples += 1;
    } else {
      this.aggregates.set(reading.angleName, {
        min: reading.filteredValueDeg,
        max: reading.filteredValueDeg,
        sum: reading.filteredValueDeg,
        confidenceSum: reading.confidence,
        samples: 1,
      });
    }

    this.readings.push({
      frameTimestamp: reading.timestampMs,
      angleName: reading.angleName,
      value: reading.filteredValueDeg,
      confidence: reading.confidence,
    });
    if (this.readings.length > MAX_READING_HISTORY) {
      this.readings.splice(0, this.readings.length - MAX_READING_HISTORY);
    }
  }

  private updateSignalSelection(readings: StageTwoMetricReading[]) {
    if (
      this.selectedSignalAngle ||
      this.exercise.segmentation.strategy !== "angle-cycle" ||
      !this.exercise.segmentation.config
    ) {
      return;
    }

    let foundCandidate = false;
    for (const angleName of this.exercise.segmentation.signalAngles) {
      const reading = readings.find((item) => item.angleName === angleName);
      if (!reading) continue;
      foundCandidate = true;
      const state = this.signalCandidates.get(angleName) ?? {
        confidenceSum: 0,
        samples: 0,
      };
      state.confidenceSum += reading.confidence;
      state.samples += 1;
      this.signalCandidates.set(angleName, state);
    }

    if (!foundCandidate) return;
    this.signalSelectionFrames += 1;
    if (this.signalSelectionFrames < SIGNAL_SELECTION_FRAMES) return;

    const selected = [...this.signalCandidates.entries()]
      .filter(([, state]) => state.samples > 0)
      .sort((a, b) => {
        const aMean = a[1].confidenceSum / a[1].samples;
        const bMean = b[1].confidenceSum / b[1].samples;
        if (bMean !== aMean) return bMean - aMean;
        return b[1].samples - a[1].samples;
      })[0]?.[0];

    if (!selected) return;
    this.selectedSignalAngle = selected;
    this.segmenter = new RepSegmenter({
      angleName: selected,
      ...this.exercise.segmentation.config,
      // Stage 2 already applies the time-aware One Euro filter. A second EMA
      // would add avoidable lag, so the segmenter receives the filtered signal.
      signalSmoothing: 1,
    });
  }

  private completeRep(rep: RepSummary): StageTwoRepSummary {
    const signalAngleName = this.selectedSignalAngle ?? repSignalFallback(this.exercise.primaryMetric);
    const persisted = aggregateReps([rep], this.readings)[0];
    const signalReadings = this.readings.filter(
      (reading) =>
        reading.angleName === signalAngleName &&
        reading.frameTimestamp >= rep.startedMs &&
        reading.frameTimestamp <= rep.endedMs,
    );
    const peakReading = signalReadings.reduce<AngleReading | null>((best, reading) => {
      if (!best || reading.value > best.value) return reading;
      return best;
    }, null);
    const peakTimestampMs = Math.min(
      rep.endedMs,
      Math.max(rep.startedMs, peakReading?.frameTimestamp ?? rep.startedMs + rep.durationMs / 2),
    );

    return {
      ...rep,
      signalAngleName,
      signalLabel: ANGLE_LABELS[signalAngleName],
      peakTimestampMs,
      outboundDurationMs: Math.max(0, peakTimestampMs - rep.startedMs),
      returnDurationMs: Math.max(0, rep.endedMs - peakTimestampMs),
      cadenceRpm: rep.durationMs > 0 ? 60000 / rep.durationMs : 0,
      angleSummary: persisted?.angleSummary ?? {},
    };
  }

  private snapshot(latestCompletedRep: StageTwoRepSummary | null): StageTwoAnalysisSnapshot {
    const latestMetrics = this.exercise.availableMetrics
      .map((angleName) => this.latestByMetric.get(angleName))
      .filter((value): value is StageTwoMetricReading => value !== undefined);

    const metricSummaries = this.exercise.availableMetrics.map((angleName) => {
      const aggregate = this.aggregates.get(angleName);
      const latest = this.latestByMetric.get(angleName);
      return {
        angleName,
        label: ANGLE_LABELS[angleName],
        currentDeg: latest?.filteredValueDeg ?? null,
        rawCurrentDeg: latest?.rawValueDeg ?? null,
        sessionMinDeg: aggregate?.min ?? null,
        sessionMaxDeg: aggregate?.max ?? null,
        sessionRangeDeg: aggregate ? aggregate.max - aggregate.min : null,
        meanDeg: aggregate ? aggregate.sum / aggregate.samples : null,
        meanConfidence: aggregate ? aggregate.confidenceSum / aggregate.samples : null,
        samples: aggregate?.samples ?? 0,
      } satisfies StageTwoMetricSummary;
    });

    return {
      schemaVersion: "2.0.0",
      movement: this.movement,
      movementLabel: this.exercise.label,
      processedFrames: this.processedFrames,
      framesWithMeasurements: this.framesWithMeasurements,
      measurementFrameFraction:
        this.processedFrames > 0 ? this.framesWithMeasurements / this.processedFrames : 0,
      selectedSignalAngle: this.selectedSignalAngle,
      selectedSide: sideFromAngleName(this.selectedSignalAngle),
      latestMetrics,
      metricSummaries,
      completedReps: [...this.completedReps],
      consistency: summarizeConsistency(this.completedReps),
      latestCompletedRep,
      filter: {
        type: "one-euro",
        minCutoffHz: this.filterConfig.minCutoffHz,
        beta: this.filterConfig.beta,
        derivativeCutoffHz: this.filterConfig.derivativeCutoffHz,
        resetGapMs: this.filterConfig.resetGapMs,
      },
      interpretationBoundary: "measurement-only-no-risk-classification",
    };
  }
}

export function summarizeConsistency(
  reps: readonly StageTwoRepSummary[],
): StageTwoConsistencySummary {
  if (reps.length === 0) {
    return {
      repCount: 0,
      meanRepDurationMs: null,
      meanCadenceRpm: null,
      durationCoefficientOfVariationPct: null,
      excursionCoefficientOfVariationPct: null,
    };
  }

  const durations = reps.map((rep) => rep.durationMs);
  const excursions = reps.map((rep) => rep.excursionDegrees);
  const cadences = reps.map((rep) => rep.cadenceRpm);
  return {
    repCount: reps.length,
    meanRepDurationMs: mean(durations),
    meanCadenceRpm: mean(cadences),
    durationCoefficientOfVariationPct: coefficientOfVariationPct(durations),
    excursionCoefficientOfVariationPct: coefficientOfVariationPct(excursions),
  };
}

function poseStreamToPoseFrame(frame: PoseStreamFrame): PoseFrame | null {
  if (!frame.pose.detected || frame.pose.landmarks.length !== 33) return null;
  return {
    frameTimestamp: frame.timestampMs,
    keypoints: frame.pose.landmarks.map((point) => ({
      index: point.index,
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
      trusted: point.trusted,
    })),
    trustedKeypointCount: frame.pose.trustedLandmarkCount,
  };
}

function sideFromAngleName(angleName: AngleName | null): "left" | "right" | null {
  if (!angleName) return null;
  if (angleName.startsWith("left")) return "left";
  if (angleName.startsWith("right")) return "right";
  return null;
}

function repSignalFallback(primaryMetric: AngleName): AngleName {
  return primaryMetric;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariationPct(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (!Number.isFinite(average) || Math.abs(average) < 1e-9) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  return (Math.sqrt(variance) / Math.abs(average)) * 100;
}
