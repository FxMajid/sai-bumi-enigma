begin;

alter table public.events add column is_active boolean not null default true;
alter table public.registration_uploads alter column idempotency_key drop not null;
alter table public.registration_uploads alter column payload_hash drop not null;
alter table public.registration_uploads add column session_hash text check (session_hash ~ '^[0-9a-f]{64}$');
alter table public.registration_uploads add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$');
alter table public.registration_uploads add column staging_key uuid;
alter table public.registration_uploads add constraint staging_context_complete check
  ((token_hash is null and session_hash is null and staging_key is null) or
   (token_hash is not null and session_hash is not null and staging_key is not null));
alter table public.registration_uploads add constraint staging_request_unique unique(event_id,session_hash,staging_key);

-- The old roster-bound write protocol must not remain an alternate backend path.
revoke execute on function public.prepare_registration_upload(text,integer,integer,uuid[],uuid,text,text,integer,boolean),
  public.register_event_group(text,integer,integer,uuid[],uuid,uuid,text,boolean),
  public.consume_registration_budget(text,text) from service_role;

create function public.staged_payload_hash(p_event uuid,p_number integer,p_count integer,p_ids uuid[],p_original text,p_upload uuid)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to('v2|' || public.registration_payload_hash(p_event,p_number,p_count,p_ids,p_original) || '|' || p_upload::text,'UTF8')),'hex');
$$;

create or replace function public.assert_group_integrity(p_group_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.groups%rowtype; u public.registration_uploads%rowtype; ids uuid[]; expected text;
begin
  select * into g from public.groups where id=p_group_id;
  if not found then return; end if;
  select array_agg(m.participant_id order by m.position) into ids from public.group_members m
    join public.participants p on p.event_id=m.event_id and p.id=m.participant_id and p.is_active
    where m.group_id=g.id and m.event_id=g.event_id;
  if cardinality(ids) is distinct from g.member_count
    or (select min(position) from public.group_members where group_id=g.id)<>1
    or (select max(position) from public.group_members where group_id=g.id)<>g.member_count then
    raise exception using errcode='P1001',message='INVALID_GROUP_MEMBERS';
  end if;
  select * into u from public.registration_uploads where id=g.upload_id and event_id=g.event_id;
  expected := case when u.token_hash is null then public.registration_payload_hash(g.event_id,g.group_number,g.member_count,ids,u.original_sha256)
    else public.staged_payload_hash(g.event_id,g.group_number,g.member_count,ids,u.original_sha256,u.id) end;
  if u.state is distinct from 'consumed' or u.idempotency_key is distinct from g.idempotency_key
    or u.payload_hash is distinct from g.payload_hash or u.object_path is distinct from g.photo_path
    or g.payload_hash is distinct from expected then
    raise exception using errcode='P1006',message='INVALID_GROUP_UPLOAD';
  end if;
end $$;

create function public.stage_registration_photo(p_event_slug text,p_session_hash text,p_key uuid,p_token_hash text,
  p_original_sha256 text,p_storage_sha256 text,p_byte_size integer,p_ttl_seconds integer default 3600)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; u public.registration_uploads%rowtype; uid uuid;
begin
  select * into e from public.events where slug=p_event_slug and is_active for update;
  if not found then raise exception using errcode='P1009',message='EVENT_NOT_FOUND'; end if;
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_original_sha256 is null or p_original_sha256 !~ '^[0-9a-f]{64}$' or p_storage_sha256 is null or p_storage_sha256 !~ '^[0-9a-f]{64}$'
    or p_key is null or p_byte_size is null or p_byte_size not between 1 and 3145728
    or p_ttl_seconds is null or p_ttl_seconds not between 300 and 7200 then
    raise exception using errcode='P1001',message='VALIDATION';
  end if;
  select * into u from public.registration_uploads where event_id=e.id and session_hash=p_session_hash and staging_key=p_key for update;
  if found then
    if u.token_hash<>p_token_hash or u.original_sha256<>p_original_sha256 then
      raise exception using errcode='P1005',message='IDEMPOTENCY_CONFLICT';
    end if;
    if u.state in ('deleting','deleted') or (u.state<>'consumed' and u.expires_at<=clock_timestamp()) then
      raise exception using errcode='P1007',message='UPLOAD_EXPIRED';
    end if;
  else
    if not e.registration_open then raise exception using errcode='P1003',message='REGISTRATION_CLOSED'; end if;
    uid := gen_random_uuid();
    insert into public.registration_uploads(id,event_id,session_hash,staging_key,token_hash,original_sha256,storage_sha256,object_path,content_type,byte_size,expires_at)
      values(uid,e.id,p_session_hash,p_key,p_token_hash,p_original_sha256,p_storage_sha256,e.id::text||'/'||uid::text||'.jpg','image/jpeg',p_byte_size,clock_timestamp()+make_interval(secs=>p_ttl_seconds)) returning * into u;
  end if;
  return jsonb_build_object('id',u.id,'path',u.object_path,'storageSha256',u.storage_sha256,'byteSize',u.byte_size,'expiresAt',u.expires_at,'state',u.state);
end $$;

create function public.find_staged_registration(p_event_slug text,p_number integer,p_count integer,p_ids uuid[],p_key uuid,p_token_hash text,p_session_hash text,p_consent boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e uuid; u public.registration_uploads%rowtype; g public.groups%rowtype; expected text;
begin
  select id into e from public.events where slug=p_event_slug and is_active;
  if not found then raise exception using errcode='P1009',message='EVENT_NOT_FOUND'; end if;
  select * into g from public.groups where event_id=e and idempotency_key=p_key;
  if not found then return null; end if;
  select * into u from public.registration_uploads where event_id=e and id=g.upload_id and token_hash=p_token_hash and session_hash=p_session_hash;
  if not found or p_consent is distinct from true then raise exception using errcode='P1005',message='IDEMPOTENCY_CONFLICT'; end if;
  expected:=public.staged_payload_hash(e,p_number,p_count,p_ids,u.original_sha256,u.id);
  if g.payload_hash is distinct from expected then raise exception using errcode='P1005',message='IDEMPOTENCY_CONFLICT'; end if;
  return public.registration_group_result(e,g.id);
end $$;

create function public.submit_staged_registration(p_event_slug text,p_number integer,p_count integer,p_ids uuid[],p_key uuid,p_token_hash text,p_session_hash text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; u public.registration_uploads%rowtype; g public.groups%rowtype; existing jsonb; expected text;
begin
  select * into e from public.events where slug=p_event_slug and is_active for update;
  if not found then raise exception using errcode='P1009',message='EVENT_NOT_FOUND'; end if;
  if p_key is null then raise exception using errcode='P1001',message='VALIDATION'; end if;
  existing:=public.find_staged_registration(p_event_slug,p_number,p_count,p_ids,p_key,p_token_hash,p_session_hash,p_consent);
  if existing is not null then return existing; end if;
  perform public.assert_registration_input(e.id,p_number,p_count,p_ids,p_consent);
  select * into u from public.registration_uploads where event_id=e.id and token_hash=p_token_hash and session_hash=p_session_hash for update;
  if not found or u.state not in ('validated','consumed') or u.validated_at is null then
    raise exception using errcode='P1006',message='INVALID_UPLOAD';
  end if;
  if u.state='consumed' then raise exception using errcode='P1002',message='UPLOAD_ALREADY_CLAIMED'; end if;
  if u.expires_at<=clock_timestamp() then raise exception using errcode='P1007',message='UPLOAD_EXPIRED'; end if;
  if not exists(select 1 from storage.objects where bucket_id='sai-bumi-team-photos' and name=u.object_path
    and metadata->>'mimetype'=u.content_type and (metadata->>'size')::bigint=u.byte_size) then
    raise exception using errcode='P1006',message='INVALID_UPLOAD';
  end if;
  expected:=public.staged_payload_hash(e.id,p_number,p_count,p_ids,u.original_sha256,u.id);
  update public.registration_uploads set idempotency_key=p_key,payload_hash=expected,state='consumed',consumed_at=clock_timestamp() where id=u.id;
  insert into public.groups(event_id,group_number,member_count,photo_path,upload_id,idempotency_key,payload_hash)
    values(e.id,p_number,p_count,u.object_path,u.id,p_key,expected) returning * into g;
  insert into public.group_members(event_id,group_id,participant_id,position)
    select e.id,g.id,item.id,item.position::integer from unnest(p_ids) with ordinality item(id,position);
  perform public.assert_group_integrity(g.id);
  return public.registration_group_result(e.id,g.id);
exception when unique_violation then raise exception using errcode='P1002',message='CONFLICT';
end $$;

-- Separate committed RPC call: failed submissions must still consume their budget.
create function public.consume_registration_request_budget(p_event_slug text,p_actor_hash text,p_operation text,p_actor_limit integer,p_global_limit integer,p_window_seconds integer,p_retention_seconds integer)
returns void language plpgsql security definer set search_path='' as $$
declare e uuid; w timestamptz; n integer;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' or p_operation not in ('upload','submit') or p_operation is null
    or p_actor_limit not between 1 and 10000 or p_actor_limit is null or p_global_limit not between 1 and 100000 or p_global_limit is null
    or p_window_seconds not between 10 and 3600 or p_window_seconds is null
    or p_retention_seconds not between 3600 and 604800 or p_retention_seconds is null then
    raise exception using errcode='P1001',message='VALIDATION';
  end if;
  select id into e from public.events where slug=p_event_slug and is_active;
  if not found then raise exception using errcode='P1009',message='EVENT_NOT_FOUND'; end if;
  w:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  insert into public.registration_rate_limits values(e,p_operation||':global',w,1)
    on conflict(event_id,bucket_key,window_start) do update set attempts=public.registration_rate_limits.attempts+1 returning attempts into n;
  if n>p_global_limit then raise exception using errcode='P1029',message='RATE_LIMITED'; end if;
  insert into public.registration_rate_limits values(e,p_operation||':'||p_actor_hash,w,1)
    on conflict(event_id,bucket_key,window_start) do update set attempts=public.registration_rate_limits.attempts+1 returning attempts into n;
  if n>p_actor_limit then raise exception using errcode='P1029',message='RATE_LIMITED'; end if;
  delete from public.registration_rate_limits where event_id=e and window_start<clock_timestamp()-make_interval(secs=>p_retention_seconds);
end $$;

create or replace function public.registration_photo_path(p_event_slug text,p_group_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select g.photo_path from public.groups g join public.events e on e.id=g.event_id and e.is_active
    join public.registration_uploads u on u.id=g.upload_id and u.event_id=g.event_id and u.state='consumed'
    where e.slug=p_event_slug and g.id=p_group_id;
$$;

create function public.claim_staged_upload_cleanup(p_event_slug text,p_limit integer,p_grace_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; result jsonb;
begin
  if p_grace_seconds is null or p_grace_seconds not between 60 and 86400 then raise exception using errcode='P1001',message='VALIDATION'; end if;
  select id into e from public.events where slug=p_event_slug for update;
  if not found then raise exception using errcode='P1009',message='EVENT_NOT_FOUND'; end if;
  with candidates as(select u.id from public.registration_uploads u where u.event_id=e and u.state in ('pending','validated','deleting')
    and u.expires_at+make_interval(secs=>p_grace_seconds)<=clock_timestamp()
    and not exists(select 1 from public.groups g where g.upload_id=u.id)
    order by u.expires_at limit least(greatest(coalesce(p_limit,5),1),50) for update),
  claimed as(update public.registration_uploads u set state='deleting' from candidates c where u.id=c.id returning u.id,u.object_path)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',object_path)),'[]'::jsonb) into result from claimed;
  return result;
end $$;
revoke execute on function public.claim_expired_registration_uploads(text,integer) from service_role;

create function public.prune_registration_budgets(p_event_slug text,p_retention_seconds integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_retention_seconds is null or p_retention_seconds not between 3600 and 604800 then raise exception using errcode='P1001',message='VALIDATION'; end if;
  delete from public.registration_rate_limits r using public.events e where e.id=r.event_id and e.slug=p_event_slug
    and r.window_start<clock_timestamp()-make_interval(secs=>p_retention_seconds);
end $$;

revoke execute on function public.staged_payload_hash(uuid,integer,integer,uuid[],text,uuid),
  public.stage_registration_photo(text,text,uuid,text,text,text,integer,integer),
  public.find_staged_registration(text,integer,integer,uuid[],uuid,text,text,boolean),
  public.submit_staged_registration(text,integer,integer,uuid[],uuid,text,text,boolean),
  public.consume_registration_request_budget(text,text,text,integer,integer,integer,integer),
  public.claim_staged_upload_cleanup(text,integer,integer),public.prune_registration_budgets(text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.stage_registration_photo(text,text,uuid,text,text,text,integer,integer),
  public.find_staged_registration(text,integer,integer,uuid[],uuid,text,text,boolean),
  public.submit_staged_registration(text,integer,integer,uuid[],uuid,text,text,boolean),
  public.consume_registration_request_budget(text,text,text,integer,integer,integer,integer),
  public.claim_staged_upload_cleanup(text,integer,integer),public.prune_registration_budgets(text,integer)
  to service_role;

create or replace function public.registration_snapshot(p_event_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (select id, registration_open from public.events where slug = p_event_slug and is_active),
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


commit;
