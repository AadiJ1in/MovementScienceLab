create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Replace the exposed SECURITY DEFINER helper from the initial migration.
drop policy if exists "profiles read self or granted clinician" on public.profiles;
drop policy if exists "sessions read owner or granted clinician" on public.movement_sessions;
drop policy if exists "rep summaries read through session" on public.rep_summaries;
drop policy if exists "angle samples read through session" on public.angle_samples;
drop policy if exists "movement flags read through session" on public.movement_flags;
drop function if exists public.can_read_patient(uuid);

create or replace function private.can_read_patient(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = target_user_id
    or exists (
      select 1
      from public.clinician_patient_access access
      where access.clinician_id = (select auth.uid())
        and access.patient_id = target_user_id
    );
$$;

revoke execute on function private.can_read_patient(uuid) from public, anon;
grant execute on function private.can_read_patient(uuid) to authenticated;

create policy "profiles read self or granted clinician"
on public.profiles for select
to authenticated
using ((select private.can_read_patient(id)));

create policy "sessions read owner or granted clinician"
on public.movement_sessions for select
to authenticated
using ((select private.can_read_patient(user_id)));

create policy "rep summaries read through session"
on public.rep_summaries for select
to authenticated
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and (select private.can_read_patient(s.user_id))
));

create policy "angle samples read through session"
on public.angle_samples for select
to authenticated
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and (select private.can_read_patient(s.user_id))
));

create policy "movement flags read through session"
on public.movement_flags for select
to authenticated
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and (select private.can_read_patient(s.user_id))
));

-- The auth trigger needs elevated rights to insert a profile, but it must not be callable by clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Explicit API grants: signed-out clients get no movement data access.
revoke all on table public.profiles from anon;
revoke all on table public.clinician_patient_access from anon;
revoke all on table public.exercises from anon;
revoke all on table public.movement_sessions from anon;
revoke all on table public.rep_summaries from anon;
revoke all on table public.angle_samples from anon;
revoke all on table public.movement_flags from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, delete on table public.clinician_patient_access to authenticated;
grant select on table public.exercises to authenticated;
grant select, insert, update, delete on table public.movement_sessions to authenticated;
grant select, insert, update, delete on table public.rep_summaries to authenticated;
grant select, insert, update, delete on table public.angle_samples to authenticated;
grant select, insert, update, delete on table public.movement_flags to authenticated;

grant usage, select on sequence public.angle_samples_id_seq to authenticated;
