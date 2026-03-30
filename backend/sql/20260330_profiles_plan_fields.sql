ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS plan_type TEXT,
ADD COLUMN IF NOT EXISTS plan_start_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS plan_end_date TIMESTAMP;

UPDATE profiles
SET
  plan_type = COALESCE(plan_type, 'normal'),
  plan_start_date = COALESCE(plan_start_date, NOW())
WHERE plan_type IS NULL OR plan_start_date IS NULL;
