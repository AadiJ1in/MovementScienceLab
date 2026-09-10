-- Make client retries safe after partial/transient network failures.
-- These keys reflect deterministic identities emitted by the capture pipeline.
-- Remove any legacy duplicates first so this forward migration can be applied to
-- a database that has already received non-idempotent client retries.

delete from public.angle_samples older
using public.angle_samples newer
where older.id < newer.id
  and older.session_id = newer.session_id
  and older.frame_timestamp_ms = newer.frame_timestamp_ms
  and older.angle_name = newer.angle_name;

delete from public.movement_flags older
using public.movement_flags newer
where older.ctid < newer.ctid
  and older.session_id = newer.session_id
  and older.rule_id = newer.rule_id
  and older.frame_timestamp_ms = newer.frame_timestamp_ms;

create unique index if not exists angle_samples_session_timestamp_angle_uidx
  on public.angle_samples(session_id, frame_timestamp_ms, angle_name);

create unique index if not exists movement_flags_session_rule_timestamp_uidx
  on public.movement_flags(session_id, rule_id, frame_timestamp_ms);

comment on index public.angle_samples_session_timestamp_angle_uidx is
  'Allows idempotent upsert of a downsampled angle trace for one session.';

comment on index public.movement_flags_session_rule_timestamp_uidx is
  'Allows idempotent upsert of explainable peak movement flags for one session.';
