const todayString = () => new Date().toISOString().slice(0, 10);

const ensureSupabase = (supabase, context) => {
  if (!supabase) {
    throw new Error(`Supabase não disponível para ${context}.`);
  }
};

const normalizeProfileRow = (row) => {
  if (!row) {
    return {
      heightCm: null,
      weightKg: null,
      sex: null,
      age: null,
      activityLevel: null,
    };
  }

  return {
    heightCm:
      row.height_cm ?? row.heightCm ?? row.altura_cm ?? row.alturaCm ?? null,
    weightKg:
      row.weight_kg ?? row.weightKg ?? row.peso_kg ?? row.pesoKg ?? null,
    sex: row.sexo ?? row.sex ?? null,
    age: row.idade ?? row.age ?? null,
    activityLevel: row.activity_level ?? row.activityLevel ?? null,
  };
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
    ...(heightCm !== undefined && heightCm !== ''
      ? { height_cm: heightCm ?? null }
      : {}),
    ...(sex !== undefined && sex !== ''
      ? { sexo: sex ?? null }
      : {}),
    ...(age !== undefined && age !== ''
      ? { idade: age ?? null }
      : {}),
    ...(activityLevel !== undefined && activityLevel !== ''
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

      const fallbackPayload = {
        user_id: userId,
        ...(heightCm !== undefined && heightCm !== ''
          ? { height_cm: heightCm ?? null }
          : {}),
        ...(sex !== undefined && sex !== '' ? { sex: sex ?? null } : {}),
        ...(age !== undefined && age !== '' ? { age: age ?? null } : {}),
        ...(activityLevel !== undefined && activityLevel !== ''
          ? { activityLevel: activityLevel ?? null }
          : {}),
      };

      if (Object.keys(fallbackPayload).length > 1) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('food_diary_profile')
          .upsert(fallbackPayload, { onConflict: 'user_id' })
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

export async function loadProfile({ supabase, userId }) {
  ensureSupabase(supabase, 'carregar perfil');

  const { data, error } = await supabase
    .from('food_diary_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeProfileRow(data ?? null);
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
