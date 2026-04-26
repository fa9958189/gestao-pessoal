create table if not exists public.payment_access_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  payment_customer_id text,
  payment_subscription_id text,
  email text not null,
  plan_type text not null,
  payment_status text not null default 'pending',
  used boolean not null default false,
  used_at timestamptz null,
  auth_user_id uuid null,
  profile_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_access_tokens_customer_id
  on public.payment_access_tokens (payment_customer_id);

create index if not exists idx_payment_access_tokens_email
  on public.payment_access_tokens (email);

create index if not exists idx_payment_access_tokens_used
  on public.payment_access_tokens (used);

create index if not exists idx_payment_access_tokens_payment_status
  on public.payment_access_tokens (payment_status);

create or replace function public.set_payment_access_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_access_tokens_updated_at on public.payment_access_tokens;

create trigger trg_payment_access_tokens_updated_at
before update on public.payment_access_tokens
for each row
execute function public.set_payment_access_tokens_updated_at();
