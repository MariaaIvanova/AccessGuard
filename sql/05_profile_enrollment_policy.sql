-- =========================================================
-- AccessGuard — Profile enrollment policy for device_commands
-- Изпълни в Supabase → SQL Editor → New query
--
-- Цел: обикновен потребител да може да стартира само своето
-- NFC / fingerprint enrollment от Profile страницата, без да
-- получава admin права върху всички device commands.
-- =========================================================

-- Запазваме admin insert policy-то от предишната миграция.
-- Добавяме ВТОРА, по-тясна policy само за self-enrollment.

drop policy if exists "device_commands_insert_self_enrollment" on public.device_commands;
create policy "device_commands_insert_self_enrollment"
  on public.device_commands for insert
  to authenticated
  with check (
    command in ('enroll_nfc', 'enroll_fingerprint')
    and status = 'pending'
    and issued_by = auth.uid()
    and payload ? 'user_id'
    and payload->>'user_id' = auth.uid()::text
  );

-- =========================================================
-- ГОТОВО.
-- След изпълнение:
--   - админите продължават да могат да създават всички команди
--   - normal users могат да insert-ват само self-enrollment команди
-- =========================================================
