alter table if exists public.workout_routines
add column if not exists exercises_by_group jsonb default '{}'::jsonb;

update public.workout_routines
set exercises_by_group = '{}'::jsonb
where exercises_by_group is null;
