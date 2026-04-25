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

const sanitizeWorkoutForClone = (workout = {}, targetUserId) => {
  const clone = { ...workout, user_id: targetUserId };
  delete clone.id;
  delete clone.created_at;
  delete clone.updated_at;
  return clone;
};

export const transferWorkoutToSupervisedUser = async ({
  workoutId,
  targetUserId,
  authData,
}) => {
  if (!workoutId || !targetUserId) {
    throw new Error("Dados inválidos");
  }

  if (typeof workoutId !== "string") {
    throw new Error("ID do treino inválido");
  }

  if (!authData?.userId) {
    throw new Error("Usuário não autenticado");
  }

  const { data: loggedProfile, error: loggedProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", authData.userId)
    .maybeSingle();

  if (loggedProfileError) {
    throw new Error(loggedProfileError.message || "Erro ao buscar usuário logado.");
  }

  if (!loggedProfile?.id) {
    throw new Error("Usuário logado não encontrado");
  }

  const requesterRole = String(loggedProfile.role || "").toLowerCase();
  const isAdmin = requesterRole === "admin";

  if (!isAdmin) {
    const { data: supervisedUser, error: supervisedUserError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", targetUserId)
      .eq("affiliate_id", authData.userId)
      .maybeSingle();

    if (supervisedUserError) {
      throw new Error(supervisedUserError.message || "Erro ao validar usuário supervisionado.");
    }

    if (!supervisedUser?.id) {
      throw new Error("Sem permissão para transferir");
    }
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workout_routines")
    .select("*")
    .eq("id", workoutId)
    .maybeSingle();

  if (workoutError) {
    throw new Error(workoutError.message || "Erro ao buscar treino.");
  }

  if (!workout?.id) {
    throw new Error("Treino não encontrado");
  }

  const clonedWorkout = sanitizeWorkoutForClone(workout, targetUserId);
  const { data: createdWorkout, error: cloneError } = await supabase
    .from("workout_routines")
    .insert(clonedWorkout)
    .select("*")
    .single();

  if (cloneError) {
    throw new Error(cloneError.message || "Erro ao transferir treino");
  }

  return mapRoutineRow(createdWorkout);
};
