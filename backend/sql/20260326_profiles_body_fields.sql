alter table if exists profiles
  add column if not exists current_weight numeric,
  add column if not exists height_cm numeric,
  add column if not exists target_weight numeric;
