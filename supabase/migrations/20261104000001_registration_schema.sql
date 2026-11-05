begin;

-- No event or participant seed data belongs in this production migration.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title text not null check (length(btrim(title)) between 1 and 160),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  registration_open boolean not null default false
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  participant_code text not null check (participant_code ~ '^[A-Za-z0-9_-]{1,40}$'),
  full_name text not null check (full_name = btrim(full_name) and length(full_name) between 1 and 160),
  is_active boolean not null default true,
  unique (event_id, participant_code),
  unique (event_id, id)
);
create index participants_active_event on public.participants(event_id) where is_active;
-- Prefix search indexes; the small public directory also supports client-side substring search.
create index participants_name_prefix on public.participants(event_id, lower(full_name) text_pattern_ops) where is_active;
create index participants_code_prefix on public.participants(event_id, lower(participant_code) text_pattern_ops) where is_active;

create table public.registration_uploads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  storage_sha256 text not null check (storage_sha256 ~ '^[0-9a-f]{64}$'),
  object_path text not null unique check (object_path = event_id::text || '/' || id::text || '.jpg'),
  content_type text not null check (content_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 3145728),
  state text not null default 'pending' check (state in ('pending', 'validated', 'consumed', 'deleting', 'deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  validated_at timestamptz,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check (state not in ('validated', 'consumed') or validated_at is not null),
  check (state <> 'consumed' or consumed_at is not null),
  unique (event_id, idempotency_key),
  unique (event_id, id, object_path)
);
create index registration_uploads_expiry on public.registration_uploads(event_id, expires_at) where state in ('pending', 'validated', 'deleting');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  group_number integer not null check (group_number between 1 and 4),
  member_count integer not null check (member_count in (8, 9)),
  photo_path text not null unique,
  upload_id uuid not null unique,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  publication_consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_id, id),
  unique (event_id, group_number),
  unique (event_id, idempotency_key),
  foreign key (event_id, upload_id, photo_path)
    references public.registration_uploads(event_id, id, object_path) on delete restrict
);

create table public.group_members (
  event_id uuid not null,
  group_id uuid not null,
  participant_id uuid not null,
  position integer not null check (position between 1 and 9),
  primary key (group_id, participant_id),
  unique (event_id, participant_id),
  unique (group_id, position),
  foreign key (event_id, group_id) references public.groups(event_id, id) on delete restrict,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete restrict
);

create table public.registration_rate_limits (
  event_id uuid not null references public.events(id) on delete cascade,
  bucket_key text not null check (length(bucket_key) <= 80),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (event_id, bucket_key, window_start)
);

-- No direct Data API access, including service_role table writes.
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.registration_uploads enable row level security;
alter table public.registration_rate_limits enable row level security;
revoke all on public.events, public.participants, public.groups, public.group_members,
  public.registration_uploads, public.registration_rate_limits from public, anon, authenticated, service_role;

-- Dedicated private bucket. Do not alter an existing bucket's security silently.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sai-bumi-team-photos', 'sai-bumi-team-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'sai-bumi-team-photos'
    and not public and file_size_limit = 3145728 and allowed_mime_types = array['image/jpeg']) then
    raise exception 'Dedicated photo bucket has incompatible settings; review it before migrating';
  end if;
end $$;
-- Restrictive denies also protect this bucket if the project already has broad permissive policies.
create policy sai_bumi_no_direct_objects on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'sai-bumi-team-photos') with check (bucket_id <> 'sai-bumi-team-photos');
create policy sai_bumi_no_direct_bucket on storage.buckets as restrictive for all to anon, authenticated
  using (id <> 'sai-bumi-team-photos') with check (id <> 'sai-bumi-team-photos');

-- Participant edits and all registration RPCs lock the event first, avoiding an
-- activation/registration race. Registered participants must be unassigned by an
-- explicit committee cancellation transaction before deactivation/deletion.
create function public.guard_registered_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_next_event uuid;
begin
  if tg_op = 'INSERT' then
    perform 1 from public.events where id = new.event_id for update;
    return new;
  end if;
  if tg_op = 'UPDATE' then v_next_event := new.event_id; end if;
  for v_event in select id from public.events
    where id = old.event_id or id = v_next_event order by id
  loop
    perform 1 from public.events where id = v_event for update;
  end loop;
  if exists (select 1 from public.group_members where participant_id = old.id and event_id = old.event_id) then
    if tg_op = 'DELETE' then
      raise exception using errcode = 'P1008', message = 'REGISTERED_PARTICIPANT_IMMUTABLE';
    end if;
    if not new.is_active or new.event_id <> old.event_id or new.id <> old.id then
      raise exception using errcode = 'P1008', message = 'REGISTERED_PARTICIPANT_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger participants_registration_guard before insert or update or delete on public.participants
  for each row execute function public.guard_registered_participant();
revoke execute on function public.guard_registered_participant() from public, anon, authenticated, service_role;

commit;
