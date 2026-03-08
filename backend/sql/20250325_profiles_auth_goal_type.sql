ALTER TABLE profiles_auth
ADD COLUMN goal_type TEXT DEFAULT 'maintain';

ALTER TABLE profiles_auth
ADD CONSTRAINT profiles_auth_goal_type_check
CHECK (goal_type IN ('lose_weight', 'maintain', 'gain_muscle'));
