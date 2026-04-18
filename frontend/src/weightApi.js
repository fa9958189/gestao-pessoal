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
  const payload = {
    user_id: userId,
    calorie_goal: calorieGoal,
    protein_goal: proteinGoal,
    water_goal_l: waterGoalLiters,
    height_cm: heightCm || null,
    weight: weightKg || null,
    updated_at: now,
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from('food_diary_profile')
    .update(payload)
    .eq('user_id', userId)
    .select();

  if (updateError) {
    console.error('Erro ao salvar perfil de peso no Supabase', updateError);
    throw updateError;
  }

  if (Array.isArray(updatedRows) && updatedRows.length > 0) {
    return updatedRows[0];
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('food_diary_profile')
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    console.error('Erro ao inserir perfil de peso no Supabase', insertError);
    throw insertError;
  }

  return insertedRow;
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

export async function registerWeight(userId, weight) {
  const now = new Date();
  const entryDate = now.toISOString().slice(0, 10);
  const recordedAt = now.toISOString();
  const normalizedWeight = Number(weight);

  const { error } = await supabase
    .from('food_weight_history')
    .insert({
      user_id: userId,
      weight_kg: normalizedWeight,
      entry_date: entryDate,
      recorded_at: recordedAt,
    });

  if (error) throw error;

  const { error: profileError } = await supabase
    .from('food_diary_profile')
    .upsert({
      user_id: userId,
      weight: normalizedWeight,
      updated_at: recordedAt,
    }, { onConflict: 'user_id' });

  if (profileError) throw profileError;
}

// Compatibilidade retroativa
export async function saveWeightEntry({
  userId,
  weightKg,
  weight,
  supabaseClient = supabase,
}) {
  const now = new Date();
  const entryDate = now.toISOString().slice(0, 10);
  const recordedAt = now.toISOString();
  const normalizedWeight = Number(weightKg ?? weight);

  const { error } = await supabaseClient
    .from('food_weight_history')
    .insert({
      user_id: userId,
      weight_kg: normalizedWeight,
      entry_date: entryDate,
      recorded_at: recordedAt,
    });

  if (error) {
    console.error('Erro ao salvar histórico de peso no Supabase', error);
    throw error;
  }

  const { error: profileError } = await supabaseClient
    .from('food_diary_profile')
    .upsert({
      user_id: userId,
      weight: normalizedWeight,
      updated_at: recordedAt,
    }, { onConflict: 'user_id' });

  if (profileError) {
    console.error('Erro ao sincronizar peso no perfil do diário alimentar', profileError);
    throw profileError;
  }
}

// Busca o histórico de peso do usuário (para mostrar na tela)
export async function fetchWeightHistory(userId) {
  const { data, error } = await supabase
    .from('food_weight_history')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Erro ao buscar histórico de peso no Supabase', error);
    throw error;
  }

  return (data || []).map((row) => ({
    date: row.recorded_at,
    weightKg: Number(row.weight_kg),
    recordedAt: row.recorded_at,
  }));
}

export async function deleteWeightEntry(
  userId,
  recordedAt,
  supabaseClient = supabase,
) {
  if (!userId || !recordedAt) {
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
      recorded_at: recordedAt,
    });

  if (error) {
    console.error('Erro ao excluir registro de peso:', error);
    throw error;
  }
}
