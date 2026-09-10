-- Keep browser writes aligned with the application-level movement-analysis contract.
-- Legacy rows may retain nullable fields, but new authenticated writes must provide
-- a complete capture protocol and complete sourced-flag provenance.

drop policy if exists "sessions insert owner" on public.movement_sessions;

create policy "sessions insert owner with protocol"
on public.movement_sessions for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exercise_id is not null
  and capture_mode is not null
  and measurement_version = 'mediapipe-2d-v1'
  and jsonb_typeof(analysis_config) = 'object'
  and analysis_config ? 'measurementVersion'
  and analysis_config ? 'keypointVisibilityThreshold'
  and analysis_config ? 'storageIntervalMs'
  and analysis_config ? 'rules'
);

drop policy if exists "movement flags write through owned session" on public.movement_flags;

create policy "movement flags insert through owned session"
on public.movement_flags for insert
to authenticated
with check (
  exists (
    select 1
    from public.movement_sessions s
    where s.id = session_id
      and s.user_id = (select auth.uid())
  )
  and (rep_index is null or rep_index >= 1)
  and capture_view in ('front', 'side')
  and source_url ~ '^https?://'
  and length(btrim(source_measurement_method)) > 0
  and measurement_version = 'mediapipe-2d-v1'
);

create policy "movement flags update through owned session"
on public.movement_flags for update
to authenticated
using (
  exists (
    select 1
    from public.movement_sessions s
    where s.id = session_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.movement_sessions s
    where s.id = session_id
      and s.user_id = (select auth.uid())
  )
  and (rep_index is null or rep_index >= 1)
  and capture_view in ('front', 'side')
  and source_url ~ '^https?://'
  and length(btrim(source_measurement_method)) > 0
  and measurement_version = 'mediapipe-2d-v1'
);

create policy "movement flags delete through owned session"
on public.movement_flags for delete
to authenticated
using (
  exists (
    select 1
    from public.movement_sessions s
    where s.id = session_id
      and s.user_id = (select auth.uid())
  )
);
