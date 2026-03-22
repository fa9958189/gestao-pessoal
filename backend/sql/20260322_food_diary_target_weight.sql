alter table public.food_diary_profile
  add column if not exists target_weight_kg numeric;
