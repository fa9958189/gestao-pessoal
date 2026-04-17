const todayString = () => new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');

const toStorageDateString = (selectedDate) => {
  const normalized = String(selectedDate || '').trim();
  if (normalized.includes('/')) {
    return normalized.split('/').reverse().join('-');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return todayString();
};

const ensureSupabase = (supabase, context) => {
  if (!supabase) {
    throw new Error(`Supabase não disponível para ${context}.`);
  }
};

const normalizeSexForStorage = (value) => {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'male' || normalized === 'female') {
    return normalized;
  }
  if (normalized === 'masculino' || normalized === 'masc') return 'male';
  if (normalized === 'feminino' || normalized === 'fem') return 'female';
  return normalized;
};

const normalizeActivityForStorage = (value) => {
  if (value == null || value === '') return null;
  return String(value).trim();
};

const OBJECTIVE_TO_GOAL_TYPE = {
  perder_peso: 'lose_weight',
  manter_peso: 'maintain',
  ganhar_massa: 'gain_muscle',
};

const GOAL_TYPE_TO_OBJECTIVE = {
  lose_weight: 'perder_peso',
  maintain: 'manter_peso',
  gain_muscle: 'ganhar_massa',
};

const normalizeObjectiveForStorage = (value) => {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (OBJECTIVE_TO_GOAL_TYPE[normalized]) return normalized;
  return GOAL_TYPE_TO_OBJECTIVE[normalized] || null;
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

  const heightValue =
    row.height_cm ?? row.altura_cm ?? row.heightCm ?? row.alturaCm ?? null;
  const weightValue =
    row.weight ??
    row.current_weight ??
    row.peso ??
    row.pesoKg ??
    null;
  const ageValue = row.age ?? row.idade ?? null;

  return {
    heightCm: heightValue != null ? Number(heightValue) : null,
    weightKg: weightValue != null ? Number(weightValue) : null,
    goalWeightKg:
      row.goal_weight != null ? Number(row.goal_weight) : null,
    sex: normalizeSexForStorage(row.sex ?? row.sexo ?? null),
    age: ageValue != null ? Number.parseInt(ageValue, 10) : null,
    activityLevel: normalizeActivityForStorage(
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
  goalType,
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

  const profilePayload = {
    calorie_goal: Number(calorieGoal || 0),
    protein_goal: Number(proteinGoal || 0),
    water_goal_l: Number(waterGoalL || 0),
    ...(goalType !== undefined ? { goal_type: goalType || 'maintain' } : {}),
  };

  try {
    await supabase
      .from('profiles')
      .update(profilePayload)
      .eq('id', userId);
  } catch (syncError) {
    console.warn('Não foi possível sincronizar metas na tabela profiles.', syncError);
  }

  return data ?? payload;
}

export async function saveProfile({
  supabase,
  userId,
  weightKg,
  weight_kg,
  goalWeightKg,
  weight_goal,
  heightCm,
  height_cm,
  sex,
  age,
  activityLevel,
  goalType,
  goal_type,
}) {
  ensureSupabase(supabase, 'salvar perfil');

  const resolvedWeightKg = weight_kg !== undefined ? weight_kg : weightKg;
  const resolvedGoalWeight = weight_goal !== undefined ? weight_goal : goalWeightKg;
  const resolvedHeightCm = height_cm !== undefined ? height_cm : heightCm;
  const resolvedGoalType = goal_type !== undefined ? goal_type : goalType;

  const normalizedSex = normalizeSexForStorage(sex);
  const normalizedActivity = normalizeActivityForStorage(activityLevel);
  const normalizedAge =
    age != null && age !== '' ? Number.parseInt(age, 10) : null;
  const normalizedHeight =
    resolvedHeightCm != null && resolvedHeightCm !== '' ? Number(resolvedHeightCm) : null;
  const normalizedWeight =
    resolvedWeightKg != null && resolvedWeightKg !== '' ? Number(resolvedWeightKg) : null;
  const normalizedGoalWeight =
    resolvedGoalWeight != null && resolvedGoalWeight !== '' ? Number(resolvedGoalWeight) : null;

  const profilePayload = {
    user_id: userId,
    ...(resolvedHeightCm !== undefined ? { height_cm: normalizedHeight } : {}),
    ...(resolvedWeightKg !== undefined ? { weight: normalizedWeight } : {}),
    ...(resolvedGoalWeight !== undefined
      ? { goal_weight: normalizedGoalWeight }
      : {}),
    ...(sex !== undefined ? { sex: normalizedSex } : {}),
    ...(age !== undefined ? { age: normalizedAge } : {}),
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

  if (resolvedGoalType !== undefined) {
    try {
      const profileSyncPayload = {
        weight_goal: normalizedGoalWeight,
        ...(resolvedWeightKg !== undefined ? { current_weight: normalizedWeight } : {}),
        goal_type: resolvedGoalType || 'maintain',
      };

      await supabase
        .from('profiles')
        .update(profileSyncPayload)
        .eq('id', userId);
    } catch (syncError) {
      console.warn('Não foi possível sincronizar dados na tabela profiles.', syncError);
    }
  } else {
    try {
      const profileSyncPayload = {
        ...(resolvedWeightKg !== undefined ? { current_weight: normalizedWeight } : {}),
        ...(resolvedGoalWeight !== undefined ? { weight_goal: normalizedGoalWeight } : {}),
      };

      if (Object.keys(profileSyncPayload).length > 0) {
        await supabase
          .from('profiles')
          .update(profileSyncPayload)
          .eq('id', userId);
      }
    } catch (syncError) {
      console.warn('Não foi possível sincronizar dados na tabela profiles.', syncError);
    }
  }

  return { profileData };
}

export async function saveWeightEntry({
  supabase,
  userId,
  weightKg,
  weight_kg,
}) {
  ensureSupabase(supabase, 'salvar peso');

  const resolvedWeightKg = weight_kg !== undefined ? weight_kg : weightKg;
  const normalizedWeight =
    resolvedWeightKg != null && resolvedWeightKg !== '' ? Number(resolvedWeightKg) : null;

  if (!Number.isFinite(normalizedWeight)) {
    throw new Error('Peso inválido para salvar.');
  }

  const payload = {
    user_id: userId,
    weight_kg: normalizedWeight,
    recorded_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('food_weight_history')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
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

  if (data) {
    return data;
  }

  return null;
}

export async function loadProfile({ supabase, userId }) {
  ensureSupabase(supabase, 'carregar perfil');

  const diaryRowResult = await supabase
    .from('food_diary_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (diaryRowResult.error) {
    throw diaryRowResult.error;
  }

  const diaryNormalized = normalizeProfileRow(diaryRowResult.data ?? null);

  let profileGoalType = null;
  let profileObjective = null;
  let profileGoalMode = null;
  try {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    profileObjective = normalizeObjectiveForStorage(profileRow?.objective ?? null);
    profileGoalType =
      profileRow?.goal_type ??
      (profileObjective ? OBJECTIVE_TO_GOAL_TYPE[profileObjective] : null);
    profileGoalMode = profileRow?.goal_mode ?? null;
    if (profileRow?.height_cm != null && diaryNormalized.heightCm == null) {
      diaryNormalized.heightCm = Number(profileRow.height_cm);
    }
  } catch (error) {
    console.warn('Não foi possível carregar goal_type da tabela profiles.', error);
  }

  return {
    ...diaryNormalized,
    objective: profileObjective || GOAL_TYPE_TO_OBJECTIVE[profileGoalType] || 'manter_peso',
    goalType: profileGoalType || 'maintain',
    goalMode: profileGoalMode,
  };
}

export async function loadTodayWeight({ supabase, userId, entryDate = todayString() }) {
  ensureSupabase(supabase, 'carregar peso do dia');

  const { data, error } = await supabase
    .from('food_weight_history')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', entryDate)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
