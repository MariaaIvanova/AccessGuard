-- AccessGuard — Optimistic doors.status в RPC-тата
--
-- Преди тази миграция: doors.status се обновяваше само когато ESP32 публикува
-- MQTT status съобщение. Това означаваше, че без свързано устройство UI-ът не
-- отразяваше промените от Dashboard PIN, QR гост достъп или AI команди.
--
-- След тази миграция: RPC-тата обновяват doors.status веднага атомарно. Когато
-- ESP32 потвърди по-късно, bridge ще запише същата стойност — без конфликт.

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

  -- Atomic optimistic update — UI вижда промяната веднага дори ако ESP32 не отговори
  update public.doors
     set status = 'open',
         last_opened_at = now()
   where id = v_door.id;

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

  -- Atomic optimistic update — UI вижда промяната веднага
  update public.doors
     set status = 'closed'
   where id = v_door.id;

  return jsonb_build_object('success', true, 'command_id', v_command_id);
end;
$$;

-- Същото и за QR redemption
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
    jsonb_build_object('duration_ms', 3000, 'message', coalesce(v_temp.guest_name, 'Гост')),
    'pending'
  )
  returning id into v_command_id;

  insert into public.access_logs (door_id, method, result, direction)
  values (v_door.id, 'qr', 'granted', 'in');

  -- Optimistic update
  update public.doors
     set status = 'open',
         last_opened_at = now()
   where id = v_door.id;

  return jsonb_build_object(
    'success', true,
    'command_id', v_command_id,
    'message', 'Вратата се отваря',
    'guest_name', v_temp.guest_name
  );
end;
$$;
