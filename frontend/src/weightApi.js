import { supabase } from './supabaseClient';

// Salva/atualiza o perfil de metas + altura/peso atual
export async function saveWeightProfile({
  userId,
  calorieGoal,
  proteinGoal,
  waterGoalLiters,
  heightCm,
  weightKg,
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('food_diary_profile')
    .upsert({
      user_id: userId,
      calorie_goal: calorieGoal,
      protein_goal: proteinGoal,
      water_goal_l: waterGoalLiters,
      height_cm: heightCm || null,
      weight: weightKg || null,
      updated_at: now,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar perfil de peso no Supabase', error);
    throw error;
  }

  return data;
}

// Busca o perfil mais recente de metas + altura/peso
export async function fetchWeightProfile(userId) {
  const { data, error } = await supabase
    .from('food_diary_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar perfil do diário alimentar:', error);
    throw error;
  }

  const profile = data || null;

  return {
    calorieGoal: profile?.calorie_goal ?? 2000,
    proteinGoal: profile?.protein_goal ?? 120,
    waterGoalLiters: profile?.water_goal_l ?? 2.5,
    heightCm: profile?.height_cm ?? null,
    weightKg: profile?.weight ?? null,
  };
}

// Registra uma entrada no histórico de peso
export async function saveWeightEntry({
  userId,
  entryDate,
  weightKg,
  supabaseClient = supabase,
}) {
  if (!supabaseClient) {
    throw new Error('Supabase client não disponível em saveWeightEntry.');
  }

  const { data, error } = await supabaseClient
    .from('food_weight_history')
    .insert([
      {
        user_id: userId, // OBRIGATÓRIO, NOT NULL
        entry_date: entryDate, // string 'YYYY-MM-DD'
        weight_kg: weightKg, // número
        recorded_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar histórico de peso no Supabase', error);
    throw error;
  }

  const { error: profileError } = await supabaseClient
    .from('food_diary_profile')
    .upsert({
      user_id: userId,
      weight: weightKg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (profileError) {
    console.error('Erro ao sincronizar peso atual no perfil', profileError);
    throw profileError;
  }

  return data;
}

// Busca o histórico de peso do usuário (para mostrar na tela)
export async function fetchWeightHistory(userId) {
  const { data, error } = await supabase
    .from('food_weight_history')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .order('entry_date', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Erro ao buscar histórico de peso no Supabase', error);
    throw error;
  }

  return (data || []).map((row) => ({
    date: row.entry_date,
    weightKg: Number(row.weight_kg),
    recordedAt: row.recorded_at,
  }));
}

export async function deleteWeightEntry(
  userId,
  entryDate,
  recordedAt,
  supabaseClient = supabase,
) {
  if (!userId || !entryDate || !recordedAt) {
    throw new Error('Parâmetros inválidos para deleteWeightEntry.');
  }

  if (!supabaseClient) {
    throw new Error('Supabase client não disponível em deleteWeightEntry.');
  }

  const { error } = await supabaseClient
    .from('food_weight_history')
    .delete()
    .match({
      user_id: userId,
      entry_date: entryDate,
      recorded_at: recordedAt,
    });

  if (error) {
    console.error('Erro ao excluir registro de peso:', error);
    throw error;
  }
}
