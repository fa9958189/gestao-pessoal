import { supabase } from "../supabase.js";

const parseMaybeJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeList = (value) => {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter((item) => item && item.toLowerCase() !== "geral");
  }

  const parsed = parseMaybeJson(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => String(item || "").trim())
      .filter((item) => item && item.toLowerCase() !== "geral");
  }

  if (typeof parsed === "string") {
    return parsed
      .split(",")
      .map((item) =>
        String(item || "")
          .replace(/^\[|\]$/g, "")
          .replace(/^['"]|['"]$/g, "")
          .trim(),
      )
      .filter((item) => item && item.toLowerCase() !== "geral");
  }

  return [];
};

const normalizeObject = (value) => {
  if (value === null || value === undefined) return {};
  if (value && typeof value === "object" && !Array.isArray(value)) return value;

  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;

  return {};
};

const mapRoutineRow = (row = {}) => ({
  id: row.id,
  name: row.name,
  muscleGroups: normalizeList(row.muscle_groups || row.muscle_group),
  sportsActivities: normalizeList(row.sports_list || row.sports),
  muscleConfig: Array.isArray(parseMaybeJson(row.muscle_config))
    ? parseMaybeJson(row.muscle_config)
    : [],
  exercisesByGroup: normalizeObject(row.exercises_by_group),
  exercicios: normalizeObject(row.exercises_by_group),
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
      .select("name, muscle_groups, sports_list, exercises_by_group, muscle_config")
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

    const finalMuscleGroups = normalizeList(originalWorkout.muscle_groups);
    const finalSportsList = normalizeList(originalWorkout.sports_list);
    const finalMuscleConfig = (() => {
      if (typeof originalWorkout.muscle_config === "string") {
        const parsed = parseMaybeJson(originalWorkout.muscle_config);
        return parsed && typeof parsed === "object" ? parsed : {};
      }
      return originalWorkout.muscle_config || {};
    })();

    const finalExercisesByGroup = (() => {
      if (typeof originalWorkout.exercises_by_group === "string") {
        const parsed = parseMaybeJson(originalWorkout.exercises_by_group);
        return parsed && typeof parsed === "object" ? parsed : {};
      }
      return originalWorkout.exercises_by_group || {};
    })();

    const newWorkout = {
      name: originalWorkout.name,
      user_id: resolvedTargetProfileId,
      muscle_groups: finalMuscleGroups,
      sports_list: finalSportsList,
      muscle_config: finalMuscleConfig,
      exercises_by_group: finalExercisesByGroup,
    };

    console.log("TREINO ORIGINAL PARA TRANSFERÊNCIA:", originalWorkout);
    console.log("NOVO TREINO TRANSFERIDO:", newWorkout);

    const { error: createError } = await supabase
      .from("workout_routines")
      .insert([newWorkout]);

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
