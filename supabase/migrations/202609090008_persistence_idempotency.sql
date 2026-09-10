-- Make client retries safe after partial/transient network failures.
-- These keys reflect the deterministic identities emitted by the capture pipeline.

create unique index if not exists angle_samples_session_timestamp_angle_uidx
  on public.angle_samples(session_id, frame_timestamp_ms, angle_name);

create unique index if not exists movement_flags_session_rule_timestamp_uidx
  on public.movement_flags(session_id, rule_id, frame_timestamp_ms);

comment on index public.angle_samples_session_timestamp_angle_uidx is
  'Allows idempotent upsert of a downsampled angle trace for one session.';

comment on index public.movement_flags_session_rule_timestamp_uidx is
  'Allows idempotent upsert of explainable peak movement flags for one session.';
