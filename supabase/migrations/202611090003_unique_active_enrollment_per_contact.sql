-- Prevent the same contact from being enrolled in multiple active sequences in one workspace.
create unique index if not exists seq_enrollments_one_active_per_contact
  on public.sequence_enrollments (organization_id, contact_id)
  where state in ('pending', 'active', 'waiting', 'sending', 'paused');
