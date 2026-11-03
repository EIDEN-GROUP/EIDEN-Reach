-- Record committed contact changes as CRM activity. This trigger is the sole
-- write path for these events; authenticated clients retain read-only access.
create or replace function public.record_contact_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_fields text[] := array[]::text[];
  activity_kind text;
  activity_summary text;
begin
  if tg_op = 'INSERT' then
    activity_kind := 'contact.created';
    activity_summary := 'Contact created';
  else
    if old.first_name is distinct from new.first_name then changed_fields := array_append(changed_fields, 'first_name'); end if;
    if old.last_name is distinct from new.last_name then changed_fields := array_append(changed_fields, 'last_name'); end if;
    if old.email is distinct from new.email then changed_fields := array_append(changed_fields, 'email'); end if;
    if old.phone is distinct from new.phone then changed_fields := array_append(changed_fields, 'phone'); end if;
    if old.job_title is distinct from new.job_title then changed_fields := array_append(changed_fields, 'job_title'); end if;
    if old.company_id is distinct from new.company_id then changed_fields := array_append(changed_fields, 'company'); end if;
    if old.lifecycle is distinct from new.lifecycle then changed_fields := array_append(changed_fields, 'lifecycle'); end if;
    if old.source is distinct from new.source then changed_fields := array_append(changed_fields, 'source'); end if;
    if old.archived_at is distinct from new.archived_at and new.archived_at is not null then
      activity_kind := 'contact.archived';
      activity_summary := 'Contact archived';
    elsif cardinality(changed_fields) > 0 then
      activity_kind := 'contact.updated';
      activity_summary := 'Contact details updated';
    else
      return new;
    end if;
  end if;

  insert into public.activity_events (
    organization_id, actor_id, contact_id, company_id, event_type,
    summary, source, metadata
  ) values (
    new.organization_id, (select auth.uid()), new.id, new.company_id,
    activity_kind, activity_summary, 'database_trigger',
    jsonb_build_object('changed_fields', to_jsonb(changed_fields))
  );
  return new;
end;
$$;
revoke all on function public.record_contact_activity() from public, anon, authenticated;

create trigger contacts_record_activity_after_insert
after insert on public.contacts
for each row execute function public.record_contact_activity();

create trigger contacts_record_activity_after_update
after update on public.contacts
for each row execute function public.record_contact_activity();
