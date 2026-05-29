-- =========================================================
-- AccessGuard — Dashboard remote control policy
-- Изпълни в Supabase → SQL Editor → New query
--
-- Цел: dashboard-ът да може да праща реални hardware команди
-- през device_commands, вместо само да променя UI/DB state.
-- =========================================================

-- Админите вече имат пълен insert достъп чрез
-- "device_commands_insert_admin". Тази policy е само за
-- dashboard remote control команди.

drop policy if exists "device_commands_insert_dashboard_remote" on public.device_commands;
create policy "device_commands_insert_dashboard_remote"
  on public.device_commands for insert
  to authenticated
  with check (
    command in ('unlock', 'relock')
    and status = 'pending'
    and issued_by = auth.uid()
  );

-- =========================================================
-- ГОТОВО.
-- След изпълнение:
--   - normal users могат да пращат dashboard unlock/relock
--   - admin users продължават да могат да пращат всички команди
-- =========================================================
