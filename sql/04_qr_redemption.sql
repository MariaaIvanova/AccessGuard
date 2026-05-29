-- AccessGuard — QR redemption flow
--
-- Гост сканира QR с телефон, отваря публичен URL, web страницата вика тези
-- функции, bridge получава unlock команда. Функциите са SECURITY DEFINER,
-- сигурността се осигурява от 122-битовия UUID токен.

alter table public.temp_access
  add column if not exists guest_name text;

comment on column public.temp_access.guest_name is 'Име на госта за QR достъп';

-- Добавя 'qr' в access_method enum-а ако още не съществува.
do $$
declare
  v_enum_name text;
begin
  select udt_name into v_enum_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'access_logs' and column_name = 'method';

  if v_enum_name is not null and not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = v_enum_name and e.enumlabel = 'qr'
  ) then
    execute format('alter type public.%I add value if not exists ''qr''', v_enum_name);
  end if;
end $$;

create or replace function public.is_door_in_maintenance(p_door public.doors)
returns boolean
language plpgsql
stable
as $$
declare
  v_now_min int;
  v_start_min int;
  v_end_min int;
begin
  if not coalesce(p_door.maintenance_enabled, false) then
    return false;
  end if;
  v_now_min := extract(hour from now()) * 60 + extract(minute from now());
  v_start_min := extract(hour from p_door.maintenance_start) * 60 + extract(minute from p_door.maintenance_start);
  v_end_min := extract(hour from p_door.maintenance_end) * 60 + extract(minute from p_door.maintenance_end);
  if v_start_min <= v_end_min then
    return v_now_min between v_start_min and v_end_min;
  else
    return v_now_min >= v_start_min or v_now_min <= v_end_min;
  end if;
end;
$$;

create or replace function public.get_qr_access_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp record;
  v_door record;
begin
  select * into v_temp from public.temp_access where qr_code = p_token;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;
  if v_temp.is_used then
    return jsonb_build_object('valid', false, 'reason', 'used',
      'guest_name', v_temp.guest_name);
  end if;
  if now() < v_temp.valid_from then
    return jsonb_build_object('valid', false, 'reason', 'not_yet',
      'guest_name', v_temp.guest_name, 'valid_from', v_temp.valid_from);
  end if;
  if now() > v_temp.valid_until then
    return jsonb_build_object('valid', false, 'reason', 'expired',
      'guest_name', v_temp.guest_name, 'valid_until', v_temp.valid_until);
  end if;

  select * into v_door from public.doors where id = v_temp.door_id;
  if v_door.is_locked then
    return jsonb_build_object('valid', false, 'reason', 'emergency_lock',
      'guest_name', v_temp.guest_name);
  end if;
  if public.is_door_in_maintenance(v_door) then
    return jsonb_build_object('valid', false, 'reason', 'maintenance',
      'guest_name', v_temp.guest_name);
  end if;

  return jsonb_build_object(
    'valid', true,
    'door_name', v_door.name,
    'guest_name', v_temp.guest_name,
    'valid_until', v_temp.valid_until
  );
end;
$$;

create or replace function public.redeem_qr_access(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp record;
  v_door record;
  v_command_id uuid;
begin
  select * into v_temp from public.temp_access where qr_code = p_token for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;
  if v_temp.is_used then
    return jsonb_build_object('success', false, 'reason', 'used');
  end if;
  if now() < v_temp.valid_from then
    return jsonb_build_object('success', false, 'reason', 'not_yet');
  end if;
  if now() > v_temp.valid_until then
    return jsonb_build_object('success', false, 'reason', 'expired');
  end if;

  select * into v_door from public.doors where id = v_temp.door_id;
  if v_door.is_locked then
    return jsonb_build_object('success', false, 'reason', 'emergency_lock');
  end if;
  if public.is_door_in_maintenance(v_door) then
    return jsonb_build_object('success', false, 'reason', 'maintenance');
  end if;
  if v_door.device_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_device');
  end if;

  update public.temp_access set is_used = true where id = v_temp.id;

  insert into public.device_commands (door_id, command, payload, status)
  values (
    v_door.id,
    'unlock',
    jsonb_build_object(
      'duration_ms', 3000,
      'message', coalesce(v_temp.guest_name, 'Гост')
    ),
    'pending'
  )
  returning id into v_command_id;

  insert into public.access_logs (door_id, method, result, direction)
  values (v_door.id, 'qr', 'granted', 'in');

  return jsonb_build_object(
    'success', true,
    'command_id', v_command_id,
    'message', 'Вратата се отваря',
    'guest_name', v_temp.guest_name
  );
end;
$$;

grant execute on function public.get_qr_access_info(text) to anon, authenticated;
grant execute on function public.redeem_qr_access(text) to anon, authenticated;

alter table public.temp_access enable row level security;

drop policy if exists "temp_access_admin_all" on public.temp_access;
create policy "temp_access_admin_all"
  on public.temp_access for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
