-- Make sequence initialization atomic and tighten workflow mutation policies.
drop policy if exists "members insert sequences" on public.sequences;
drop policy if exists "owners and managers update sequences" on public.sequences;
drop policy if exists "owners and managers delete sequences" on public.sequences;
drop policy if exists "members insert sequence versions" on public.sequence_versions;
drop policy if exists "members insert sequence steps" on public.sequence_steps;
drop policy if exists "members update sequence steps" on public.sequence_steps;
drop policy if exists "members delete sequence steps" on public.sequence_steps;

create policy "sales roles insert sequences" on public.sequences
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[])
    and owner_id = (select auth.uid())
  );

create policy "sequence owners and managers update sequences" on public.sequences
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
  )
  with check (
    owner_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
  );

create policy "sequence owners and managers delete sequences" on public.sequences
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
  );

create policy "sequence owners and managers insert versions" on public.sequence_versions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.sequences sequence
      where sequence.id = sequence_id
        and sequence.status = 'draft'
        and (
          sequence.owner_id = (select auth.uid())
          or public.has_org_role(sequence.organization_id, array['super_admin', 'sales_manager']::public.member_role[])
        )
    )
  );

create policy "sequence owners and managers insert steps" on public.sequence_steps
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sequences sequence
      where sequence.id = sequence_id
        and sequence.status = 'draft'
        and (
          sequence.owner_id = (select auth.uid())
          or public.has_org_role(sequence.organization_id, array['super_admin', 'sales_manager']::public.member_role[])
        )
    )
  );

create policy "sequence owners and managers update steps" on public.sequence_steps
  for update to authenticated
  using (
    exists (
      select 1 from public.sequences sequence
      where sequence.id = sequence_id
        and sequence.status = 'draft'
        and (
          sequence.owner_id = (select auth.uid())
          or public.has_org_role(sequence.organization_id, array['super_admin', 'sales_manager']::public.member_role[])
        )
    )
  )
  with check (
    exists (
      select 1 from public.sequences sequence
      where sequence.id = sequence_id
        and sequence.status = 'draft'
        and (
          sequence.owner_id = (select auth.uid())
          or public.has_org_role(sequence.organization_id, array['super_admin', 'sales_manager']::public.member_role[])
        )
    )
  );

create policy "sequence owners and managers delete steps" on public.sequence_steps
  for delete to authenticated
  using (
    exists (
      select 1 from public.sequences sequence
      where sequence.id = sequence_id
        and sequence.status = 'draft'
        and (
          sequence.owner_id = (select auth.uid())
          or public.has_org_role(sequence.organization_id, array['super_admin', 'sales_manager']::public.member_role[])
        )
    )
  );

create or replace function public.create_sequence_with_version(
  target_organization uuid,
  target_name text,
  target_description text,
  target_category text
)
returns public.sequences
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  created_sequence public.sequences;
begin
  if actor is null or not public.has_org_role(
    target_organization,
    array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if nullif(trim(target_name), '') is null or length(trim(target_name)) > 200
     or target_category not in ('sales', 'marketing') then
    raise exception 'Invalid sequence input' using errcode = '22023';
  end if;

  insert into public.sequences (
    organization_id, owner_id, name, description, category, status, current_version
  ) values (
    target_organization, actor, trim(target_name), nullif(trim(target_description), ''),
    target_category, 'draft', 1
  ) returning * into created_sequence;

  insert into public.sequence_versions (sequence_id, version, created_by)
  values (created_sequence.id, 1, actor);

  return created_sequence;
end;
$$;
revoke all on function public.create_sequence_with_version(uuid, text, text, text) from public, anon;
grant execute on function public.create_sequence_with_version(uuid, text, text, text) to authenticated;

create or replace function public.validate_sequence_activation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    if not exists (
      select 1 from public.sequence_steps step
      where step.sequence_id = new.id and step.version = new.current_version
    ) then
      raise exception 'An active sequence requires at least one step' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.sequence_steps step
      where step.sequence_id = new.id
        and step.version = new.current_version
        and step.kind = 'email'
        and step.template_id is null
    ) then
      raise exception 'Every email step requires a template' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_sequence_activation() from public, anon, authenticated;
drop trigger if exists sequences_validate_activation on public.sequences;
create trigger sequences_validate_activation
before update of status on public.sequences
for each row execute function public.validate_sequence_activation();

-- Campaign owners may prepare drafts, while approval/scheduling remain manager actions.
drop policy if exists "members insert campaigns" on public.campaigns;
drop policy if exists "owners and managers update campaigns" on public.campaigns;
drop policy if exists "owners and managers delete campaigns" on public.campaigns;

create policy "sales roles insert campaigns" on public.campaigns
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[])
    and owner_id = (select auth.uid())
    and status = 'draft'
  );

create policy "campaign owners and managers update campaigns" on public.campaigns
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
  )
  with check (
    status not in ('sending', 'completed')
    and (
      owner_id = (select auth.uid())
      or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
    )
    and (
      status not in ('approved', 'scheduled')
      or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
    )
  );

create policy "campaign owners and managers delete campaigns" on public.campaigns
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])
  );
