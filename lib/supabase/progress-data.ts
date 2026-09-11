import type { SupabaseClient } from "@supabase/supabase-js";
import type { AngleName } from "../biomechanics/angles";
import type { MovementType } from "../pose/types";
import {
  MEASUREMENT_DEFINITION_VERSION,
  type BaselineStats,
  type ProgressMetricKey,
  type ProgressSession,
} from "../progress/analytics";

const MOVEMENT_TYPES = new Set<MovementType>([
  "squat-front",
  "squat-side",
  "push-up-side",
  "general-front",
  "general-side",
]);

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

function isMovementType(value: unknown): value is MovementType {
  return typeof value === "string" && MOVEMENT_TYPES.has(value as MovementType);
}

function isAngleName(value: unknown): value is AngleName {
  return typeof value === "string" && ANGLE_NAMES.has(value as AngleName);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function loadProgressSessions(
  supabase: SupabaseClient,
  patientId?: string,
): Promise<ProgressSession[]> {
  let query = supabase
    .from("movement_sessions")
    .select(`
      id,
      user_id,
      started_at,
      ended_at,
      capture_mode,
      capture_fps,
      measurement_version,
      analysis_config,
      angle_samples(frame_timestamp_ms, angle_name, value_degrees, confidence),
      rep_summaries(rep_index, started_ms, ended_ms, angle_summary)
    `)
    .eq("status", "complete")
    .order("started_at", { ascending: true });

  if (patientId) query = query.eq("user_id", patientId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).flatMap((row): ProgressSession[] => {
    if (!isMovementType(row.capture_mode) || typeof row.id !== "string" || typeof row.started_at !== "string") return [];
    const config = record(row.analysis_config);
    const definitionVersion = typeof config.measurementDefinitionVersion === "string"
      ? config.measurementDefinitionVersion
      : MEASUREMENT_DEFINITION_VERSION;

    const angleSamples = (Array.isArray(row.angle_samples) ? row.angle_samples : []).flatMap((sample): ProgressSession["angleSamples"] => {
      const item = record(sample);
      const timestamp = finiteNumber(item.frame_timestamp_ms);
      const value = finiteNumber(item.value_degrees);
      const confidence = finiteNumber(item.confidence);
      if (timestamp === null || value === null || confidence === null || !isAngleName(item.angle_name)) return [];
      return [{ frameTimestampMs: timestamp, angleName: item.angle_name, valueDegrees: value, confidence }];
    });

    const reps = (Array.isArray(row.rep_summaries) ? row.rep_summaries : []).flatMap((rep): ProgressSession["reps"] => {
      const item = record(rep);
      const repIndex = finiteNumber(item.rep_index);
      const startedMs = finiteNumber(item.started_ms);
      const endedMs = finiteNumber(item.ended_ms);
      if (repIndex === null || startedMs === null || endedMs === null) return [];
      return [{
        repIndex,
        startedMs,
        endedMs,
        angleSummary: record(item.angle_summary) as ProgressSession["reps"][number]["angleSummary"],
      }];
    }).sort((a, b) => a.repIndex - b.repIndex);

    return [{
      id: row.id,
      startedAt: row.started_at,
      endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
      captureMode: row.capture_mode,
      measurementVersion: typeof row.measurement_version === "string" ? row.measurement_version : "legacy-unknown",
      measurementDefinitionVersion: definitionVersion,
      captureFps: finiteNumber(row.capture_fps),
      angleSamples: angleSamples.sort((a, b) => a.frameTimestampMs - b.frameTimestampMs),
      reps,
    }];
  });
}

export type PersistedBaseline = BaselineStats & {
  id: string;
  compatibilityKey: string;
  metricKey: ProgressMetricKey;
  angleName: AngleName;
  strategy: "first_session" | "first_n";
};

export async function saveProgressBaseline(
  supabase: SupabaseClient,
  input: {
    userId: string;
    compatibilityKey: string;
    metricKey: ProgressMetricKey;
    angleName: AngleName;
    strategy: "first_session" | "first_n";
    baseline: BaselineStats;
  },
) {
  const { error } = await supabase.from("progress_baselines").upsert({
    user_id: input.userId,
    compatibility_key: input.compatibilityKey,
    metric_key: input.metricKey,
    angle_name: input.angleName,
    baseline_strategy: input.strategy,
    baseline_session_count: input.baseline.sessionCount,
    baseline_session_ids: input.baseline.sessionIds,
    baseline_mean: input.baseline.mean,
    baseline_median: input.baseline.median,
    baseline_stddev: input.baseline.standardDeviation,
    baseline_start: input.baseline.baselineStart,
    baseline_end: input.baseline.baselineEnd,
    measurement_version: input.baseline.measurementVersion,
    measurement_definition_version: input.baseline.measurementDefinitionVersion,
  }, { onConflict: "user_id,compatibility_key,metric_key" });
  if (error) throw error;
}

export async function loadProgressBaselines(
  supabase: SupabaseClient,
  patientId?: string,
): Promise<PersistedBaseline[]> {
  let query = supabase
    .from("progress_baselines")
    .select("id,user_id,compatibility_key,metric_key,angle_name,baseline_strategy,baseline_session_count,baseline_session_ids,baseline_mean,baseline_median,baseline_stddev,baseline_start,baseline_end,measurement_version,measurement_definition_version")
    .order("baseline_end", { ascending: false });
  if (patientId) query = query.eq("user_id", patientId);
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).flatMap((row): PersistedBaseline[] => {
    if (!isAngleName(row.angle_name)) return [];
    if (row.baseline_strategy !== "first_session" && row.baseline_strategy !== "first_n") return [];
    const mean = finiteNumber(row.baseline_mean);
    const median = finiteNumber(row.baseline_median);
    const standardDeviation = finiteNumber(row.baseline_stddev);
    const sessionCount = finiteNumber(row.baseline_session_count);
    if (mean === null || median === null || standardDeviation === null || sessionCount === null) return [];
    return [{
      id: row.id as string,
      compatibilityKey: row.compatibility_key as string,
      metricKey: row.metric_key as ProgressMetricKey,
      angleName: row.angle_name,
      strategy: row.baseline_strategy,
      mean,
      median,
      standardDeviation,
      sessionCount,
      sessionIds: Array.isArray(row.baseline_session_ids) ? row.baseline_session_ids.filter((id): id is string => typeof id === "string") : [],
      baselineStart: String(row.baseline_start),
      baselineEnd: String(row.baseline_end),
      measurementVersion: String(row.measurement_version),
      measurementDefinitionVersion: String(row.measurement_definition_version),
    }];
  });
}
