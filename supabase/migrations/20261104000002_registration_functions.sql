begin;

-- Versioned canonical representation: UUIDs cast to canonical lowercase text;
-- member order is significant. Hashes are computed inside Postgres, never trusted from the browser.
create function public.registration_payload_hash(p_event_id uuid, p_number integer, p_count integer, p_ids uuid[], p_photo_hash text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to('v1|' || p_event_id::text || '|' || p_number::text || '|' || p_count::text
    || '|' || array_to_string(p_ids, ',') || '|' || p_photo_hash || '|true', 'UTF8')), 'hex');
$$;

create function public.assert_group_integrity(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_group public.groups%rowtype; v_upload public.registration_uploads%rowtype; v_ids uuid[];
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then return; end if; -- Full committee cancellation is allowed, partial groups are not.
  select array_agg(m.participant_id order by m.position) into v_ids from public.group_members m
    join public.participants p on p.event_id = m.event_id and p.id = m.participant_id and p.is_active
    where m.group_id = p_group_id and m.event_id = v_group.event_id;
  if cardinality(v_ids) is distinct from v_group.member_count
    or (select min(position) from public.group_members where group_id = p_group_id) <> 1
    or (select max(position) from public.group_members where group_id = p_group_id) <> v_group.member_count then
    raise exception using errcode = 'P1001', message = 'INVALID_GROUP_MEMBERS';
  end if;
  select * into v_upload from public.registration_uploads where id = v_group.upload_id and event_id = v_group.event_id;
  if v_upload.state is distinct from 'consumed' or v_upload.idempotency_key <> v_group.idempotency_key
    or v_upload.payload_hash <> v_group.payload_hash or v_upload.object_path <> v_group.photo_path
    or v_group.payload_hash <> public.registration_payload_hash(v_group.event_id, v_group.group_number,
      v_group.member_count, v_ids, v_upload.original_sha256) then
    raise exception using errcode = 'P1006', message = 'INVALID_GROUP_UPLOAD';
  end if;
end $$;

create function public.check_group_integrity_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'groups' then
    perform public.assert_group_integrity(new.id);
    if tg_op = 'UPDATE' and old.id <> new.id then perform public.assert_group_integrity(old.id); end if;
  else
    if tg_op <> 'DELETE' then perform public.assert_group_integrity(new.group_id); end if;
    if tg_op <> 'INSERT' then perform public.assert_group_integrity(old.group_id); end if;
  end if;
  return null;
end $$;
create constraint trigger groups_complete_at_commit after insert or update on public.groups
  deferrable initially deferred for each row execute function public.check_group_integrity_trigger();
create constraint trigger members_complete_at_commit after insert or update or delete on public.group_members
  deferrable initially deferred for each row execute function public.check_group_integrity_trigger();

create function public.assert_registration_input(p_event_id uuid, p_number integer, p_count integer, p_ids uuid[], p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_number is null or p_number not between 1 and 4 or p_count is null or p_count not in (8, 9)
    or p_consent is distinct from true or cardinality(p_ids) is distinct from p_count
    or array_ndims(p_ids) is distinct from 1 or array_lower(p_ids, 1) is distinct from 1
    or (select count(distinct x) from unnest(p_ids) x) <> p_count then
    raise exception using errcode = 'P1001', message = 'VALIDATION';
  end if;
  if not (select registration_open from public.events where id = p_event_id) then
    raise exception using errcode = 'P1003', message = 'REGISTRATION_CLOSED';
  end if;
  if (select count(*) from public.participants where event_id = p_event_id and is_active and id = any(p_ids)) <> p_count then
    raise exception using errcode = 'P1004', message = 'PARTICIPANT_UNAVAILABLE';
  end if;
  if exists (select 1 from public.groups where event_id = p_event_id and group_number = p_number)
    or exists (select 1 from public.group_members where event_id = p_event_id and participant_id = any(p_ids)) then
    raise exception using errcode = 'P1002', message = 'CONFLICT';
  end if;
end $$;

-- Single SQL statement: directory, available list, groups and counts share one MVCC snapshot.
create function public.registration_snapshot(p_event_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (select id, registration_open from public.events where slug = p_event_slug),
  p as (select p.id, p.participant_code, p.full_name from public.participants p join e on e.id = p.event_id where p.is_active),
  m as (select m.* from public.group_members m join e on e.id = m.event_id),
  participant_json as (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', participant_code, 'name', full_name)
    order by lower(full_name), participant_code), '[]'::jsonb) data from p),
  available_json as (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'code', p.participant_code, 'name', p.full_name)
    order by lower(p.full_name), p.participant_code), '[]'::jsonb) data from p where not exists (select 1 from m where m.participant_id = p.id)),
  group_json as (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'groupNumber', g.group_number,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.participant_code, 'name', p.full_name) order by m.position)
      from m join p on p.id = m.participant_id where m.group_id = g.id),
    'photoUrl', '/api/groups/' || g.id::text || '/photo', 'registeredAt', g.created_at) order by g.group_number), '[]'::jsonb) data
    from public.groups g join e on e.id = g.event_id)
  select jsonb_build_object('registrationOpen', e.registration_open,
    'participants', (select data from participant_json), 'availableParticipants', (select data from available_json),
    'groups', (select data from group_json), 'statistics', jsonb_build_object(
      'total', (select count(*) from p), 'registered', (select count(*) from m join p on p.id = m.participant_id),
      'unregistered', (select count(*) from p where not exists (select 1 from m where m.participant_id = p.id)))) from e;
$$;

create function public.registration_group_result(p_event_id uuid, p_group_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'groupNumber', g.group_number,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.participant_code, 'name', p.full_name) order by m.position)
      from public.group_members m join public.participants p on p.event_id = m.event_id and p.id = m.participant_id
      where m.event_id = g.event_id and m.group_id = g.id),
    'photoUrl', '/api/groups/' || g.id::text || '/photo', 'registeredAt', g.created_at)
    from public.groups g where g.event_id = p_event_id and g.id = p_group_id;
$$;

create function public.prepare_registration_upload(p_event_slug text, p_number integer, p_count integer, p_ids uuid[],
  p_key uuid, p_original_sha256 text, p_storage_sha256 text, p_byte_size integer, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_hash text; v_group public.groups%rowtype; v_upload public.registration_uploads%rowtype; v_id uuid;
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND'; end if;
  if p_key is null or p_original_sha256 is null or p_original_sha256 !~ '^[0-9a-f]{64}$'
    or p_storage_sha256 is null or p_storage_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is null or p_byte_size not between 1 and 3145728
    or p_consent is distinct from true then
    raise exception using errcode = 'P1001', message = 'VALIDATION';
  end if;
  v_hash := public.registration_payload_hash(v_event.id, p_number, p_count, p_ids, p_original_sha256);
  select * into v_group from public.groups where event_id = v_event.id and idempotency_key = p_key;
  if found then
    if v_group.payload_hash is distinct from v_hash then raise exception using errcode = 'P1005', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('kind', 'registered', 'group', public.registration_group_result(v_event.id, v_group.id));
  end if;
  perform public.assert_registration_input(v_event.id, p_number, p_count, p_ids, p_consent);
  select * into v_upload from public.registration_uploads where event_id = v_event.id and idempotency_key = p_key for update;
  if found then
    if v_upload.payload_hash is distinct from v_hash then raise exception using errcode = 'P1005', message = 'IDEMPOTENCY_CONFLICT'; end if;
    if v_upload.state not in ('pending', 'validated') or v_upload.expires_at <= clock_timestamp() then
      raise exception using errcode = 'P1007', message = 'UPLOAD_EXPIRED';
    end if;
    -- Different normalization outputs may occur after a backend upgrade. Reuse
    -- only the original storage bytes/hash, never overwrite the shared path.
    return jsonb_build_object('kind', 'upload', 'id', v_upload.id, 'path', v_upload.object_path,
      'storageSha256', v_upload.storage_sha256, 'byteSize', v_upload.byte_size);
  end if;
  v_id := gen_random_uuid();
  insert into public.registration_uploads(id, event_id, idempotency_key, payload_hash, original_sha256,
    storage_sha256, object_path, content_type, byte_size)
    values (v_id, v_event.id, p_key, v_hash, p_original_sha256, p_storage_sha256,
      v_event.id::text || '/' || v_id::text || '.jpg', 'image/jpeg', p_byte_size)
    returning * into v_upload;
  return jsonb_build_object('kind', 'upload', 'id', v_upload.id, 'path', v_upload.object_path,
    'storageSha256', v_upload.storage_sha256, 'byteSize', v_upload.byte_size);
end $$;

create function public.validate_registration_upload(p_event_slug text, p_upload_id uuid, p_storage_sha256 text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_upload public.registration_uploads%rowtype;
begin
  select id into v_event from public.events where slug = p_event_slug for update;
  if not found then raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND'; end if;
  select * into v_upload from public.registration_uploads where id = p_upload_id and event_id = v_event for update;
  if not found or v_upload.storage_sha256 is distinct from p_storage_sha256 then
    raise exception using errcode = 'P1006', message = 'INVALID_UPLOAD';
  end if;
  if v_upload.state = 'consumed' then return; end if; -- Concurrent identical request already committed.
  if v_upload.state not in ('pending', 'validated') or v_upload.expires_at <= clock_timestamp() then
    raise exception using errcode = 'P1007', message = 'UPLOAD_EXPIRED';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'sai-bumi-team-photos' and name = v_upload.object_path
    and metadata->>'mimetype' = v_upload.content_type and (metadata->>'size')::bigint = v_upload.byte_size) then
    raise exception using errcode = 'P1006', message = 'INVALID_UPLOAD';
  end if;
  update public.registration_uploads set state = 'validated', validated_at = coalesce(validated_at, clock_timestamp()) where id = p_upload_id;
end $$;

create function public.register_event_group(p_event_slug text, p_number integer, p_count integer, p_ids uuid[],
  p_key uuid, p_upload_id uuid, p_original_sha256 text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_hash text; v_group public.groups%rowtype; v_upload public.registration_uploads%rowtype;
begin
  -- Only four groups: an event-row lock is intentionally simpler than a web of advisory locks.
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND'; end if;
  if p_key is null or p_original_sha256 is null or p_original_sha256 !~ '^[0-9a-f]{64}$' or p_consent is distinct from true then
    raise exception using errcode = 'P1001', message = 'VALIDATION';
  end if;
  v_hash := public.registration_payload_hash(v_event.id, p_number, p_count, p_ids, p_original_sha256);
  select * into v_group from public.groups where event_id = v_event.id and idempotency_key = p_key;
  if found then
    if v_group.payload_hash is distinct from v_hash then raise exception using errcode = 'P1005', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return public.registration_group_result(v_event.id, v_group.id);
  end if;
  perform public.assert_registration_input(v_event.id, p_number, p_count, p_ids, p_consent);
  select * into v_upload from public.registration_uploads where event_id = v_event.id and id = p_upload_id for update;
  if not found or v_upload.state <> 'validated' or v_upload.validated_at is null
    or v_upload.idempotency_key <> p_key or v_upload.payload_hash is distinct from v_hash
    or v_upload.original_sha256 <> p_original_sha256 then
    raise exception using errcode = 'P1006', message = 'INVALID_UPLOAD';
  end if;
  if v_upload.expires_at <= clock_timestamp() then raise exception using errcode = 'P1007', message = 'UPLOAD_EXPIRED'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'sai-bumi-team-photos' and name = v_upload.object_path
    and metadata->>'mimetype' = v_upload.content_type and (metadata->>'size')::bigint = v_upload.byte_size) then
    raise exception using errcode = 'P1006', message = 'INVALID_UPLOAD';
  end if;
  insert into public.groups(event_id, group_number, member_count, photo_path, upload_id, idempotency_key, payload_hash)
    values (v_event.id, p_number, p_count, v_upload.object_path, v_upload.id, p_key, v_hash) returning * into v_group;
  insert into public.group_members(event_id, group_id, participant_id, position)
    select v_event.id, v_group.id, item.id, item.position::integer from unnest(p_ids) with ordinality as item(id, position);
  update public.registration_uploads set state = 'consumed', consumed_at = clock_timestamp() where id = v_upload.id;
  perform public.assert_group_integrity(v_group.id);
  return public.registration_group_result(v_event.id, v_group.id);
exception when unique_violation then
  -- Entire function subtransaction rolls back; no SQL/constraint details reach the route.
  raise exception using errcode = 'P1002', message = 'CONFLICT';
end $$;

create function public.consume_registration_budget(p_event_slug text, p_actor_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_window timestamptz; v_attempts integer;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = 'P1001', message = 'VALIDATION'; end if;
  select id into v_event from public.events where slug = p_event_slug;
  if not found then raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND'; end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / 600) * 600);
  insert into public.registration_rate_limits values (v_event, 'global', v_window, 1)
    on conflict (event_id, bucket_key, window_start) do update set attempts = public.registration_rate_limits.attempts + 1
    returning attempts into v_attempts;
  if v_attempts > 80 then raise exception using errcode = 'P1029', message = 'RATE_LIMITED'; end if;
  insert into public.registration_rate_limits values (v_event, p_actor_hash, v_window, 1)
    on conflict (event_id, bucket_key, window_start) do update set attempts = public.registration_rate_limits.attempts + 1
    returning attempts into v_attempts;
  if v_attempts > 20 then raise exception using errcode = 'P1029', message = 'RATE_LIMITED'; end if;
  delete from public.registration_rate_limits where event_id = v_event and window_start < clock_timestamp() - interval '2 days';
end $$;

create function public.registration_photo_path(p_event_slug text, p_group_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select g.photo_path from public.groups g join public.events e on e.id = g.event_id
    join public.registration_uploads u on u.id = g.upload_id and u.event_id = g.event_id and u.state = 'consumed'
    where e.slug = p_event_slug and g.id = p_group_id;
$$;

create function public.claim_expired_registration_uploads(p_event_slug text, p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_result jsonb;
begin
  select id into v_event from public.events where slug = p_event_slug for update;
  if not found then raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND'; end if;
  with candidates as (select u.id from public.registration_uploads u where u.event_id = v_event
    and u.state in ('pending', 'validated', 'deleting') and u.expires_at <= clock_timestamp()
    and not exists (select 1 from public.groups g where g.upload_id = u.id)
    order by u.expires_at limit least(greatest(coalesce(p_limit, 5), 1), 50) for update),
  claimed as (update public.registration_uploads u set state = 'deleting' from candidates c where u.id = c.id returning u.id, u.object_path)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', object_path)), '[]'::jsonb) into v_result from claimed;
  return v_result;
end $$;

create function public.finish_registration_upload_cleanup(p_event_slug text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select id into v_event from public.events where slug = p_event_slug for update;
  update public.registration_uploads u set state = 'deleted' where u.event_id = v_event and u.id = any(p_ids)
    and u.state = 'deleting' and not exists (select 1 from public.groups g where g.upload_id = u.id);
end $$;

-- Every function is denied by default, including helpers/trigger functions.
revoke execute on function public.registration_payload_hash(uuid,integer,integer,uuid[],text),
  public.assert_group_integrity(uuid), public.check_group_integrity_trigger(),
  public.assert_registration_input(uuid,integer,integer,uuid[],boolean),
  public.registration_snapshot(text), public.registration_group_result(uuid,uuid),
  public.prepare_registration_upload(text,integer,integer,uuid[],uuid,text,text,integer,boolean),
  public.validate_registration_upload(text,uuid,text),
  public.register_event_group(text,integer,integer,uuid[],uuid,uuid,text,boolean),
  public.consume_registration_budget(text,text), public.registration_photo_path(text,uuid),
  public.claim_expired_registration_uploads(text,integer), public.finish_registration_upload_cleanup(text,uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.registration_snapshot(text),
  public.prepare_registration_upload(text,integer,integer,uuid[],uuid,text,text,integer,boolean),
  public.validate_registration_upload(text,uuid,text),
  public.register_event_group(text,integer,integer,uuid[],uuid,uuid,text,boolean),
  public.consume_registration_budget(text,text), public.registration_photo_path(text,uuid),
  public.claim_expired_registration_uploads(text,integer), public.finish_registration_upload_cleanup(text,uuid[])
  to service_role;

commit;
