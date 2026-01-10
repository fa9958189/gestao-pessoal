const todayString = () => new Date().toISOString().slice(0, 10);

const ensureSupabase = (supabase, context) => {
  if (!supabase) {
    throw new Error(`Supabase não disponível para ${context}.`);
  }
};

export async function saveGoals({
  supabase,
  userId,
  calorieGoal,
  proteinGoal,
  waterGoalL,
}) {
  ensureSupabase(supabase, 'salvar metas');

  const payload = {
    user_id: userId,
    calorie_goal: Number(calorieGoal || 0),
    protein_goal: Number(proteinGoal || 0),
    water_goal_l: Number(waterGoalL || 0),
  };

  const { data, error } = await supabase
    .from('food_diary_profile')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? payload;
}

export async function saveWeightHeight({
  supabase,
  userId,
  weightKg,
  heightCm,
  entryDate = todayString(),
}) {
  ensureSupabase(supabase, 'salvar peso');

  const { data: profileData, error: profileError } = await supabase
    .from('food_diary_profile')
    .upsert(
      {
        user_id: userId,
        height_cm: heightCm ?? null,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  let weightData = null;

  if (weightKg != null && weightKg !== '') {
    const { data, error } = await supabase
      .from('food_weight_history')
      .upsert(
        {
          user_id: userId,
          entry_date: entryDate,
          weight_kg: weightKg,
          height_cm: heightCm ?? null,
        },
        { onConflict: 'user_id,entry_date' },
      )
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    weightData = data ?? null;
  }

  return { profileData, weightData };
}

export async function loadGoals({ supabase, userId }) {
  ensureSupabase(supabase, 'carregar metas');

  const { data, error } = await supabase
    .from('food_diary_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function loadTodayWeight({ supabase, userId, entryDate = todayString() }) {
  ensureSupabase(supabase, 'carregar peso do dia');

  const { data, error } = await supabase
    .from('food_weight_history')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', entryDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
