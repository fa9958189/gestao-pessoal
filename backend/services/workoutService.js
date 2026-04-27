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
  authData: _authData,
}) => {
  try {
    const safeWorkoutId = String(workoutId || "").trim();
    const safeTargetUserId = String(targetUserId || "").trim();

    const resolveTargetProfileId = async (targetId) => {
      const safeId = String(targetId || "").trim();

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", safeId)
        .maybeSingle();

      if (profile?.id) return profile.id;

      const { data: profileAuth } = await supabase
        .from("profiles_auth")
        .select("id, auth_id")
        .eq("id", safeId)
        .maybeSingle();

      if (profileAuth?.auth_id) return profileAuth.auth_id;

      return null;
    };

    if (!safeWorkoutId || safeWorkoutId === "undefined" || safeWorkoutId === "null") {
      return {
        status: 400,
        body: { error: "ID do treino inválido." },
      };
    }

    if (!safeTargetUserId || safeTargetUserId === "undefined" || safeTargetUserId === "null") {
      return {
        status: 400,
        body: { error: "ID do usuário de destino inválido." },
      };
    }

    const { data: originalWorkout, error: workoutError } = await supabase
      .from("workout_routines")
      .select("*")
      .eq("id", safeWorkoutId)
      .maybeSingle();

    if (workoutError || !originalWorkout) {
      return {
        status: 404,
        body: { error: "Treino não encontrado." },
      };
    }

    const resolvedTargetProfileId = await resolveTargetProfileId(safeTargetUserId);

    if (!resolvedTargetProfileId) {
      return {
        status: 404,
        body: { error: "Usuário de destino não encontrado." },
      };
    }

    console.log("Transferência treino:", {
      workoutId: safeWorkoutId,
      targetUserId: safeTargetUserId,
      resolvedTargetProfileId,
    });
    console.log("Treino original:", originalWorkout);

    const hasValue = (val) => {
      if (Array.isArray(val)) return val.length > 0;
      if (typeof val === "string") return val.trim().length > 0;
      if (val && typeof val === "object") return Object.keys(val).length > 0;
      return false;
    };

    let rawMuscleGroups = [];

    if (hasValue(originalWorkout.muscle_groups)) {
      rawMuscleGroups = originalWorkout.muscle_groups;
    } else if (hasValue(originalWorkout.muscle_group)) {
      rawMuscleGroups = originalWorkout.muscle_group;
    } else if (hasValue(originalWorkout.muscle_config)) {
      rawMuscleGroups = Object.keys(originalWorkout.muscle_config);
    } else if (hasValue(originalWorkout.exercises_by_group)) {
      rawMuscleGroups = Object.keys(originalWorkout.exercises_by_group);
    }

    if (!Array.isArray(rawMuscleGroups) || rawMuscleGroups.length === 0) {
      console.log("⚠️ Nenhum grupo encontrado, aplicando fallback inteligente");

      if (originalWorkout.exercises_by_group) {
        const keys = Object.keys(originalWorkout.exercises_by_group);
        if (keys.length > 0) {
          rawMuscleGroups = keys;
        }
      }

      if (!rawMuscleGroups || rawMuscleGroups.length === 0) {
        rawMuscleGroups = [];
      }
    }

    const normalizedMuscleGroups = Array.isArray(rawMuscleGroups)
      ? rawMuscleGroups
      : typeof rawMuscleGroups === "string" && rawMuscleGroups.trim().length > 0
        ? [rawMuscleGroups]
        : [];
    const finalMuscleGroups = normalizedMuscleGroups.filter(
      (g) => g && g !== "geral",
    );

    const newWorkout = {
      name: originalWorkout.name,
      user_id: resolvedTargetProfileId,

      muscle_groups: finalMuscleGroups,

      sports_list: originalWorkout.sports_list || [],

      muscle_config:
        typeof originalWorkout.muscle_config === "object" &&
        originalWorkout.muscle_config !== null
          ? originalWorkout.muscle_config
          : {},

      exercises_by_group:
        typeof originalWorkout.exercises_by_group === "object" &&
        originalWorkout.exercises_by_group !== null
          ? originalWorkout.exercises_by_group
          : {},
    };

    console.log("NOVO TREINO COMPLETO:", newWorkout);

    const { error: createError } = await supabase
      .from("workout_routines")
      .insert(newWorkout);

    if (createError) {
      console.error("Erro ao inserir treino transferido:", createError);
      return {
        status: 500,
        body: {
          error: createError.message || "Erro ao transferir treino",
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: "Treino transferido com sucesso",
        workout: newWorkout,
      },
    };
  } catch (error) {
    console.error("Erro no serviço de transferência de treino:", error);
    return {
      status: 500,
      body: {
        error: error.message || "Não foi possível transferir o treino.",
      },
    };
  }
};
