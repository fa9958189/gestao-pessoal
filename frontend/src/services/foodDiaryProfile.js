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
  if (normalized === 'masculino' || normalized === 'feminino') {
    return normalized;
  }
  if (normalized === 'masc') return 'masculino';
  if (normalized === 'fem') return 'feminino';
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
    row.current_weight_kg ??
    row.weight_kg ??
    row.peso_kg ??
    row.pesoKg ??
    row.currentWeightKg ??
    null;
  const ageValue = row.age ?? row.idade ?? null;

  return {
    heightCm: heightValue != null ? Number(heightValue) : null,
    weightKg: weightValue != null ? Number(weightValue) : null,
    goalWeightKg:
      row.target_weight_kg != null ? Number(row.target_weight_kg) : null,
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
    ...(resolvedWeightKg !== undefined ? { current_weight_kg: normalizedWeight } : {}),
    ...(resolvedGoalWeight !== undefined
      ? { target_weight_kg: normalizedGoalWeight }
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

  const legacyPayload = {
    ...(resolvedHeightCm !== undefined ? { altura_cm: normalizedHeight } : {}),
    ...(resolvedWeightKg !== undefined ? { weight_kg: normalizedWeight } : {}),
    ...(resolvedGoalWeight !== undefined
      ? { target_weight_kg: normalizedGoalWeight }
      : {}),
    ...(sex !== undefined ? { sexo: normalizedSex } : {}),
    ...(age !== undefined ? { idade: normalizedAge } : {}),
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

  if (resolvedGoalType !== undefined) {
    try {
      const profileSyncPayload = {
        weight_goal: normalizedGoalWeight,
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
  heightCm,
  height_cm,
  entryDate = todayString(),
}) {
  ensureSupabase(supabase, 'salvar peso');

  const resolvedWeightKg = weight_kg !== undefined ? weight_kg : weightKg;
  const resolvedHeightCm = height_cm !== undefined ? height_cm : heightCm;

  const normalizedWeight =
    resolvedWeightKg != null && resolvedWeightKg !== '' ? Number(resolvedWeightKg) : null;

  if (!Number.isFinite(normalizedWeight)) {
    throw new Error('Peso inválido para salvar.');
  }

  const normalizedHeight =
    resolvedHeightCm != null && resolvedHeightCm !== '' ? Number(resolvedHeightCm) : null;

  const { data: existing, error: lookupError } = await supabase
    .from('food_weight_history')
    .select('id')
    .eq('user_id', userId)
    .eq('entry_date', toStorageDateString(entryDate))
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const payload = {
    user_id: userId,
    entry_date: toStorageDateString(entryDate),
    weight_kg: normalizedWeight,
    height_cm: normalizedHeight,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('food_weight_history')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    try {
      await supabase
        .from('profiles')
        .update({ height_cm: normalizedHeight })
        .eq('id', userId);
    } catch (syncError) {
      console.warn('Não foi possível sincronizar peso na tabela profiles.', syncError);
    }

    return data ?? null;
  }

  const { data, error } = await supabase
    .from('food_weight_history')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  try {
    await supabase
      .from('profiles')
      .update({ height_cm: normalizedHeight })
      .eq('id', userId);
  } catch (syncError) {
    console.warn('Não foi possível sincronizar peso na tabela profiles.', syncError);
  }

  return data ?? null;
}

export async function loadGoals({ supabase, userId }) {
  ensureSupabase(supabase, 'carregar metas');

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('weight_goal, calorie_goal, protein_goal, water_goal_l')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    return profileData ?? null;
  } catch (fallbackError) {
    console.warn('Não foi possível carregar metas pela tabela profiles.', fallbackError);
  }

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
    if (profileRow?.current_weight != null && diaryNormalized.weightKg == null) {
      diaryNormalized.weightKg = Number(profileRow.current_weight);
    }
    if (profileRow?.height_cm != null && diaryNormalized.heightCm == null) {
      diaryNormalized.heightCm = Number(profileRow.height_cm);
    }
    const profileGoalWeight = profileRow?.weight_goal ?? null;
    if (profileGoalWeight != null && diaryNormalized.goalWeightKg == null) {
      diaryNormalized.goalWeightKg = Number(profileGoalWeight);
    }
  } catch (error) {
    console.warn('Não foi possível carregar goal_type da tabela profiles.', error);
  }

  return {
    ...diaryNormalized,
    objective: profileObjective || GOAL_TYPE_TO_OBJECTIVE[profileGoalType] || 'manter_peso',
    goalType: profileGoalType || 'maintain',
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
