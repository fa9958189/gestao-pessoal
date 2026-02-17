alter table public.events
add column if not exists status text default 'active';
