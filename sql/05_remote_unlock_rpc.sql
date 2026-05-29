-- AccessGuard — Remote unlock/close RPCs
--
-- Атомарна сървър-side валидация за дистанционно отваряне и затваряне на врата
-- от уеб приложението. Резултатът е запис в access_logs и команда в
-- device_commands, която bridge-ът подава по MQTT към ESP32.


create or replace function public.user_has_active_schedule(p_user_id uuid, p_door_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_iso_dow int;
  v_now_min int;
  v_count int;
begin
  v_iso_dow := case extract(dow from now())::int
                 when 0 then 7
                 else extract(dow from now())::int
               end;
  v_now_min := extract(hour from now()) * 60 + extract(minute from now());

  select count(*) into v_count
  from public.schedules s
  where s.user_id = p_user_id
    and s.door_id = p_door_id
    and s.is_active = true
    and v_iso_dow = any(s.days_of_week)
    and (extract(hour from s.open_time) * 60 + extract(minute from s.open_time)) <= v_now_min
    and v_now_min < (extract(hour from s.close_time) * 60 + extract(minute from s.close_time));

  return v_count > 0;
end;
$$;

create or replace function public.request_remote_unlock(p_door_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user record;
  v_door record;
  v_command_id uuid;
  v_is_admin boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select * into v_user from public.users where id = v_user_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_profile');
  end if;
  if v_user.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'inactive_user');
  end if;
  if coalesce(v_user.is_blacklisted, false) then
    return jsonb_build_object('success', false, 'reason', 'blacklisted');
  end if;
  if v_user.pin_hash is null or v_user.pin_hash <> p_pin then
    return jsonb_build_object('success', false, 'reason', 'wrong_pin');
  end if;

  v_is_admin := (v_user.role = 'admin');

  select * into v_door from public.doors where id = p_door_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_door');
  end if;
  if v_door.is_locked then
    return jsonb_build_object('success', false, 'reason', 'emergency_lock');
  end if;
  if public.is_door_in_maintenance(v_door) then
    return jsonb_build_object('success', false, 'reason', 'maintenance');
  end if;
  if v_door.device_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_device');
  end if;

  if not v_is_admin and not public.user_has_active_schedule(v_user_id, v_door.id) then
    return jsonb_build_object('success', false, 'reason', 'no_schedule');
  end if;

  insert into public.access_logs (user_id, door_id, method, result, direction)
  values (v_user_id, v_door.id, 'remote', 'granted', 'in');

  insert into public.device_commands (door_id, command, payload, status, issued_by)
  values (
    v_door.id,
    'unlock',
    jsonb_build_object(
      'duration_ms', 3000,
      'message', concat(v_user.first_name, ' ', v_user.last_name)
    ),
    'pending',
    v_user_id
  )
  returning id into v_command_id;

  return jsonb_build_object(
    'success', true,
    'command_id', v_command_id,
    'message', 'Вратата се отваря'
  );
end;
$$;

create or replace function public.request_remote_close(p_door_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user record;
  v_door record;
  v_command_id uuid;
  v_is_admin boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select * into v_user from public.users where id = v_user_id;
  if not found or v_user.status <> 'active' or coalesce(v_user.is_blacklisted, false) then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  v_is_admin := (v_user.role = 'admin');

  select * into v_door from public.doors where id = p_door_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_door');
  end if;
  if v_door.device_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_device');
  end if;

  if not v_is_admin and not public.user_has_active_schedule(v_user_id, v_door.id) then
    return jsonb_build_object('success', false, 'reason', 'no_schedule');
  end if;

  insert into public.access_logs (user_id, door_id, method, result, direction)
  values (v_user_id, v_door.id, 'remote', 'granted', 'out');

  insert into public.device_commands (door_id, command, payload, status, issued_by)
  values (v_door.id, 'relock', '{}'::jsonb, 'pending', v_user_id)
  returning id into v_command_id;

  return jsonb_build_object('success', true, 'command_id', v_command_id);
end;
$$;

grant execute on function public.request_remote_unlock(uuid, text) to authenticated;
grant execute on function public.request_remote_close(uuid) to authenticated;
grant execute on function public.user_has_active_schedule(uuid, uuid) to authenticated;
