ALTER TABLE profiles_auth
ADD COLUMN IF NOT EXISTS plan_type text,
ADD COLUMN IF NOT EXISTS plan_start_date date,
ADD COLUMN IF NOT EXISTS plan_end_date date;
