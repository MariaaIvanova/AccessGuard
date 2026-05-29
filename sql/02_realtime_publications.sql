-- AccessGuard — Realtime publications за access_logs и users
--
-- Активира Realtime, за да може клиентът автоматично да получава нови логове
-- и обновления на профила (NFC UID, fingerprint slot, status).

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
end $$;
