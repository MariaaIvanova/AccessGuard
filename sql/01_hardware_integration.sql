-- AccessGuard — Hardware Integration Schema
--
-- Добавя полета и таблици нужни за свързване на физическо ESP32 устройство.

alter table public.doors
  add column if not exists device_id text unique,
  add column if not exists last_heartbeat timestamptz,
  add column if not exists firmware_version text;

comment on column public.doors.device_id is 'Уникален идентификатор на ESP32 устройството (напр. esp32-door-01)';
comment on column public.doors.last_heartbeat is 'Последен heartbeat от устройството (UTC). Използва се за online/offline статус.';

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  door_id uuid references public.doors(id) on delete cascade,
  command text not null,
  payload jsonb default '{}'::jsonb,
  status text default 'pending' check (status in ('pending','sent','executed','failed','expired')),
  issued_by uuid references public.users(id),
  created_at timestamp without time zone default now(),
  sent_at timestamp without time zone,
  executed_at timestamp without time zone,
  result jsonb,
  expires_at timestamp without time zone default (now() + interval '60 seconds')
);

create index if not exists device_commands_status_idx on public.device_commands(status, created_at);
create index if not exists device_commands_door_idx on public.device_commands(door_id, created_at desc);

comment on table public.device_commands is 'Опашка от команди към физическите устройства. Bridge сървърът чете pending редове и ги публикува по MQTT.';
comment on column public.device_commands.command is 'Тип команда: unlock, relock, emergency_lock, emergency_unlock, test_led, enroll_nfc, enroll_fingerprint, reboot';

alter publication supabase_realtime add table public.device_commands;

-- Row Level Security: само админи имат директен достъп.
alter table public.device_commands enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select role = 'admin' from public.users where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "device_commands_select_admin" on public.device_commands;
create policy "device_commands_select_admin"
  on public.device_commands for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "device_commands_insert_admin" on public.device_commands;
create policy "device_commands_insert_admin"
  on public.device_commands for insert
  to authenticated
  with check (public.is_current_user_admin());

drop policy if exists "device_commands_delete_admin" on public.device_commands;
create policy "device_commands_delete_admin"
  on public.device_commands for delete
  to authenticated
  using (public.is_current_user_admin());

create or replace function public.issue_device_command(
  p_door_id uuid,
  p_command text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.device_commands (door_id, command, payload, issued_by)
  values (p_door_id, p_command, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.issue_device_command(uuid, text, jsonb) to authenticated;

-- След изпълнение задайте device_id на вашата врата:
-- update public.doors set device_id = 'esp32-door-01' where name = 'Главна врата';
