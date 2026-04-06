ALTER TABLE profiles_auth 
ADD COLUMN IF NOT EXISTS status_acesso TEXT DEFAULT 'ativo';

UPDATE profiles_auth
SET status_acesso = 'ativo'
WHERE status_acesso IS NULL;
