import type { SupabaseClient } from "@supabase/supabase-js";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import {
  collapseMovementFlags,
  type MovementFlag,
  type MovementRule,
} from "@/lib/biomechanics/risk-rules";
import type { PersistableRepSummary } from "@/lib/biomechanics/session-aggregation";
import type { MovementType } from "@/lib/pose/types";

const INSERT_CHUNK_SIZE = 500;
export const MEASUREMENT_VERSION = "mediapipe-2d-v1";

async function insertInChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
) {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + INSERT_CHUNK_SIZE));
    if (error) throw error;
  }
}

export type SessionProtocol = {
  userId: string;
  captureMode: MovementType;
  rules: MovementRule[];
  keypointVisibilityThreshold: number;
  storageIntervalMs: number;
};

export async function createMovementSession(
  supabase: SupabaseClient,
  protocol: SessionProtocol,
) {
  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id")
    .eq("slug", protocol.captureMode)
    .maybeSingle();
  if (exerciseError) throw exerciseError;

  const analysisConfig = {
    measurementVersion: MEASUREMENT_VERSION,
    keypointVisibilityThreshold: protocol.keypointVisibilityThreshold,
    storageIntervalMs: protocol.storageIntervalMs,
    rules: protocol.rules,
  };

  const { data, error } = await supabase
    .from("movement_sessions")
    .insert({
      user_id: protocol.userId,
      exercise_id: exercise?.id ?? null,
      capture_mode: protocol.captureMode,
      analysis_config: analysisConfig,
      measurement_version: MEASUREMENT_VERSION,
      status: "recording",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveAngleSamples(
  supabase: SupabaseClient,
  sessionId: string,
  readings: AngleReading[],
) {
  const rows = readings.map((reading) => ({
    session_id: sessionId,
    frame_timestamp_ms: reading.frameTimestamp,
    angle_name: reading.angleName,
    value_degrees: reading.value,
    confidence: reading.confidence,
  }));
  await insertInChunks(supabase, "angle_samples", rows);
}

export async function saveRepSummaries(
  supabase: SupabaseClient,
  sessionId: string,
  reps: PersistableRepSummary[],
) {
  const rows = reps.map((rep) => ({
    session_id: sessionId,
    rep_index: rep.repIndex,
    started_ms: rep.startedMs,
    ended_ms: rep.endedMs,
    angle_summary: rep.angleSummary,
  }));
  await insertInChunks(supabase, "rep_summaries", rows);
}

export async function saveMovementFlags(
  supabase: SupabaseClient,
  sessionId: string,
  flags: MovementFlag[],
) {
  const rows = collapseMovementFlags(flags).map((flag) => ({
    session_id: sessionId,
    rep_index: flag.repIndex ?? null,
    frame_timestamp_ms: flag.frameTimestamp,
    rule_id: flag.ruleId,
    angle_name: flag.angleName,
    capture_view: flag.captureView,
    measured_value_degrees: flag.measuredValue,
    excess_degrees: flag.excessDegrees,
    severity: flag.severity,
    message: flag.message,
    source_label: flag.sourceLabel,
    source_url: flag.sourceUrl,
    source_measurement_method: flag.sourceMeasurementMethod,
    measurement_version: MEASUREMENT_VERSION,
  }));
  await insertInChunks(supabase, "movement_flags", rows);
}

export async function completeMovementSession(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const { error } = await supabase
    .from("movement_sessions")
    .update({ status: "complete", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function cancelMovementSession(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const { error } = await supabase
    .from("movement_sessions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export type TrendPoint = { sessionLabel: string; value: number };

export async function loadAngleTrend(
  supabase: SupabaseClient,
  angleName: AngleName,
  patientId?: string,
  limit = 12,
): Promise<TrendPoint[]> {
  let query = supabase
    .from("movement_sessions")
    .select("id, started_at, angle_samples!inner(value_degrees, angle_name)")
    .eq("status", "complete")
    .eq("angle_samples.angle_name", angleName)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (patientId) query = query.eq("user_id", patientId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((session) => {
      const samples = (session.angle_samples ?? []) as Array<{
        value_degrees: number;
        angle_name: string;
      }>;
      const values = samples.map((sample) => Math.abs(Number(sample.value_degrees)));
      if (!values.length) return null;
      return {
        sessionLabel: new Date(session.started_at as string).toLocaleDateString(),
        value: Number(Math.max(...values).toFixed(2)),
      };
    })
    .filter((point): point is TrendPoint => point !== null)
    .reverse();
}
