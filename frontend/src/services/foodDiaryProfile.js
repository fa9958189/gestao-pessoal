const todayString = () => new Date().toISOString().slice(0, 10);

const ensureSupabase = (supabase, context) => {
  if (!supabase) {
    throw new Error(`Supabase não disponível para ${context}.`);
  }
};

const selectProfileAuth = async ({ supabase, userId }) => {
  try {
    const { data, error } = await supabase
      .from('profiles_auth')
      .select('height_cm, sex, age, activity_level')
      .or(`auth_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  } catch (err) {
    // Se der erro por permissão/RLS ou tabela/coluna, não quebra o app
    console.warn(
      '⚠️ Falha ao ler profiles_auth (ok, usando fallback):',
      err?.message || err,
    );
    return null;
  }
};

const updateProfileAuth = async ({
  supabase,
  userId,
  heightCm,
  sex,
  age,
  activityLevel,
}) => {
  try {
    const payload = {};

    if (heightCm !== undefined) payload.height_cm = heightCm;
    if (sex !== undefined) payload.sex = sex;
    if (age !== undefined) payload.age = age;
    if (activityLevel !== undefined) payload.activity_level = activityLevel;

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from('profiles_auth')
      .update(payload)
      .or(`auth_id.eq.${userId},id.eq.${userId}`);

    if (error) throw error;
  } catch (err) {
    console.warn(
      '⚠️ Falha ao atualizar profiles_auth (ok, mantendo fallback):',
      err?.message || err,
    );
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
  const normalized = String(value).trim().toLowerCase();

  // Normaliza variações comuns
  if (normalized === 'sedentario') return 'sedentário';
  if (normalized === 'muito-alto') return 'muito alto';

  // Mapeia os valores do SELECT da UI (Leve/Moderado/Alto/Muito alto)
  // para os valores que você provavelmente travou na constraint (levemente/moderadamente/ativo/muito ativo)
  if (normalized === 'leve') return 'levemente';
  if (normalized === 'moderado') return 'moderadamente';
  if (normalized === 'alto') return 'ativo';
  if (normalized === 'muito alto') return 'muito ativo';

  return normalized;
};

const normalizeActivityForUi = (value) => {
  if (value == null || value === '') return '';
  const normalized = String(value).trim().toLowerCase();

  // Volta pro texto que a UI já usa
  if (normalized === 'sedentário' || normalized === 'sedentario') {
    return 'Sedentário';
  }
  if (normalized === 'levemente' || normalized === 'leve') return 'Leve';
  if (normalized === 'moderadamente' || normalized === 'moderado') {
    return 'Moderado';
  }
  if (normalized === 'ativo' || normalized === 'alto') return 'Alto';
  if (
    normalized === 'muito ativo' ||
    normalized === 'muito alto' ||
    normalized === 'muito-alto'
  ) {
    return 'Muito alto';
  }

  return value;
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
}) {
  ensureSupabase(supabase, 'salvar perfil');

  const normalizedSex = normalizeSexForStorage(sex);
  const normalizedActivity = normalizeActivityForStorage(activityLevel);
  const normalizedAge =
    age != null && age !== '' ? Number.parseInt(age, 10) : null;
  const normalizedHeight =
    heightCm != null && heightCm !== '' ? Number(heightCm) : null;
  const normalizedWeight =
    weightKg != null && weightKg !== '' ? Number(weightKg) : null;

  // ✅ Novo: grava também em profiles_auth (sem quebrar o que já existe)
  await updateProfileAuth({
    supabase,
    userId,
    heightCm: heightCm !== undefined ? normalizedHeight : undefined,
    sex: sex !== undefined ? normalizedSex : undefined,
    age: age !== undefined ? normalizedAge : undefined,
    activityLevel: activityLevel !== undefined ? normalizedActivity : undefined,
  });

  const profilePayload = {
    user_id: userId,
    ...(heightCm !== undefined ? { height_cm: normalizedHeight } : {}),
    ...(weightKg !== undefined ? { current_weight_kg: normalizedWeight } : {}),
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
    ...(heightCm !== undefined ? { altura_cm: normalizedHeight } : {}),
    ...(weightKg !== undefined ? { weight_kg: normalizedWeight } : {}),
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

  return { profileData };
}

export async function saveWeightEntry({
  supabase,
  userId,
  weightKg,
  heightCm,
  entryDate = todayString(),
}) {
  ensureSupabase(supabase, 'salvar peso');

  const normalizedWeight =
    weightKg != null && weightKg !== '' ? Number(weightKg) : null;

  if (!Number.isFinite(normalizedWeight)) {
    throw new Error('Peso inválido para salvar.');
  }

  const normalizedHeight =
    heightCm != null && heightCm !== '' ? Number(heightCm) : null;

  const { data: existing, error: lookupError } = await supabase
    .from('food_weight_history')
    .select('id')
    .eq('user_id', userId)
    .eq('entry_date', entryDate)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const payload = {
    weight_kg: normalizedWeight,
    ...(normalizedHeight != null ? { height_cm: normalizedHeight } : {}),
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

    return data ?? null;
  }

  const { data, error } = await supabase
    .from('food_weight_history')
    .insert({
      user_id: userId,
      entry_date: entryDate,
      ...payload,
    })
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

  return data ?? null;
}

export async function loadProfile({ supabase, userId }) {
  ensureSupabase(supabase, 'carregar perfil');

  // 1) Busca em paralelo: food_diary_profile (como hoje) + profiles_auth (novo)
  const [authRow, diaryRowResult] = await Promise.all([
    selectProfileAuth({ supabase, userId }),
    supabase
      .from('food_diary_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (diaryRowResult.error) {
    throw diaryRowResult.error;
  }

  const diaryNormalized = normalizeProfileRow(diaryRowResult.data ?? null);

  // 2) Se existir profiles_auth, ele manda nos campos “persistentes” do perfil
  const merged = {
    ...diaryNormalized,
  };

  if (authRow) {
    if (authRow.height_cm != null) merged.heightCm = Number(authRow.height_cm);
    if (authRow.sex != null) merged.sex = normalizeSexForStorage(authRow.sex);
    if (authRow.age != null) merged.age = Number.parseInt(authRow.age, 10);
    if (authRow.activity_level != null) {
      merged.activityLevel = normalizeActivityForStorage(
        authRow.activity_level,
      );
    }

    // também devolve versão já “bonitinha” se alguém usar direto (não quebra nada)
    merged.activityLevelUi = normalizeActivityForUi(authRow.activity_level);
  }

  return merged;
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
