create or replace function public.record_deal_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by, note)
  values (new.id, null, new.stage_id, (select auth.uid()), 'Deal created');

  insert into public.activity_events (
    organization_id, actor_id, contact_id, company_id, deal_id,
    event_type, summary, source
  ) values (
    new.organization_id, (select auth.uid()), new.primary_contact_id, new.company_id, new.id,
    'deal.created', 'Opportunity created', 'database_trigger'
  );
  return new;
end;
$$;
revoke all on function public.record_deal_created() from public, anon, authenticated;

create trigger deals_record_created_activity
after insert on public.deals
for each row execute function public.record_deal_created();
