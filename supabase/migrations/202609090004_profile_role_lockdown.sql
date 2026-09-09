-- Prevent authenticated clients from changing authorization-sensitive profile columns.
-- The existing RLS update policy still enforces id = auth.uid(); this migration also
-- narrows the SQL privilege so clients may update only display_name.
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

comment on column public.profiles.role is
  'Authorization role. Must be changed only by a trusted administrative/server path, never by the browser client.';
