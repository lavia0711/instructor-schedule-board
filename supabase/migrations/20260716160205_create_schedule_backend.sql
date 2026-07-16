create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'instructor');
create type public.schedule_kind as enum (
  'lecture',
  'assistant',
  'office',
  'off',
  'other'
);
create type public.schedule_status as enum ('confirmed', 'pending', 'cancelled');
create type public.schedule_source as enum ('manual', 'excel');

create table public.instructors (
  name text primary key check (length(trim(name)) between 1 and 80),
  color text not null default '#2563eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'instructor',
  instructor_name text references public.instructors(name)
    on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  start_time time,
  end_time time,
  instructor text not null references public.instructors(name)
    on update cascade on delete restrict,
  region text,
  venue text,
  session text,
  topic text,
  kind public.schedule_kind not null,
  status public.schedule_status not null default 'confirmed',
  note text,
  parent_schedule_id uuid references public.schedules(id) on delete set null,
  arrival_minutes integer not null default 0
    check (arrival_minutes in (0, 15, 30, 45, 60)),
  source public.schedule_source not null default 'manual',
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  constraint schedule_time_pair check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint assistant_requires_parent check (
    kind <> 'assistant' or parent_schedule_id is not null
  )
);

create table public.workspace_settings (
  id text primary key default 'default' check (id = 'default'),
  kind_colors jsonb not null default jsonb_build_object(
    'lecture', '#2563eb',
    'assistant', '#8b5cf6',
    'office', '#0f9f88',
    'off', '#64748b',
    'other', '#d97706'
  ),
  lecture_keywords text[] not null default array['제미나이', '클로드']::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.workspace_settings (id)
values ('default')
on conflict (id) do nothing;

create index schedules_date_idx on public.schedules (schedule_date);
create index schedules_instructor_date_idx
  on public.schedules (instructor, schedule_date);
create index schedules_parent_idx
  on public.schedules (parent_schedule_id)
  where parent_schedule_id is not null;
create index instructors_sort_order_idx
  on public.instructors (sort_order, name);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.touch_schedule_modified_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modified_at = now();
  new.updated_by = (select auth.uid());
  return new;
end;
$$;

create trigger instructors_touch_updated_at
before update on public.instructors
for each row execute function private.touch_updated_at();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger workspace_settings_touch_updated_at
before update on public.workspace_settings
for each row execute function private.touch_updated_at();

create trigger schedules_touch_modified_at
before update on public.schedules
for each row execute function private.touch_schedule_modified_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, email, display_name)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    );
$$;

create or replace function private.current_instructor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select instructor_name
  from public.profiles
  where id = (select auth.uid());
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.current_instructor_name() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_instructor_name() to authenticated;

alter table public.instructors enable row level security;
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.workspace_settings enable row level security;

create policy "staff can read instructors"
on public.instructors for select
to authenticated
using (true);

create policy "admins can insert instructors"
on public.instructors for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins can update instructors"
on public.instructors for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins can delete instructors"
on public.instructors for delete
to authenticated
using ((select private.is_admin()));

create policy "users can read their profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy "admins can insert profiles"
on public.profiles for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins can update profiles"
on public.profiles for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins can delete profiles"
on public.profiles for delete
to authenticated
using ((select private.is_admin()));

create policy "staff can read schedules"
on public.schedules for select
to authenticated
using (true);

create policy "admins and owners can insert schedules"
on public.schedules for insert
to authenticated
with check (
  (select private.is_admin())
  or instructor = (select private.current_instructor_name())
);

create policy "admins and owners can update schedules"
on public.schedules for update
to authenticated
using (
  (select private.is_admin())
  or instructor = (select private.current_instructor_name())
)
with check (
  (select private.is_admin())
  or instructor = (select private.current_instructor_name())
);

create policy "admins can delete schedules"
on public.schedules for delete
to authenticated
using ((select private.is_admin()));

create policy "staff can read workspace settings"
on public.workspace_settings for select
to authenticated
using (true);

create policy "admins can update workspace settings"
on public.workspace_settings for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on table public.instructors from anon;
revoke all on table public.profiles from anon;
revoke all on table public.schedules from anon;
revoke all on table public.workspace_settings from anon;

grant select, insert, update, delete on table public.instructors to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.schedules to authenticated;
grant select, update on table public.workspace_settings to authenticated;
grant select, insert, update, delete on table public.instructors to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.schedules to service_role;
grant select, insert, update, delete on table public.workspace_settings to service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'schedules'
    ) then
      execute 'alter publication supabase_realtime add table public.schedules';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'instructors'
    ) then
      execute 'alter publication supabase_realtime add table public.instructors';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workspace_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.workspace_settings';
    end if;
  end if;
end;
$$;
