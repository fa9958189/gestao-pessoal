create extension if not exists "pgcrypto";

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  email text null,
  whatsapp text null,
  pix_key text null,
  commission_cents integer not null default 2000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles_auth
  add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null,
  add column if not exists affiliate_code text,
  add column if not exists last_payment_at timestamptz;

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  period_month date not null,
  amount_cents integer not null,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(affiliate_id, period_month)
);
