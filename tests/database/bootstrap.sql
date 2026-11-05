-- Test cluster only: minimal Supabase roles and Storage catalog contract.
-- This is deliberately outside production migrations; not a Storage service emulator.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, metadata jsonb, unique(bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema public, storage to anon, authenticated, service_role;
-- Intentionally broad existing-project policies: migration's restrictive
-- policies must still deny all access to its dedicated bucket.
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
create policy existing_project_buckets on storage.buckets for all using (true) with check (true);
create policy existing_project_objects on storage.objects for all using (true) with check (true);
