alter table if exists public.food_weight_history
  alter column entry_date type date
  using entry_date::date;
