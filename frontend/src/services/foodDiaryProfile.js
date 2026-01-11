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
  sex,
  age,
  activityLevel,
  entryDate = todayString(),
}) {
  ensureSupabase(supabase, 'salvar peso');

  const profilePayload = {
    user_id: userId,
    ...(heightCm !== undefined ? { height_cm: heightCm ?? null } : {}),
    ...(sex !== undefined ? { sex: sex ?? null } : {}),
    ...(age !== undefined ? { age: age ?? null } : {}),
    ...(activityLevel !== undefined
      ? { activity_level: activityLevel ?? null }
      : {}),
  };

  let profileData = null;
  if (Object.keys(profilePayload).length > 1) {
    const { data: initialProfileData, error: profileError } = await supabase
      .from('food_diary_profile')
      .upsert(profilePayload, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();

    if (profileError) {
      const message = profileError?.message || '';
      const missingColumn =
        message.toLowerCase().includes('column') &&
        message.toLowerCase().includes('does not exist');

      if (!missingColumn) {
        throw profileError;
      }

      if (heightCm !== undefined) {
        const { data: fallbackData, error: fallbackError } = await supabase
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

        if (fallbackError) {
          throw fallbackError;
        }

        profileData = fallbackData ?? null;
      }
    } else {
      profileData = initialProfileData ?? null;
    }
  }

  let weightData = null;

  if (weightKg != null) {
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
