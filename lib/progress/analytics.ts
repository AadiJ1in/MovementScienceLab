import type { AngleName } from "../biomechanics/angles";
import type { MovementType } from "../pose/types";

export const MEASUREMENT_DEFINITION_VERSION = "movement-definitions-v1";

export type ProgressAngleSample = {
  frameTimestampMs: number;
  angleName: AngleName;
  valueDegrees: number;
  confidence: number;
};

export type ProgressRep = {
  repIndex: number;
  startedMs: number;
  endedMs: number;
  angleSummary: Record<string, {
    min?: number;
    max?: number;
    mean?: number;
    samples?: number;
    meanConfidence?: number;
  }>;
};

export type ProgressSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  captureMode: MovementType;
  measurementVersion: string;
  measurementDefinitionVersion: string;
  captureFps: number | null;
  angleSamples: ProgressAngleSample[];
  reps: ProgressRep[];
};

export type ProgressMetricKey =
  | "min-angle"
  | "max-angle"
  | "excursion"
  | "mean-rep-duration"
  | "rep-count"
  | "rep-excursion-variability"
  | "symmetry-proxy"
  | "tracking-confidence"
  | "session-duration"
  | "capture-fps";

export type BaselineStats = {
  mean: number;
  median: number;
  standardDeviation: number;
  sessionCount: number;
  sessionIds: string[];
  baselineStart: string;
  baselineEnd: string;
  measurementVersion: string;
  measurementDefinitionVersion: string;
};

export type MetricPoint = {
  sessionId: string;
  startedAt: string;
  value: number;
};

export type NormalizedTrajectoryPoint = {
  cyclePercent: number;
  value: number;
};

export const PROGRESS_METRICS: readonly { key: ProgressMetricKey; label: string; unit: string; description: string }[] = [
  { key: "min-angle", label: "Minimum angle", unit: "°", description: "Minimum camera-derived value in the selected session." },
  { key: "max-angle", label: "Maximum angle", unit: "°", description: "Maximum camera-derived value in the selected session." },
  { key: "excursion", label: "Angle excursion / ROM proxy", unit: "°", description: "Maximum minus minimum camera-derived angle; this is a movement-range proxy, not a clinical ROM diagnosis." },
  { key: "mean-rep-duration", label: "Mean repetition duration", unit: "s", description: "Average duration of detected repetitions." },
  { key: "rep-count", label: "Repetition count", unit: " reps", description: "Number of repetitions detected by the engineering rep segmenter." },
  { key: "rep-excursion-variability", label: "Inter-repetition variability", unit: "°", description: "Standard deviation of per-repetition excursion for the selected angle." },
  { key: "symmetry-proxy", label: "Left/right difference proxy", unit: "°", description: "Absolute difference between left and right excursion when both sides are available." },
  { key: "tracking-confidence", label: "Average tracking confidence", unit: "%", description: "Mean pose-landmark tracking confidence for the selected angle." },
  { key: "session-duration", label: "Session duration", unit: "s", description: "Elapsed time from session start to completion." },
  { key: "capture-fps", label: "Capture FPS", unit: " fps", description: "Persisted capture frame rate when available." },
] as const;

export function captureView(captureMode: MovementType): "front" | "side" {
  return captureMode.endsWith("front") ? "front" : "side";
}

export function compatibilityKey(session: ProgressSession, angleName: AngleName) {
  return [
    session.captureMode,
    captureView(session.captureMode),
    session.measurementVersion,
    session.measurementDefinitionVersion,
    angleName,
  ].join("::");
}

export function areSessionsCompatible(a: ProgressSession, b: ProgressSession, angleName: AngleName) {
  return compatibilityKey(a, angleName) === compatibilityKey(b, angleName);
}

export function filterCompatibleSessions(sessions: ProgressSession[], anchor: ProgressSession, angleName: AngleName) {
  const key = compatibilityKey(anchor, angleName);
  return sessions.filter((session) => compatibilityKey(session, angleName) === key);
}

export function filterByDateRange(sessions: ProgressSession[], days: 7 | 30 | 90 | "all", now = Date.now()) {
  if (days === "all") return [...sessions];
  const threshold = now - days * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => new Date(session.startedAt).getTime() >= threshold);
}

function selectedSamples(session: ProgressSession, angleName: AngleName) {
  return session.angleSamples.filter((sample) => sample.angleName === angleName);
}

function sampleValues(session: ProgressSession, angleName: AngleName) {
  return selectedSamples(session, angleName).map((sample) => sample.valueDegrees).filter(Number.isFinite);
}

function populationStandardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function counterpart(angleName: AngleName): AngleName | null {
  if (angleName.startsWith("left")) return (`right${angleName.slice(4)}`) as AngleName;
  if (angleName.startsWith("right")) return (`left${angleName.slice(5)}`) as AngleName;
  return null;
}

function excursion(session: ProgressSession, angleName: AngleName) {
  const values = sampleValues(session, angleName);
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

export function metricValue(session: ProgressSession, metric: ProgressMetricKey, angleName: AngleName): number | null {
  const values = sampleValues(session, angleName);
  switch (metric) {
    case "min-angle":
      return values.length ? Math.min(...values) : null;
    case "max-angle":
      return values.length ? Math.max(...values) : null;
    case "excursion":
      return excursion(session, angleName);
    case "mean-rep-duration": {
      if (!session.reps.length) return null;
      return session.reps.reduce((sum, rep) => sum + Math.max(0, rep.endedMs - rep.startedMs), 0) / session.reps.length / 1000;
    }
    case "rep-count":
      return session.reps.length;
    case "rep-excursion-variability": {
      const excursions = session.reps
        .map((rep) => rep.angleSummary[angleName])
        .map((summary) => summary?.min !== undefined && summary.max !== undefined ? summary.max - summary.min : null)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      return excursions.length >= 2 ? populationStandardDeviation(excursions) : null;
    }
    case "symmetry-proxy": {
      const other = counterpart(angleName);
      if (!other) return null;
      const selected = excursion(session, angleName);
      const opposite = excursion(session, other);
      return selected === null || opposite === null ? null : Math.abs(selected - opposite);
    }
    case "tracking-confidence": {
      const samples = selectedSamples(session, angleName);
      if (!samples.length) return null;
      return samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length * 100;
    }
    case "session-duration": {
      if (!session.endedAt) return null;
      return Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000;
    }
    case "capture-fps":
      return session.captureFps;
  }
}

export function metricHistory(sessions: ProgressSession[], metric: ProgressMetricKey, angleName: AngleName): MetricPoint[] {
  return sessions
    .map((session) => {
      const value = metricValue(session, metric, angleName);
      return value === null || !Number.isFinite(value) ? null : { sessionId: session.id, startedAt: session.startedAt, value };
    })
    .filter((point): point is MetricPoint => point !== null)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}

export function computeBaseline(
  sessions: ProgressSession[],
  metric: ProgressMetricKey,
  angleName: AngleName,
  firstNSessions = 3,
): BaselineStats | null {
  const sorted = [...sessions].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const selected = sorted.slice(0, Math.max(1, firstNSessions));
  const valued = selected
    .map((session) => ({ session, value: metricValue(session, metric, angleName) }))
    .filter((entry): entry is { session: ProgressSession; value: number } => entry.value !== null && Number.isFinite(entry.value));
  if (!valued.length) return null;

  const values = valued.map((entry) => entry.value).sort((a, b) => a - b);
  const midpoint = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[midpoint] : (values[midpoint - 1] + values[midpoint]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    mean,
    median,
    standardDeviation: populationStandardDeviation(values),
    sessionCount: valued.length,
    sessionIds: valued.map((entry) => entry.session.id),
    baselineStart: valued[0].session.startedAt,
    baselineEnd: valued[valued.length - 1].session.startedAt,
    measurementVersion: valued[0].session.measurementVersion,
    measurementDefinitionVersion: valued[0].session.measurementDefinitionVersion,
  };
}

export function baselineChange(value: number | null, baseline: BaselineStats | null) {
  if (value === null || baseline === null) return null;
  const delta = value - baseline.mean;
  const percentDelta = baseline.mean === 0 ? null : delta / Math.abs(baseline.mean) * 100;
  return { delta, percentDelta };
}

function interpolate(samples: ProgressAngleSample[], timestamp: number) {
  if (!samples.length) return null;
  if (timestamp <= samples[0].frameTimestampMs) return samples[0].valueDegrees;
  if (timestamp >= samples[samples.length - 1].frameTimestampMs) return samples[samples.length - 1].valueDegrees;
  for (let index = 1; index < samples.length; index += 1) {
    const right = samples[index];
    const left = samples[index - 1];
    if (timestamp <= right.frameTimestampMs) {
      const span = right.frameTimestampMs - left.frameTimestampMs;
      const ratio = span <= 0 ? 0 : (timestamp - left.frameTimestampMs) / span;
      return left.valueDegrees + (right.valueDegrees - left.valueDegrees) * ratio;
    }
  }
  return null;
}

export function normalizeRepTrajectory(
  session: ProgressSession,
  rep: ProgressRep,
  angleName: AngleName,
  pointCount = 21,
): NormalizedTrajectoryPoint[] {
  const samples = selectedSamples(session, angleName)
    .filter((sample) => sample.frameTimestampMs >= rep.startedMs && sample.frameTimestampMs <= rep.endedMs)
    .sort((a, b) => a.frameTimestampMs - b.frameTimestampMs);
  if (samples.length < 2 || rep.endedMs <= rep.startedMs) return [];

  return Array.from({ length: Math.max(2, pointCount) }, (_, index) => {
    const cyclePercent = index / (Math.max(2, pointCount) - 1) * 100;
    const timestamp = rep.startedMs + (rep.endedMs - rep.startedMs) * cyclePercent / 100;
    return { cyclePercent, value: interpolate(samples, timestamp) ?? samples[0].valueDegrees };
  });
}

export function availableAngles(session: ProgressSession): AngleName[] {
  return [...new Set(session.angleSamples.map((sample) => sample.angleName))].sort() as AngleName[];
}
