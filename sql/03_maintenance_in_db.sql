-- AccessGuard — Maintenance mode в базата
--
-- Премества режим на поддръжка от localStorage в doors таблицата,
-- за да се синхронизира между всички потребители.

alter table public.doors
  add column if not exists maintenance_enabled boolean default false,
  add column if not exists maintenance_start time without time zone default '23:00',
  add column if not exists maintenance_end time without time zone default '06:00';

comment on column public.doors.maintenance_enabled is 'Активен ли е режим на поддръжка';
comment on column public.doors.maintenance_start is 'Начален час на поддръжка (локално време на сървъра)';
comment on column public.doors.maintenance_end is 'Краен час. Ако end < start → нощен режим през полунощ.';
