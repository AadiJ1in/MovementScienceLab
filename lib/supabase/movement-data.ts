import type { SupabaseClient } from "@supabase/supabase-js";
import type { AngleReading } from "@/lib/biomechanics/angles";
import type { MovementFlag } from "@/lib/biomechanics/risk-rules";

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
  if (!readings.length) return;
  const rows = readings.map((reading) => ({
    session_id: sessionId,
    frame_timestamp_ms: reading.frameTimestamp,
    angle_name: reading.angleName,
    value_degrees: reading.value,
    confidence: reading.confidence,
  }));
  const { error } = await supabase.from("angle_samples").insert(rows);
  if (error) throw error;
}

export async function saveMovementFlags(
  supabase: SupabaseClient,
  sessionId: string,
  flags: MovementFlag[],
) {
  if (!flags.length) return;
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
  const { error } = await supabase.from("movement_flags").insert(rows);
  if (error) throw error;
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
