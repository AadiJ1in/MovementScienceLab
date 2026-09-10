import type { AngleName, AngleReading } from "./angles";
import { ANGLE_NAMES_BY_VIEW } from "./measurement-profile";
import type { CaptureView } from "@/lib/pose/types";

export type FlagSeverity = "info" | "caution" | "high";
export type Comparator =
  | "greaterThan"
  | "absoluteGreaterThan"
  | "lessThan"
  | "outsideRange";

export type MovementRule = {
  id: string;
  angleName: AngleName;
  captureView: CaptureView;
  label: string;
  comparator: Comparator;
  threshold?: number;
  min?: number;
  max?: number;
  severity: FlagSeverity;
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
  notes?: string;
};

export type MovementFlag = {
  ruleId: string;
  frameTimestamp: number;
  repIndex?: number;
  angleName: AngleName;
  captureView: CaptureView;
  measuredValue: number;
  severity: FlagSeverity;
  excessDegrees: number;
  message: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceMeasurementMethod: string;
};

const ANGLE_NAMES = new Set<AngleName>([
  "leftKneeFlexion",
  "rightKneeFlexion",
  "leftKneeFrontalDeviation",
  "rightKneeFrontalDeviation",
  "trunkLean",
  "pelvicLineObliquity",
  "leftShoulderElevation",
  "rightShoulderElevation",
]);
const COMPARATORS = new Set<Comparator>([
  "greaterThan",
  "absoluteGreaterThan",
  "lessThan",
  "outsideRange",
]);
const SEVERITIES = new Set<FlagSeverity>(["info", "caution", "high"]);
const CAPTURE_VIEWS = new Set<CaptureView>(["front", "side"]);

function evaluateExcess(reading: AngleReading, rule: MovementRule): number | null {
  if (rule.comparator === "greaterThan") {
    if (rule.threshold === undefined) throw new Error(`Rule ${rule.id} is missing threshold.`);
    return reading.value > rule.threshold ? reading.value - rule.threshold : null;
  }

  if (rule.comparator === "absoluteGreaterThan") {
    if (rule.threshold === undefined) throw new Error(`Rule ${rule.id} is missing threshold.`);
    const magnitude = Math.abs(reading.value);
    return magnitude > rule.threshold ? magnitude - rule.threshold : null;
  }

  if (rule.comparator === "lessThan") {
    if (rule.threshold === undefined) throw new Error(`Rule ${rule.id} is missing threshold.`);
    return reading.value < rule.threshold ? rule.threshold - reading.value : null;
  }

  if (rule.min === undefined || rule.max === undefined) {
    throw new Error(`Rule ${rule.id} is missing min/max.`);
  }

  if (reading.value < rule.min) return rule.min - reading.value;
  if (reading.value > rule.max) return reading.value - rule.max;
  return null;
}

export function evaluateMovementRules(
  readings: AngleReading[],
  rules: MovementRule[],
  repIndex?: number,
): MovementFlag[] {
  const flags: MovementFlag[] = [];

  for (const reading of readings) {
    for (const rule of rules) {
      if (rule.angleName !== reading.angleName) continue;
      const excessDegrees = evaluateExcess(reading, rule);
      if (excessDegrees === null) continue;

      flags.push({
        ruleId: rule.id,
        frameTimestamp: reading.frameTimestamp,
        repIndex,
        angleName: reading.angleName,
        captureView: rule.captureView,
        measuredValue: reading.value,
        severity: rule.severity,
        excessDegrees,
        message: `${rule.label} deviated beyond the configured movement-quality threshold by ${excessDegrees.toFixed(1)}°${repIndex === undefined ? "" : ` during rep ${repIndex}`}.`,
        sourceLabel: rule.sourceLabel,
        sourceUrl: rule.sourceUrl,
        sourceMeasurementMethod: rule.sourceMeasurementMethod,
      });
    }
  }

  return flags;
}

/** Keep every unassigned frame flag, but reduce rep-associated flags to the worst
 * exceedance for each rule/rep pair. */
export function collapseMovementFlags(flags: MovementFlag[]): MovementFlag[] {
  const result: MovementFlag[] = [];
  const repWorst = new Map<string, MovementFlag>();

  for (const flag of flags) {
    if (flag.repIndex === undefined) {
      result.push(flag);
      continue;
    }
    const key = `${flag.ruleId}:${flag.repIndex}`;
    const current = repWorst.get(key);
    if (!current || flag.excessDegrees > current.excessDegrees) {
      repWorst.set(key, flag);
    }
  }

  return [...result, ...repWorst.values()].sort(
    (a, b) => a.frameTimestamp - b.frameTimestamp,
  );
}

function assertSourceUrl(value: string, ruleId: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Rule ${ruleId} requires a valid sourceUrl.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Rule ${ruleId} sourceUrl must use http or https.`);
  }
}

/**
 * Parse user-supplied rule JSON. Loaded rules must carry source provenance and
 * the measurement method used by the source. This does not prove that a source
 * threshold is transferable to webcam pose; it makes that assumption explicit
 * and auditable instead of silently treating unlike measurements as equivalent.
 */
export function parseMovementRules(input: unknown): MovementRule[] {
  if (!Array.isArray(input)) throw new Error("Rule configuration must be a JSON array.");

  const seenIds = new Set<string>();

  return input.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Rule ${index + 1} must be an object.`);
    }
    const rule = candidate as Partial<MovementRule>;
    if (
      !rule.id ||
      !rule.label ||
      !rule.sourceLabel ||
      !rule.sourceUrl ||
      !rule.sourceMeasurementMethod
    ) {
      throw new Error(
        `Rule ${index + 1} requires id, label, sourceLabel, sourceUrl, and sourceMeasurementMethod.`,
      );
    }
    if (seenIds.has(rule.id)) throw new Error(`Duplicate rule id: ${rule.id}.`);
    seenIds.add(rule.id);

    if (!rule.angleName || !ANGLE_NAMES.has(rule.angleName)) {
      throw new Error(`Rule ${rule.id} has an unsupported angleName.`);
    }
    if (!rule.captureView || !CAPTURE_VIEWS.has(rule.captureView)) {
      throw new Error(`Rule ${rule.id} requires captureView "front" or "side".`);
    }
    if (!ANGLE_NAMES_BY_VIEW[rule.captureView].includes(rule.angleName)) {
      throw new Error(
        `Rule ${rule.id} uses ${rule.angleName}, which is not valid for ${rule.captureView}-view capture.`,
      );
    }
    if (!rule.comparator || !COMPARATORS.has(rule.comparator)) {
      throw new Error(`Rule ${rule.id} has an unsupported comparator.`);
    }
    if (!rule.severity || !SEVERITIES.has(rule.severity)) {
      throw new Error(`Rule ${rule.id} has an unsupported severity.`);
    }

    assertSourceUrl(rule.sourceUrl, rule.id);
    if (!rule.sourceMeasurementMethod.trim()) {
      throw new Error(`Rule ${rule.id} requires a non-empty sourceMeasurementMethod.`);
    }

    if (rule.comparator === "outsideRange") {
      if (!Number.isFinite(rule.min) || !Number.isFinite(rule.max)) {
        throw new Error(`Rule ${rule.id} requires numeric min and max values.`);
      }
      if ((rule.min as number) >= (rule.max as number)) {
        throw new Error(`Rule ${rule.id} requires min < max.`);
      }
    } else if (!Number.isFinite(rule.threshold)) {
      throw new Error(`Rule ${rule.id} requires a numeric threshold.`);
    }

    if (rule.comparator === "absoluteGreaterThan" && (rule.threshold as number) < 0) {
      throw new Error(`Rule ${rule.id} requires a non-negative absolute threshold.`);
    }

    return rule as MovementRule;
  });
}

/**
 * Intentionally empty. Biomechanical thresholds must be supplied from reviewed literature
 * or a clinician-approved protocol. This project must never invent default "safe" ranges.
 */
export const DEFAULT_MOVEMENT_RULES: MovementRule[] = [];
