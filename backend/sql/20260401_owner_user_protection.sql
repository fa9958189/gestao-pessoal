ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false;

UPDATE profiles
SET is_owner = true,
    subscription_status = 'active',
    billing_status = 'paid'
WHERE email = 'gestaopessoaloficial@gmail.com';
