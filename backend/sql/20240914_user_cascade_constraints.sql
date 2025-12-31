-- Ajusta todas as FKs de usuário para usar ON DELETE CASCADE
-- Executar no schema public do Postgres/Supabase
DO $$
DECLARE
  fk_targets CONSTANT jsonb = '[
    {"table":"transactions","column":"user_id"},
    {"table":"events","column":"user_id"},
    {"table":"daily_reminders","column":"user_id"},
    {"table":"daily_reminder_logs","column":"user_id"},
    {"table":"event_reminder_logs","column":"user_id"},
    {"table":"workout_routines","column":"user_id"},
    {"table":"workout_schedule","column":"user_id"},
    {"table":"workout_schedule_reminder_logs","column":"user_id"},
    {"table":"workout_templates","column":"userId"},
    {"table":"workout_sessions","column":"user_id"},
    {"table":"workout_reminders","column":"user_id"},
    {"table":"food_diary_entries","column":"user_id"},
    {"table":"food_diary_profile","column":"user_id"},
    {"table":"food_weight_history","column":"user_id"}
  ]';
  rec RECORD;
  existing_constraint text;
BEGIN
  FOR rec IN
    SELECT (value->>'table') AS table_name, (value->>'column') AS column_name
    FROM jsonb_array_elements(fk_targets) AS value
  LOOP
    -- pula se a tabela/coluna não existir
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = rec.table_name
        AND column_name = rec.column_name
    ) THEN
      CONTINUE;
    END IF;

    -- remove registros órfãos antes de aplicar a FK
    EXECUTE format(
      'DELETE FROM public.%I t WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.%I)',
      rec.table_name,
      rec.column_name
    );

    -- dropa FK existente (se houver)
    SELECT c.conname
    INTO existing_constraint
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = format(''public.%s'', rec.table_name)::regclass
      AND c.contype = ''f''
      AND a.attname = rec.column_name
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
      EXECUTE format(''ALTER TABLE public.%I DROP CONSTRAINT %I'', rec.table_name, existing_constraint);
    END IF;

    -- cria FK com ON DELETE CASCADE apontando para profiles(id)
    EXECUTE format(
      ''ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE CASCADE'',
      rec.table_name,
      format(''%s_%s_fkey'', rec.table_name, rec.column_name),
      rec.column_name
    );
  END LOOP;

  -- garante FK de profiles_auth.auth_id -> profiles.id com cascade
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles_auth'
      AND column_name = 'auth_id'
  ) THEN
    SELECT conname
    INTO existing_constraint
    FROM pg_constraint
    WHERE conrelid = 'public.profiles_auth'::regclass
      AND contype = 'f'
      AND conkey[1] = (
        SELECT attnum FROM pg_attribute WHERE attrelid = 'public.profiles_auth'::regclass AND attname = 'auth_id'
      )
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
      EXECUTE format(''ALTER TABLE public.profiles_auth DROP CONSTRAINT %I'', existing_constraint);
    END IF;

    EXECUTE ''ALTER TABLE public.profiles_auth ADD CONSTRAINT profiles_auth_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES public.profiles(id) ON DELETE CASCADE'';
  END IF;
END
$$;
