alter table if exists public.workout_routines
add column if not exists muscle_config jsonb default '[]'::jsonb;
