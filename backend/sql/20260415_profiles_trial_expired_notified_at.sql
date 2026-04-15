alter table if exists public.profiles
add column if not exists trial_expired_notified_at timestamptz;
