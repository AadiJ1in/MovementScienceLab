import type { SupabaseClient } from "@supabase/supabase-js";
import type { AngleName, AngleReading } from "@/lib/biomechanics/angles";
import type { MovementFlag } from "@/lib/biomechanics/risk-rules";
import type { PersistableRepSummary } from "@/lib/biomechanics/session-aggregation";

const INSERT_CHUNK_SIZE = 500;

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

export async function createMovementSession(
  supabase: SupabaseClient,
  userId: string,
  exerciseId?: string,
) {
  const { data, error } = await supabase
    .from("movement_sessions")
    .insert({ user_id: userId, exercise_id: exerciseId ?? null, status: "recording" })
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
  const rows = flags.map((flag) => ({
    session_id: sessionId,
    rep_index: flag.repIndex ?? null,
    frame_timestamp_ms: flag.frameTimestamp,
    rule_id: flag.ruleId,
    angle_name: flag.angleName,
    measured_value_degrees: flag.measuredValue,
    excess_degrees: flag.excessDegrees,
    severity: flag.severity,
    message: flag.message,
    source_label: flag.sourceLabel,
    source_url: flag.sourceUrl ?? null,
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
    .select("id, started_at, angle_samples(value_degrees, angle_name)")
    .eq("status", "complete")
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
      const values = samples
        .filter((sample) => sample.angle_name === angleName)
        .map((sample) => Math.abs(Number(sample.value_degrees)));
      if (!values.length) return null;
      return {
        sessionLabel: new Date(session.started_at as string).toLocaleDateString(),
        value: Number(Math.max(...values).toFixed(2)),
      };
    })
    .filter((point): point is TrendPoint => point !== null)
    .reverse();
}
