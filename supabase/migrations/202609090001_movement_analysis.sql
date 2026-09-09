create extension if not exists pgcrypto;

create type public.app_role as enum ('patient', 'clinician');
create type public.session_status as enum ('recording', 'complete', 'cancelled');
create type public.flag_severity as enum ('info', 'caution', 'high');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'patient',
  display_name text,
  created_at timestamptz not null default now()
);

create table public.clinician_patient_access (
  clinician_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (clinician_id, patient_id),
  constraint clinician_not_patient check (clinician_id <> patient_id)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  capture_view text not null check (capture_view in ('front', 'side')),
  created_at timestamptz not null default now()
);

create table public.movement_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  status public.session_status not null default 'recording',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  capture_fps numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table public.rep_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.movement_sessions(id) on delete cascade,
  rep_index integer not null check (rep_index >= 1),
  started_ms numeric not null,
  ended_ms numeric not null,
  angle_summary jsonb not null default '{}'::jsonb,
  form_deviation_score numeric,
  created_at timestamptz not null default now(),
  unique(session_id, rep_index)
);

create table public.angle_samples (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.movement_sessions(id) on delete cascade,
  frame_timestamp_ms numeric not null,
  angle_name text not null,
  value_degrees numeric not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index angle_samples_session_time_idx
  on public.angle_samples(session_id, frame_timestamp_ms);

create table public.movement_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.movement_sessions(id) on delete cascade,
  rep_index integer,
  frame_timestamp_ms numeric not null,
  rule_id text not null,
  angle_name text not null,
  measured_value_degrees numeric not null,
  excess_degrees numeric not null,
  severity public.flag_severity not null,
  message text not null,
  source_label text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create index movement_flags_session_idx on public.movement_flags(session_id);

alter table public.profiles enable row level security;
alter table public.clinician_patient_access enable row level security;
alter table public.exercises enable row level security;
alter table public.movement_sessions enable row level security;
alter table public.rep_summaries enable row level security;
alter table public.angle_samples enable row level security;
alter table public.movement_flags enable row level security;

create or replace function public.can_read_patient(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = target_user_id
    or exists (
      select 1
      from public.clinician_patient_access access
      where access.clinician_id = auth.uid()
        and access.patient_id = target_user_id
    );
$$;

create policy "profiles read self or granted clinician"
on public.profiles for select
using (public.can_read_patient(id));

create policy "profiles update self"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "access visible to participants"
on public.clinician_patient_access for select
using (auth.uid() = clinician_id or auth.uid() = patient_id);

create policy "patients grant clinician access"
on public.clinician_patient_access for insert
with check (
  auth.uid() = patient_id
  and exists (select 1 from public.profiles p where p.id = clinician_id and p.role = 'clinician')
);

create policy "patients revoke clinician access"
on public.clinician_patient_access for delete
using (auth.uid() = patient_id);

create policy "exercises readable by authenticated users"
on public.exercises for select
to authenticated
using (true);

create policy "sessions read owner or granted clinician"
on public.movement_sessions for select
using (public.can_read_patient(user_id));

create policy "sessions insert owner"
on public.movement_sessions for insert
with check (auth.uid() = user_id);

create policy "sessions update owner"
on public.movement_sessions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "sessions delete owner"
on public.movement_sessions for delete
using (auth.uid() = user_id);

create policy "rep summaries read through session"
on public.rep_summaries for select
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and public.can_read_patient(s.user_id)
));

create policy "rep summaries write through owned session"
on public.rep_summaries for all
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
));

create policy "angle samples read through session"
on public.angle_samples for select
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and public.can_read_patient(s.user_id)
));

create policy "angle samples write through owned session"
on public.angle_samples for all
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
));

create policy "movement flags read through session"
on public.movement_flags for select
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and public.can_read_patient(s.user_id)
));

create policy "movement flags write through owned session"
on public.movement_flags for all
using (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.movement_sessions s
  where s.id = session_id and s.user_id = auth.uid()
));

insert into public.exercises (slug, name, capture_view)
values
  ('squat-front', 'Squat — front view', 'front'),
  ('squat-side', 'Squat — side view', 'side'),
  ('push-up-side', 'Push-up — side view', 'side')
on conflict (slug) do nothing;
