ALTER TABLE profiles_auth
ADD COLUMN IF NOT EXISTS trial_start_at timestamptz,
ADD COLUMN IF NOT EXISTS trial_end_at timestamptz,
ADD COLUMN IF NOT EXISTS trial_status text;
