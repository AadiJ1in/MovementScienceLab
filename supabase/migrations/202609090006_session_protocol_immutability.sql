-- RLS controls which session rows an authenticated owner may update. Column-level
-- privileges additionally prevent rewriting the capture protocol after insertion.
revoke update on table public.movement_sessions from authenticated;
grant update (status, ended_at, notes, capture_fps) on table public.movement_sessions to authenticated;

comment on column public.movement_sessions.analysis_config is
  'Capture-time protocol snapshot. Browser clients may insert it with a new session but may not update it afterward.';
comment on column public.movement_sessions.capture_mode is
  'Capture-time camera/movement mode. Immutable to browser clients after session creation.';
comment on column public.movement_sessions.measurement_version is
  'Measurement implementation identifier. Immutable to browser clients after session creation.';
