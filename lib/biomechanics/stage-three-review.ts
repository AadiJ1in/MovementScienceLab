import type { AngleName } from "./angles";
import type {
  StageTwoAnalysisSnapshot,
  StageTwoMetricReading,
  StageTwoRepSummary,
} from "./stage-two-analysis";
import { getExerciseDefinition } from "../exercises/registry";
import type { MovementType } from "../pose/types";

export type StageThreeSeverity = "info" | "caution" | "high";
export type StageThreeComparator =
  | "greaterThan"
  | "absoluteGreaterThan"
  | "lessThan"
  | "outsideRange";
export type StageThreeScope = "frame" | "rep";
export type StageThreeRepMetric =
  | "repExcursionDeg"
  | "repDurationSec"
  | "repCadenceRpm";
export type StageThreeMetric = AngleName | StageThreeRepMetric;

export type StageThreeRule = {
  id: string;
  protocolId: string;
  movement: MovementType;
  scope: StageThreeScope;
  metric: StageThreeMetric;
  label: string;
  comparator: StageThreeComparator;
  threshold?: number;
  min?: number;
  max?: number;
  severity: StageThreeSeverity;
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  reviewedBy: string;
  reviewedAt: string;
  notes?: string;
};

export type StageThreeReviewFlag = {
  id: string;
  ruleId: string;
  protocolId: string;
  movement: MovementType;
  movementLabel: string;
  scope: StageThreeScope;
  metric: StageThreeMetric;
  label: string;
  severity: StageThreeSeverity;
  timestampMs: number;
  repIndex?: number;
  measuredValue: number;
  unit: "deg" | "sec" | "rpm";
  comparator: StageThreeComparator;
  threshold?: number;
  min?: number;
  max?: number;
  excess: number;
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  reviewedBy: string;
  reviewedAt: string;
  interpretationBoundary: "review-indicator-not-injury-risk";
};

const ANGLE_METRICS = new Set<AngleName>([
  "leftKneeFlexion",
  "rightKneeFlexion",
  "leftKneeFrontalDeviation",
  "rightKneeFrontalDeviation",
  "trunkLean",
  "pelvicLineObliquity",
  "leftShoulderElevation",
  "rightShoulderElevation",
  "leftElbowFlexion",
  "rightElbowFlexion",
]);
const REP_METRICS = new Set<StageThreeRepMetric>([
  "repExcursionDeg",
  "repDurationSec",
  "repCadenceRpm",
]);
const COMPARATORS = new Set<StageThreeComparator>([
  "greaterThan",
  "absoluteGreaterThan",
  "lessThan",
  "outsideRange",
]);
const SEVERITIES = new Set<StageThreeSeverity>(["info", "caution", "high"]);
const MOVEMENTS = new Set<MovementType>([
  "squat-front",
  "squat-side",
  "push-up-side",
  "shoulder-flexion-side",
  "general-front",
  "general-side",
]);

/**
 * Stage 3 intentionally ships with no default threshold values.
 * A reviewed protocol must explicitly provide them before any flags are emitted.
 */
export const DEFAULT_STAGE_THREE_RULES: StageThreeRule[] = [];

export function parseStageThreeRules(input: unknown): StageThreeRule[] {
  if (!Array.isArray(input)) {
    throw new Error("Stage 3 rule configuration must be a JSON array.");
  }

  const seenIds = new Set<string>();
  return input.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Rule ${index + 1} must be an object.`);
    }

    const rule = candidate as Partial<StageThreeRule>;
    requireString(rule.id, `Rule ${index + 1} requires id.`);
    requireString(rule.protocolId, `Rule ${index + 1} requires protocolId.`);
    requireString(rule.label, `Rule ${index + 1} requires label.`);
    requireString(rule.sourceLabel, `Rule ${index + 1} requires sourceLabel.`);
    requireString(
      rule.sourceMeasurementMethod,
      `Rule ${index + 1} requires sourceMeasurementMethod.`,
    );
    requireString(rule.reviewedBy, `Rule ${index + 1} requires reviewedBy.`);
    requireString(rule.reviewedAt, `Rule ${index + 1} requires reviewedAt.`);

    const id = rule.id as string;
    if (seenIds.has(id)) throw new Error(`Duplicate rule id: ${id}.`);
    seenIds.add(id);

    if (!rule.movement || !MOVEMENTS.has(rule.movement)) {
      throw new Error(`Rule ${id} has an unsupported movement.`);
    }
    if (rule.scope !== "frame" && rule.scope !== "rep") {
      throw new Error(`Rule ${id} requires scope "frame" or "rep".`);
    }
    if (!rule.metric || (!ANGLE_METRICS.has(rule.metric as AngleName) && !REP_METRICS.has(rule.metric as StageThreeRepMetric))) {
      throw new Error(`Rule ${id} has an unsupported metric.`);
    }
    if (!rule.comparator || !COMPARATORS.has(rule.comparator)) {
      throw new Error(`Rule ${id} has an unsupported comparator.`);
    }
    if (!rule.severity || !SEVERITIES.has(rule.severity)) {
      throw new Error(`Rule ${id} has an unsupported severity.`);
    }

    validateSourceUrl(rule.sourceUrl, id);
    validateReviewedAt(rule.reviewedAt as string, id);
    validateThresholdShape(rule as StageThreeRule);
    validateMovementCompatibility(rule as StageThreeRule);

    return rule as StageThreeRule;
  });
}

export function evaluateStageThreeSnapshot(
  analysis: StageTwoAnalysisSnapshot,
  rules: readonly StageThreeRule[],
): StageThreeReviewFlag[] {
  const compatible = rules.filter((rule) => rule.movement === analysis.movement);
  if (!compatible.length) return [];

  const flags: StageThreeReviewFlag[] = [];
  const frameRules = compatible.filter((rule) => rule.scope === "frame");
  const repRules = compatible.filter((rule) => rule.scope === "rep");

  for (const rule of frameRules) {
    const metric = analysis.latestMetrics.find((reading) => reading.angleName === rule.metric);
    if (!metric) continue;
    const evaluated = evaluateValue(metric.filteredValueDeg, rule);
    if (evaluated === null) continue;
    flags.push(buildFrameFlag(analysis, metric, rule, evaluated));
  }

  const rep = analysis.latestCompletedRep;
  if (rep) {
    for (const rule of repRules) {
      const value = repMetricValue(rep, rule.metric);
      if (value === null) continue;
      const evaluated = evaluateValue(value, rule);
      if (evaluated === null) continue;
      flags.push(buildRepFlag(analysis, rep, rule, value, evaluated));
    }
  }

  return flags;
}

/**
 * Merge live frame events without turning every video frame into a database row.
 * Nearby crossings for the same rule are reduced to the larger exceedance; rep
 * flags remain one event per rule/rep. The raw Stage 1/2 stream remains available
 * separately for research review.
 */
export function mergeStageThreeFlags(
  existing: readonly StageThreeReviewFlag[],
  incoming: readonly StageThreeReviewFlag[],
  options: { frameWindowMs?: number; maxFlags?: number } = {},
): StageThreeReviewFlag[] {
  const frameWindowMs = options.frameWindowMs ?? 750;
  const maxFlags = options.maxFlags ?? 250;
  const merged = [...existing];

  for (const candidate of incoming) {
    if (candidate.scope === "rep") {
      const index = merged.findIndex(
        (flag) =>
          flag.scope === "rep" &&
          flag.ruleId === candidate.ruleId &&
          flag.repIndex === candidate.repIndex,
      );
      if (index === -1) merged.push(candidate);
      else if (candidate.excess > merged[index]!.excess) merged[index] = candidate;
      continue;
    }

    let nearbyIndex = -1;
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const flag = merged[index]!;
      if (flag.scope !== "frame" || flag.ruleId !== candidate.ruleId) continue;
      if (Math.abs(candidate.timestampMs - flag.timestampMs) <= frameWindowMs) {
        nearbyIndex = index;
      }
      break;
    }

    if (nearbyIndex === -1) merged.push(candidate);
    else if (candidate.excess > merged[nearbyIndex]!.excess) merged[nearbyIndex] = candidate;
  }

  return merged
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(Math.max(0, merged.length - maxFlags));
}

function buildFrameFlag(
  analysis: StageTwoAnalysisSnapshot,
  metric: StageTwoMetricReading,
  rule: StageThreeRule,
  excess: number,
): StageThreeReviewFlag {
  return {
    id: `${rule.id}:frame:${Math.round(metric.timestampMs)}`,
    ruleId: rule.id,
    protocolId: rule.protocolId,
    movement: analysis.movement,
    movementLabel: analysis.movementLabel,
    scope: "frame",
    metric: rule.metric,
    label: rule.label,
    severity: rule.severity,
    timestampMs: metric.timestampMs,
    measuredValue: metric.filteredValueDeg,
    unit: "deg",
    comparator: rule.comparator,
    threshold: rule.threshold,
    min: rule.min,
    max: rule.max,
    excess,
    sourceLabel: rule.sourceLabel,
    sourceUrl: rule.sourceUrl,
    sourceMeasurementMethod: rule.sourceMeasurementMethod,
    reviewedBy: rule.reviewedBy,
    reviewedAt: rule.reviewedAt,
    interpretationBoundary: "review-indicator-not-injury-risk",
  };
}

function buildRepFlag(
  analysis: StageTwoAnalysisSnapshot,
  rep: StageTwoRepSummary,
  rule: StageThreeRule,
  value: number,
  excess: number,
): StageThreeReviewFlag {
  return {
    id: `${rule.id}:rep:${rep.repIndex}`,
    ruleId: rule.id,
    protocolId: rule.protocolId,
    movement: analysis.movement,
    movementLabel: analysis.movementLabel,
    scope: "rep",
    metric: rule.metric,
    label: rule.label,
    severity: rule.severity,
    timestampMs: rep.peakTimestampMs,
    repIndex: rep.repIndex,
    measuredValue: value,
    unit: repMetricUnit(rule.metric),
    comparator: rule.comparator,
    threshold: rule.threshold,
    min: rule.min,
    max: rule.max,
    excess,
    sourceLabel: rule.sourceLabel,
    sourceUrl: rule.sourceUrl,
    sourceMeasurementMethod: rule.sourceMeasurementMethod,
    reviewedBy: rule.reviewedBy,
    reviewedAt: rule.reviewedAt,
    interpretationBoundary: "review-indicator-not-injury-risk",
  };
}

function evaluateValue(value: number, rule: StageThreeRule): number | null {
  if (rule.comparator === "greaterThan") {
    const threshold = rule.threshold as number;
    return value > threshold ? value - threshold : null;
  }
  if (rule.comparator === "absoluteGreaterThan") {
    const threshold = rule.threshold as number;
    const magnitude = Math.abs(value);
    return magnitude > threshold ? magnitude - threshold : null;
  }
  if (rule.comparator === "lessThan") {
    const threshold = rule.threshold as number;
    return value < threshold ? threshold - value : null;
  }

  const min = rule.min as number;
  const max = rule.max as number;
  if (value < min) return min - value;
  if (value > max) return value - max;
  return null;
}

function repMetricValue(rep: StageTwoRepSummary, metric: StageThreeMetric): number | null {
  if (metric === "repExcursionDeg") return rep.excursionDegrees;
  if (metric === "repDurationSec") return rep.durationMs / 1000;
  if (metric === "repCadenceRpm") return rep.cadenceRpm;
  return null;
}

function repMetricUnit(metric: StageThreeMetric): "deg" | "sec" | "rpm" {
  if (metric === "repDurationSec") return "sec";
  if (metric === "repCadenceRpm") return "rpm";
  return "deg";
}

function validateMovementCompatibility(rule: StageThreeRule) {
  const exercise = getExerciseDefinition(rule.movement);
  if (rule.scope === "frame") {
    if (!ANGLE_METRICS.has(rule.metric as AngleName)) {
      throw new Error(`Rule ${rule.id} uses a rep metric with frame scope.`);
    }
    if (!exercise.availableMetrics.includes(rule.metric as AngleName)) {
      throw new Error(
        `Rule ${rule.id} uses ${rule.metric}, which is not available for ${rule.movement}.`,
      );
    }
    return;
  }

  if (!REP_METRICS.has(rule.metric as StageThreeRepMetric)) {
    throw new Error(`Rule ${rule.id} uses an angle metric with rep scope.`);
  }
  if (exercise.segmentation.strategy !== "angle-cycle") {
    throw new Error(`Rule ${rule.id} requires rep segmentation for ${rule.movement}.`);
  }
}

function validateThresholdShape(rule: StageThreeRule) {
  if (rule.comparator === "outsideRange") {
    if (!Number.isFinite(rule.min) || !Number.isFinite(rule.max)) {
      throw new Error(`Rule ${rule.id} requires numeric min and max values.`);
    }
    if ((rule.min as number) >= (rule.max as number)) {
      throw new Error(`Rule ${rule.id} requires min < max.`);
    }
    return;
  }

  if (!Number.isFinite(rule.threshold)) {
    throw new Error(`Rule ${rule.id} requires a numeric threshold.`);
  }
  if (rule.comparator === "absoluteGreaterThan" && (rule.threshold as number) < 0) {
    throw new Error(`Rule ${rule.id} requires a non-negative absolute threshold.`);
  }
}

function validateSourceUrl(value: unknown, ruleId: string) {
  requireString(value, `Rule ${ruleId} requires sourceUrl.`);
  let parsed: URL;
  try {
    parsed = new URL(value as string);
  } catch {
    throw new Error(`Rule ${ruleId} requires a valid sourceUrl.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Rule ${ruleId} sourceUrl must use http or https.`);
  }
}

function validateReviewedAt(value: string, ruleId: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Rule ${ruleId} requires reviewedAt to be a valid date/time.`);
  }
}

function requireString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
}
