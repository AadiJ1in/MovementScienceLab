-- Prospective research scaffold for later injury-outcome validation.
-- Prediction-time inputs are immutable after insert so future outcomes cannot
-- retroactively change the feature snapshot used at the index time.

create table if not exists public.prospective_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_session_id uuid null references public.movement_sessions(id) on delete set null,
  protocol_id text not null,
  protocol_version text not null,
  index_time timestamptz not null,
  feature_cutoff_time timestamptz not null,
  outcome_window_end timestamptz not null,
  horizon_days integer not null check (horizon_days > 0),
  feature_snapshot jsonb not null check (jsonb_typeof(feature_snapshot) = 'object'),
  camera_measurement_version text not null,
  model_version text null,
  output_kind text not null check (output_kind in ('synthetic-demo-score', 'research-risk-estimate', 'not-scored')),
  research_score double precision null check (research_score is null or (research_score >= 0 and research_score <= 1)),
  source_model_sha256 text null,
  created_at timestamptz not null default now(),
  constraint prospective_feature_cutoff_not_after_index check (feature_cutoff_time <= index_time),
  constraint prospective_window_after_index check (outcome_window_end > index_time),
  constraint synthetic_score_not_research_probability check (
    output_kind <> 'synthetic-demo-score' or research_score is null
  )
);

create table if not exists public.prospective_injury_outcomes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references public.prospective_risk_assessments(id) on delete cascade,
  injury_within_horizon boolean not null,
  injury_event_time timestamptz null,
  outcome_event_id text null,
  outcome_name text not null,
  case_definition text not null,
  adjudication_method text not null,
  adjudicated_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  constraint positive_outcome_requires_event_time check (
    injury_within_horizon = false or injury_event_time is not null
  )
);

create index if not exists prospective_risk_assessments_user_index_time_idx
  on public.prospective_risk_assessments(user_id, index_time desc);

create index if not exists prospective_risk_assessments_window_end_idx
  on public.prospective_risk_assessments(outcome_window_end);

alter table public.prospective_risk_assessments enable row level security;
alter table public.prospective_injury_outcomes enable row level security;

create or replace function private.is_clinician()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'clinician'
  );
$$;

revoke execute on function private.is_clinician() from public, anon;
grant execute on function private.is_clinician() to authenticated;

create policy "prospective assessments read owner or granted clinician"
on public.prospective_risk_assessments for select
to authenticated
using ((select private.can_read_patient(user_id)));

create policy "prospective assessments insert owner"
on public.prospective_risk_assessments for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and camera_measurement_version = 'mediapipe-2d-v1'
  and jsonb_typeof(feature_snapshot) = 'object'
  and output_kind in ('synthetic-demo-score', 'research-risk-estimate', 'not-scored')
);

-- Prediction-time rows are intentionally immutable through the authenticated
-- browser API. Corrections should create a new assessment row rather than
-- changing predictors after the future outcome is known.

create policy "prospective outcomes read through assessment"
on public.prospective_injury_outcomes for select
to authenticated
using (
  exists (
    select 1
    from public.prospective_risk_assessments a
    where a.id = assessment_id
      and (select private.can_read_patient(a.user_id))
  )
);

create policy "prospective outcomes insert assigned clinician"
on public.prospective_injury_outcomes for insert
to authenticated
with check (
  (select private.is_clinician())
  and adjudicated_by = (select auth.uid())
  and exists (
    select 1
    from public.prospective_risk_assessments a
    where a.id = assessment_id
      and exists (
        select 1
        from public.clinician_patient_access access
        where access.clinician_id = (select auth.uid())
          and access.patient_id = a.user_id
      )
  )
);

-- Outcome labels are also immutable through the browser API. If adjudication
-- changes, preserve the original record and use a controlled research process
-- rather than silently rewriting labels used for model evaluation.

revoke all on table public.prospective_risk_assessments from anon;
revoke all on table public.prospective_injury_outcomes from anon;

grant select, insert on table public.prospective_risk_assessments to authenticated;
grant select, insert on table public.prospective_injury_outcomes to authenticated;
