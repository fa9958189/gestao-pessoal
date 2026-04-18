-- Isolamento de dados do diário alimentar por usuário (RLS)

ALTER TABLE public.food_diary_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_diary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see only their food diary profile" ON public.food_diary_profile;
CREATE POLICY "Users can see only their food diary profile"
ON public.food_diary_profile
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their food diary profile" ON public.food_diary_profile;
CREATE POLICY "Users can insert their food diary profile"
ON public.food_diary_profile
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update only their food diary profile" ON public.food_diary_profile;
CREATE POLICY "Users can update only their food diary profile"
ON public.food_diary_profile
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete only their food diary profile" ON public.food_diary_profile;
CREATE POLICY "Users can delete only their food diary profile"
ON public.food_diary_profile
FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can see only their weight history" ON public.food_weight_history;
CREATE POLICY "Users can see only their weight history"
ON public.food_weight_history
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their weight history" ON public.food_weight_history;
CREATE POLICY "Users can insert their weight history"
ON public.food_weight_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update only their weight history" ON public.food_weight_history;
CREATE POLICY "Users can update only their weight history"
ON public.food_weight_history
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete only their weight history" ON public.food_weight_history;
CREATE POLICY "Users can delete only their weight history"
ON public.food_weight_history
FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can see only their food diary entries" ON public.food_diary_entries;
CREATE POLICY "Users can see only their food diary entries"
ON public.food_diary_entries
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their food diary entries" ON public.food_diary_entries;
CREATE POLICY "Users can insert their food diary entries"
ON public.food_diary_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update only their food diary entries" ON public.food_diary_entries;
CREATE POLICY "Users can update only their food diary entries"
ON public.food_diary_entries
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete only their food diary entries" ON public.food_diary_entries;
CREATE POLICY "Users can delete only their food diary entries"
ON public.food_diary_entries
FOR DELETE
USING (auth.uid() = user_id);
