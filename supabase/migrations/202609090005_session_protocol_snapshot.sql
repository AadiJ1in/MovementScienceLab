alter table public.movement_sessions
  add column if not exists capture_mode text,
  add column if not exists analysis_config jsonb not null default '{}'::jsonb,
  add column if not exists measurement_version text not null default 'mediapipe-2d-v1';

alter table public.movement_sessions
  drop constraint if exists movement_sessions_capture_mode_check;

alter table public.movement_sessions
  add constraint movement_sessions_capture_mode_check
  check (
    capture_mode is null or capture_mode in (
      'squat-front',
      'squat-side',
      'push-up-side',
      'general-front',
      'general-side'
    )
  );

insert into public.exercises (slug, name, capture_view)
values
  ('general-front', 'General movement — front view', 'front'),
  ('general-side', 'General movement — side view', 'side')
on conflict (slug) do nothing;

comment on column public.movement_sessions.analysis_config is
  'Immutable-at-capture JSON snapshot of engineering settings and sourced movement-quality rule configuration used for this session.';
