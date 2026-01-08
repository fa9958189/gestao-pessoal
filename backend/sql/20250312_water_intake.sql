create table if not exists public.water_intake (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  amount_ml int not null,
  created_at timestamptz default now()
);

create index if not exists water_intake_user_date_idx
  on public.water_intake (user_id, date);
