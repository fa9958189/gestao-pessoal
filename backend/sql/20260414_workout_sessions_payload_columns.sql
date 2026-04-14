alter table if exists public.workout_sessions
add column if not exists exercises_by_group jsonb default '{}'::jsonb;

update public.workout_sessions
set exercises_by_group = '{}'::jsonb
where exercises_by_group is null;

alter table if exists public.workout_sessions
add column if not exists muscle_config jsonb default '[]'::jsonb;

update public.workout_sessions
set muscle_config = '[]'::jsonb
where muscle_config is null;
