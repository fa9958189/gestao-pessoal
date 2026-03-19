alter table if exists public.events
add column if not exists sent boolean default false;
