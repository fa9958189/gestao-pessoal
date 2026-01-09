create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day_date date not null,
  amount_ml int not null,
  created_at timestamptz default now()
);

create index if not exists hydration_logs_user_day_created_idx
  on public.hydration_logs (user_id, day_date, created_at desc);
