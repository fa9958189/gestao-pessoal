alter table public.profiles
  add column if not exists is_affiliate boolean default false,
  add column if not exists affiliate_code text;

alter table public.affiliates
  add column if not exists status text default 'active';

update public.affiliates
set status = 'active'
where status is null;
