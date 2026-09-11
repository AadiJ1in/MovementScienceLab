alter table public.movement_sessions
  drop constraint if exists movement_sessions_capture_mode_check;

alter table public.movement_sessions
  add constraint movement_sessions_capture_mode_check
  check (
    capture_mode is null or capture_mode in (
      'squat-front',
      'squat-side',
      'push-up-side',
      'shoulder-abduction-front',
      'general-front',
      'general-side'
    )
  );

insert into public.exercises (slug, name, capture_view)
values ('shoulder-abduction-front', 'Shoulder Abduction — front view', 'front')
on conflict (slug) do update
set name = excluded.name,
    capture_view = excluded.capture_view;

comment on constraint movement_sessions_capture_mode_check on public.movement_sessions is
  'Restricts persisted capture modes to application-supported exercise/view identifiers. Shoulder abduction remains a prototype measurement workflow, not a medical approval status.';
