-- Garante unicidade para permitir UPSERT por auth_id em profiles_auth
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_auth_id_unique_idx
  ON public.profiles_auth (auth_id);
