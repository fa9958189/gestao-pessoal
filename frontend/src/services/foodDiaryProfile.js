const todayString = () => new Date().toISOString().slice(0, 10);

const ensureSupabase = (supabase, context) => {
  if (!supabase) {
    throw new Error(`Supabase não disponível para ${context}.`);
  }
};

const normalizeSexForUi = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'masculino') return 'Masculino';
  if (normalized === 'feminino') return 'Feminino';
  return String(value);
};

const normalizeActivityForUi = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'sedentario' || normalized === 'sedentário') {
    return 'Sedentário';
  }
  if (normalized === 'leve') return 'Leve';
  if (normalized === 'moderado') return 'Moderado';
  if (normalized === 'alto') return 'Alto';
  if (normalized === 'muito alto' || normalized === 'muito-alto') {
    return 'Muito alto';
  }
  return String(value);
};

const normalizeSexForStorage = (value) => {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'masculino' || normalized === 'feminino') {
    return normalized;
  }
  if (normalized === 'masc') return 'masculino';
  if (normalized === 'fem') return 'feminino';
  return normalized;
};

const normalizeActivityForStorage = (value) => {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'sedentario') return 'sedentário';
  if (normalized === 'muito-alto') return 'muito alto';
  return normalized;
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
      row.height_cm ?? row.altura_cm ?? row.heightCm ?? row.alturaCm ?? null,
    weightKg:
      row.current_weight_kg ??
      row.weight_kg ??
      row.peso_kg ??
      row.pesoKg ??
      row.currentWeightKg ??
      null,
    sex: normalizeSexForUi(row.sex ?? row.sexo ?? null),
    age: row.age ?? row.idade ?? null,
    activityLevel: normalizeActivityForUi(
      row.activity_level ??
        row.nivel_atividade ??
        row.nivelAtividade ??
        row.activityLevel ??
        null,
    ),
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

export async function saveProfile({
  supabase,
  userId,
  weightKg,
  heightCm,
  sex,
  age,
  activityLevel,
  entryDate = todayString(),
}) {
  ensureSupabase(supabase, 'salvar perfil');

  const normalizedSex = normalizeSexForStorage(sex);
  const normalizedActivity = normalizeActivityForStorage(activityLevel);

  const profilePayload = {
    user_id: userId,
    ...(heightCm !== undefined ? { height_cm: heightCm ?? null } : {}),
    ...(weightKg !== undefined ? { current_weight_kg: weightKg ?? null } : {}),
    ...(sex !== undefined ? { sex: normalizedSex } : {}),
    ...(age !== undefined ? { age: age ?? null } : {}),
    ...(activityLevel !== undefined
      ? { activity_level: normalizedActivity }
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
      throw profileError;
    }

    profileData = initialProfileData ?? null;
  }

  const legacyPayload = {
    ...(heightCm !== undefined ? { altura_cm: heightCm ?? null } : {}),
    ...(weightKg !== undefined ? { weight_kg: weightKg ?? null } : {}),
    ...(sex !== undefined ? { sexo: normalizedSex } : {}),
    ...(age !== undefined ? { idade: age ?? null } : {}),
    ...(activityLevel !== undefined
      ? { nivel_atividade: normalizedActivity }
      : {}),
  };

  if (Object.keys(legacyPayload).length > 0) {
    const { error: legacyError } = await supabase
      .from('food_diary_profile')
      .update(legacyPayload)
      .eq('user_id', userId);

    if (legacyError) {
      const message = legacyError?.message || '';
      const missingColumn =
        message.toLowerCase().includes('column') &&
        message.toLowerCase().includes('does not exist');
      if (!missingColumn) {
        throw legacyError;
      }
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
