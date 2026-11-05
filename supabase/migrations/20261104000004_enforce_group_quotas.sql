-- 20261104000004_enforce_group_quotas.sql
-- Enforce team size quotas: 9-member teams max 3 groups, 8-member teams max 1 group.

create or replace function public.assert_registration_input(p_event_id uuid, p_number integer, p_count integer, p_ids uuid[], p_consent boolean)
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
  if p_count = 8 and (select count(*) from public.groups where event_id = p_event_id and member_count = 8) >= 1 then
    raise exception using errcode = 'P1002', message = 'QUOTA_EXCEEDED_8';
  end if;
  if p_count = 9 and (select count(*) from public.groups where event_id = p_event_id and member_count = 9) >= 3 then
    raise exception using errcode = 'P1002', message = 'QUOTA_EXCEEDED_9';
  end if;
end $$;

