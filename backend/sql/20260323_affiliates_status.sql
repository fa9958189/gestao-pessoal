alter table public.affiliates
  add column if not exists status text default 'active',
  add column if not exists code text;

update public.affiliates
set status = 'active'
where status is null;

alter table public.affiliates
  alter column status set default 'active';
