-- Replace the mailbox persistence function with unambiguous local identifiers.
-- The worker is the only caller; browser roles never receive execute permission.
create or replace function public.persist_inbound_message(
  target_organization uuid,
  target_mailbox uuid,
  target_folder_provider_id text,
  target_folder_name text,
  target_special_use text,
  target_uid bigint,
  target_thread_provider_id text,
  target_provider_message_key text,
  target_rfc_message_id text,
  target_in_reply_to text,
  target_references text[],
  target_subject text,
  target_snippet text,
  target_text_body text,
  target_html_body text,
  target_received_at timestamptz,
  target_raw_headers jsonb,
  target_participants jsonb,
  target_attachments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  persisted_folder_id uuid;
  persisted_thread_id uuid;
  persisted_message_id uuid;
  participant jsonb;
  attachment jsonb;
begin
  if target_uid <= 0
     or target_folder_provider_id is null
     or target_provider_message_key is null
     or jsonb_typeof(target_raw_headers) <> 'object'
     or jsonb_typeof(target_participants) <> 'array'
     or jsonb_typeof(target_attachments) <> 'array' then
    raise exception 'Invalid mailbox message payload' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.mailbox_accounts account
    where account.id = target_mailbox
      and account.organization_id = target_organization
      and account.disconnected_at is null
  ) then
    raise exception 'Mailbox does not belong to organization' using errcode = '42501';
  end if;

  insert into public.mailbox_folders (
    mailbox_account_id, provider_folder_id, display_name, special_use,
    highest_synced_uid, last_synced_at, sync_state, last_error_code
  ) values (
    target_mailbox, target_folder_provider_id, target_folder_name,
    nullif(target_special_use, ''), target_uid, now(), 'healthy', null
  )
  on conflict (mailbox_account_id, provider_folder_id) do update
    set display_name = excluded.display_name,
        special_use = coalesce(excluded.special_use, public.mailbox_folders.special_use),
        highest_synced_uid = greatest(public.mailbox_folders.highest_synced_uid, excluded.highest_synced_uid),
        last_synced_at = now(),
        sync_state = 'healthy',
        last_error_code = null
  returning id into persisted_folder_id;

  insert into public.email_threads (
    organization_id, mailbox_account_id, provider_thread_id,
    normalized_subject, latest_message_at
  ) values (
    target_organization, target_mailbox, target_thread_provider_id,
    left(coalesce(target_subject, ''), 998), coalesce(target_received_at, now())
  )
  on conflict (mailbox_account_id, provider_thread_id)
    where provider_thread_id is not null
  do update set
    normalized_subject = excluded.normalized_subject,
    latest_message_at = greatest(
      coalesce(public.email_threads.latest_message_at, excluded.latest_message_at),
      excluded.latest_message_at
    ),
    updated_at = now()
  returning id into persisted_thread_id;

  insert into public.email_messages (
    organization_id, mailbox_account_id, thread_id, direction,
    provider_message_key, rfc_message_id, in_reply_to, references_header,
    subject, snippet, text_body, html_body, received_at, raw_headers
  ) values (
    target_organization, target_mailbox, persisted_thread_id, 'inbound',
    target_provider_message_key, target_rfc_message_id, target_in_reply_to,
    coalesce(target_references, '{}'), left(coalesce(target_subject, ''), 998),
    left(coalesce(target_snippet, ''), 320), target_text_body, target_html_body,
    target_received_at, target_raw_headers
  )
  on conflict (mailbox_account_id, provider_message_key)
    where provider_message_key is not null
  do update set
    thread_id = excluded.thread_id,
    rfc_message_id = excluded.rfc_message_id,
    in_reply_to = excluded.in_reply_to,
    references_header = excluded.references_header,
    subject = excluded.subject,
    snippet = excluded.snippet,
    text_body = excluded.text_body,
    html_body = excluded.html_body,
    received_at = excluded.received_at,
    raw_headers = excluded.raw_headers
  returning id into persisted_message_id;

  delete from public.email_message_participants item where item.message_id = persisted_message_id;
  for participant in select value from jsonb_array_elements(target_participants)
  loop
    insert into public.email_message_participants (
      message_id, organization_id, mailbox_account_id, participant_type, email_address,
      display_name, ordinal
    ) values (
      persisted_message_id, target_organization, target_mailbox,
      participant ->> 'participant_type',
      lower(participant ->> 'email_address'),
      nullif(participant ->> 'display_name', ''),
      coalesce((participant ->> 'ordinal')::integer, 0)
    );
  end loop;

  delete from public.email_attachments item where item.message_id = persisted_message_id;
  for attachment in select value from jsonb_array_elements(target_attachments)
  loop
    insert into public.email_attachments (
      message_id, organization_id, mailbox_account_id, filename,
      content_type, size_bytes, inline_content_id
    ) values (
      persisted_message_id, target_organization, target_mailbox,
      left(coalesce(attachment ->> 'filename', 'attachment'), 1024),
      left(coalesce(attachment ->> 'content_type', 'application/octet-stream'), 255),
      greatest(coalesce((attachment ->> 'size_bytes')::bigint, 0), 0),
      nullif(attachment ->> 'inline_content_id', '')
    );
  end loop;

  insert into public.email_message_locations (
    message_id, folder_id, organization_id, mailbox_account_id, provider_uid
  ) values (
    persisted_message_id, persisted_folder_id, target_organization, target_mailbox, target_uid
  )
  on conflict (folder_id, provider_uid) do update
    set message_id = excluded.message_id,
        is_deleted = false;

  update public.mailbox_accounts
  set last_sync_at = now(), connection_state = 'connected', last_error_code = null
  where id = target_mailbox and organization_id = target_organization;

  return persisted_message_id;
end;
$$;

revoke all on function public.persist_inbound_message(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text[],
  text, text, text, text, timestamptz, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_inbound_message(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text[],
  text, text, text, text, timestamptz, jsonb, jsonb, jsonb
) to service_role;
