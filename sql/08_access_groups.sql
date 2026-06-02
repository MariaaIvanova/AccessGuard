-- AccessGuard: user groups + shared group schedules
-- Run this in Supabase SQL Editor after the previous SQL files.

create table if not exists public.access_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists group_id uuid references public.access_groups(id) on delete set null;

create table if not exists public.group_schedules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.access_groups(id) on delete cascade,
  door_id uuid not null references public.doors(id) on delete cascade,
  days_of_week int[] not null,
  open_time time not null,
  close_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_group_id on public.users(group_id);
create index if not exists idx_group_schedules_group_id on public.group_schedules(group_id);
create index if not exists idx_group_schedules_door_id on public.group_schedules(door_id);

create or replace function public.user_has_active_schedule(p_user_id uuid, p_door_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with now_bg as (
    select
      (now() at time zone 'Europe/Sofia')::time as cur_time,
      extract(isodow from now() at time zone 'Europe/Sofia')::int as cur_day
  ),
  user_group as (
    select group_id from public.users where id = p_user_id
  )
  select exists (
    select 1
    from public.schedules s, now_bg n
    where s.user_id = p_user_id
      and s.door_id = p_door_id
      and s.is_active = true
      and n.cur_day = any(s.days_of_week)
      and n.cur_time >= s.open_time
      and n.cur_time <= s.close_time
  )
  or exists (
    select 1
    from public.group_schedules gs
    join user_group ug on ug.group_id = gs.group_id
    cross join now_bg n
    where gs.door_id = p_door_id
      and gs.is_active = true
      and n.cur_day = any(gs.days_of_week)
      and n.cur_time >= gs.open_time
      and n.cur_time <= gs.close_time
  );
$$;

grant execute on function public.user_has_active_schedule(uuid, uuid) to authenticated;
