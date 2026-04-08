alter table if exists public.workout_routines
add column if not exists muscle_config jsonb default '[]'::jsonb;

update public.workout_routines
set muscle_config = '[]'::jsonb
where muscle_config is null;
