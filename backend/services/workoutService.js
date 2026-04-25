import { supabase } from "../supabase.js";

const parseList = (value) =>
  value
    ? String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const mapRoutineRow = (row = {}) => ({
  id: row.id,
  name: row.name,
  muscleGroups: parseList(row.muscle_groups || row.muscle_group),
  sportsActivities: parseList(row.sports_list || row.sports),
  muscleConfig: Array.isArray(row.muscle_config)
    ? row.muscle_config
    : row.muscle_config || [],
  exercisesByGroup:
    row.exercises_by_group && typeof row.exercises_by_group === "object"
      ? row.exercises_by_group
      : {},
  exercicios:
    row.exercises_by_group && typeof row.exercises_by_group === "object"
      ? row.exercises_by_group
      : {},
  createdAt: row.created_at,
});

export const transferWorkoutToSupervisedUser = async ({
  workoutId,
  targetUserId,
  authData,
}) => {
  try {
    const safeWorkoutId = String(workoutId || '');

    if (!safeWorkoutId || safeWorkoutId === 'undefined') {
      throw new Error('ID do treino inválido');
    }

    if (!targetUserId) {
      throw new Error("Dados inválidos");
    }

    // 🔎 Buscar treino original
    console.log('🔥 BUSCANDO TREINO ID:', workoutId);
    const { data, error: workoutError } = await supabase
      .from("workout_routines")
      .select("*")
      .eq("id", safeWorkoutId)
      .limit(1);

    const workout = data?.[0];

    if (workoutError || !workout) {
      throw new Error("Treino não encontrado");
    }

    if (!workout.name) {
      throw new Error('Treino inválido (sem nome)');
    }

    // 🧹 LIMPAR DADOS (ESSENCIAL)
    const newWorkout = {
      name: workout.name,
      user_id: targetUserId,
      muscle_groups: workout.muscle_groups,
      created_at: new Date().toISOString(),
    };

    // 📦 Criar novo treino
    const { data: createdWorkout, error: createError } = await supabase
      .from("workout_routines")
      .insert(newWorkout)
      .select()
      .single();

    if (createError) {
      console.error(createError);
      throw new Error("Erro ao criar treino");
    }

    // 🔁 (OPCIONAL) copiar exercícios depois
    // se tiver tabela separada

    return {
      success: true,
      message: "Treino transferido com sucesso",
    };
  } catch (error) {
    console.error("🔥 SERVICE ERROR:", error);
    throw error;
  }
};
