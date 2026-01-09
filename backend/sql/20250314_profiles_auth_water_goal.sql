alter table if exists public.profiles_auth
  add column if not exists water_goal_l numeric;
