-- Read-only verification; adjust this slug if using another event.
select id, slug, registration_open, starts_on, ends_on
from public.events where slug = 'the-sai-bumi-enigma-2026';

select public.registration_snapshot('the-sai-bumi-enigma-2026')->'statistics' as statistics;

select e.slug, g.group_number, g.member_count, count(m.participant_id) as actual_members,
  bool_and(p.is_active) as all_members_active
from public.groups g join public.events e on e.id = g.event_id
join public.group_members m on m.group_id = g.id and m.event_id = g.event_id
join public.participants p on p.id = m.participant_id and p.event_id = m.event_id
group by e.slug, g.id order by e.slug, g.group_number;

select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname in ('events','participants','groups','group_members','registration_uploads','registration_rate_limits');

-- Legacy prepare/register RPCs must have backend_execute=false after migration 03.
select p.oid::regprocedure as function,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') as backend_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('registration_snapshot','prepare_registration_upload','register_event_group',
  'validate_registration_upload','submit_staged_registration','find_staged_registration','consume_registration_request_budget','registration_photo_path',
  'stage_registration_photo','claim_staged_upload_cleanup','prune_registration_budgets','finish_registration_upload_cleanup');

select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='sai-bumi-team-photos';
select state, count(*) from public.registration_uploads group by state;
