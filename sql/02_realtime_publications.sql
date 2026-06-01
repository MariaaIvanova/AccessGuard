-- AccessGuard — Realtime publications за live UI updates
--
-- Активира Realtime, за да може клиентът автоматично да получава:
--  - нови access_logs
--  - обновления на профила (NFC UID, fingerprint slot, status)
--  - обновления на вратата (status, heartbeat, is_locked, maintenance)

do $$
begin
  begin
    alter publication supabase_realtime add table public.access_logs;
  exception when duplicate_object then
    raise notice 'access_logs already in publication';
  end;

  begin
    alter publication supabase_realtime add table public.users;
  exception when duplicate_object then
    raise notice 'users already in publication';
  end;

  begin
    alter publication supabase_realtime add table public.doors;
  exception when duplicate_object then
    raise notice 'doors already in publication';
  end;
end $$;
