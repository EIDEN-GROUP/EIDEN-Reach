-- The frontend reads send_attempts for sequence KPIs; the authenticated
-- role must have the same SELECT privilege it already has on other tables.
grant select on public.send_attempts to authenticated;
