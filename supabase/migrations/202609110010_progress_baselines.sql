create table if not exists public.progress_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  compatibility_key text not null,
  metric_key text not null,
  angle_name text not null,
  baseline_strategy text not null check (baseline_strategy in ('first_session', 'first_n')),
  baseline_session_count integer not null check (baseline_session_count >= 1),
  baseline_session_ids uuid[] not null default '{}'::uuid[],
  baseline_mean numeric not null,
  baseline_median numeric not null,
  baseline_stddev numeric not null check (baseline_stddev >= 0),
  baseline_start timestamptz not null,
  baseline_end timestamptz not null,
  measurement_version text not null,
  measurement_definition_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, compatibility_key, metric_key)
);

create index if not exists progress_baselines_user_idx
  on public.progress_baselines(user_id, baseline_end desc);

alter table public.progress_baselines enable row level security;

drop policy if exists "progress baselines read owner or granted clinician" on public.progress_baselines;
create policy "progress baselines read owner or granted clinician"
on public.progress_baselines for select
using (public.can_read_patient(user_id));

drop policy if exists "progress baselines insert owner" on public.progress_baselines;
create policy "progress baselines insert owner"
on public.progress_baselines for insert
with check (auth.uid() = user_id);

drop policy if exists "progress baselines update owner" on public.progress_baselines;
create policy "progress baselines update owner"
on public.progress_baselines for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "progress baselines delete owner" on public.progress_baselines;
create policy "progress baselines delete owner"
on public.progress_baselines for delete
using (auth.uid() = user_id);

comment on table public.progress_baselines is
  'User-selected descriptive baselines for compatible movement measurements. These values are not clinical targets or normative thresholds.';

comment on column public.progress_baselines.compatibility_key is
  'Compatibility fingerprint including exercise/capture mode, view, measurement implementation version, measurement definition version, and metric.';
