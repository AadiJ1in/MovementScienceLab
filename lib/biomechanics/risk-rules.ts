import type { AngleName, AngleReading } from "./angles";

export type FlagSeverity = "info" | "caution" | "high";
export type Comparator = "greaterThan" | "lessThan" | "outsideRange";

export type MovementRule = {
  id: string;
  angleName: AngleName;
  label: string;
  comparator: Comparator;
  threshold?: number;
  min?: number;
  max?: number;
  severity: FlagSeverity;
  sourceLabel: string;
  sourceUrl?: string;
  notes?: string;
};

export type MovementFlag = {
  ruleId: string;
  frameTimestamp: number;
  repIndex?: number;
  angleName: AngleName;
  measuredValue: number;
  severity: FlagSeverity;
  excessDegrees: number;
  message: string;
  sourceLabel: string;
  sourceUrl?: string;
};

function evaluateExcess(reading: AngleReading, rule: MovementRule): number | null {
  if (rule.comparator === "greaterThan") {
    if (rule.threshold === undefined) throw new Error(`Rule ${rule.id} is missing threshold.`);
    return reading.value > rule.threshold ? reading.value - rule.threshold : null;
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
        measuredValue: reading.value,
        severity: rule.severity,
        excessDegrees,
        message: `${rule.label} exceeded the configured movement-quality threshold by ${excessDegrees.toFixed(1)}°${repIndex === undefined ? "" : ` during rep ${repIndex}`}.`,
        sourceLabel: rule.sourceLabel,
        sourceUrl: rule.sourceUrl,
      });
    }
  }

  return flags;
}

/**
 * Intentionally empty. Biomechanical thresholds must be supplied from reviewed literature
 * or a clinician-approved protocol. This project must never invent default "safe" ranges.
 */
export const DEFAULT_MOVEMENT_RULES: MovementRule[] = [];
