alter table if exists public.profiles
  add column if not exists goal_type text default 'maintain',
  add column if not exists calorie_goal numeric,
  add column if not exists protein_goal numeric,
  add column if not exists water_goal_l numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_goal_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_goal_type_check
      check (goal_type in ('lose_weight', 'maintain', 'gain_muscle'));
  end if;
end
$$;
