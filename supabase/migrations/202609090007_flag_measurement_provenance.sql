alter table public.movement_flags
  add column if not exists capture_view text,
  add column if not exists source_measurement_method text,
  add column if not exists measurement_version text not null default 'mediapipe-2d-v1';

alter table public.movement_flags
  drop constraint if exists movement_flags_capture_view_check;

alter table public.movement_flags
  add constraint movement_flags_capture_view_check
  check (capture_view is null or capture_view in ('front', 'side'));

alter table public.movement_flags
  drop constraint if exists movement_flags_source_url_http_check;

alter table public.movement_flags
  add constraint movement_flags_source_url_http_check
  check (source_url is null or source_url ~ '^https?://');

alter table public.movement_flags
  drop constraint if exists movement_flags_source_method_nonempty_check;

alter table public.movement_flags
  add constraint movement_flags_source_method_nonempty_check
  check (source_measurement_method is null or length(btrim(source_measurement_method)) > 0);

comment on column public.movement_flags.source_measurement_method is
  'Measurement modality/method reported by the threshold source. Required by the application for new sourced rules so 3D, 2D, force-plate, or other methods are not silently treated as equivalent.';
comment on column public.movement_flags.capture_view is
  'Camera projection used by the rule (front or side). Legacy rows may be null.';
comment on column public.movement_flags.measurement_version is
  'MovementScienceLab measurement implementation version used when the flag was generated.';
