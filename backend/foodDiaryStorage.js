import { supabase } from "./supabase.js";

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 120,
  water: 2.5,
};

const DEFAULT_BODY = {
  heightCm: "",
  weightKg: "",
  goalWeightKg: "",
};

const DEFAULT_WATER_GOAL_L = DEFAULT_GOALS.water;
const BRAZIL_TZ = "America/Sao_Paulo";

const getLocalDateString = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
};

const getBrazilDateFromTimestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return getLocalDateString(parsed);
};

const normalizeEntryFromDb = (row = {}) => ({
  id: row.id,
  mealType: row.meal_type || "",
  food: row.food || "",
  quantity: row.quantity || "",
  calories: row.calories != null ? Number(row.calories) : 0,
  protein: row.protein != null ? Number(row.protein) : 0,
  waterMl: row.water_ml != null ? Number(row.water_ml) : 0,
  time: row.entry_time || "",
  notes: row.notes || "",
  date: row.entry_date || row.day_date,
  createdAt: row.created_at,
});

const mapGoalsFromProfile = (profile) => ({
  calories:
    profile?.calorie_goal != null
      ? Number(profile.calorie_goal)
      : DEFAULT_GOALS.calories,
  protein:
    profile?.protein_goal != null
      ? Number(profile.protein_goal)
      : DEFAULT_GOALS.protein,
  water:
    profile?.water_goal_l != null
      ? Number(profile.water_goal_l)
      : DEFAULT_GOALS.water,
});

const mapBodyFromProfile = (profile) => ({
  heightCm:
    profile?.height_cm != null && profile.height_cm !== ""
      ? profile.height_cm
      : DEFAULT_BODY.heightCm,
  weightKg:
    profile?.weight != null && profile.weight !== ""
      ? profile.weight
      : DEFAULT_BODY.weightKg,
  goalWeightKg:
    profile?.goal_weight != null && profile.goal_weight !== ""
      ? profile.goal_weight
      : DEFAULT_BODY.goalWeightKg,
});

const toNumberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapWaterGoalFromAuth = (profile) => {
  const candidate = profile?.water_goal_l ?? null;
  return toNumberOrNull(candidate);
};

const getWaterGoalL = async (supabaseClient, userId, fallbackProfile) => {
  if (fallbackProfile?.water_goal_l != null) {
    return Number(fallbackProfile.water_goal_l);
  }

  const { data: diaryProfile, error: diaryError } = await supabaseClient
    .from("food_diary_profile")
    .select("water_goal_l")
    .eq("user_id", userId)
    .maybeSingle();

  if (diaryError) {
    console.error(
      "[WATER] Falha no select food_diary_profile.water_goal_l",
      { userId, column: "water_goal_l" },
      diaryError
    );
    throw diaryError;
  }

  if (diaryProfile?.water_goal_l != null) {
    return Number(diaryProfile.water_goal_l);
  }

  const { data: authProfile, error: authError } = await supabaseClient
    .from("profiles")
    .select("water_goal_l")
    .eq("id", userId)
    .maybeSingle();

  if (authError) {
    console.error(
      "[WATER] Falha no select profiles.water_goal_l",
      { userId, column: "water_goal_l" },
      authError
    );
    throw authError;
  }

  const authGoal = mapWaterGoalFromAuth(authProfile);
  if (authGoal != null) {
    return authGoal;
  }

  return DEFAULT_WATER_GOAL_L;
};

const getHydrationRowsFromDiary = async (supabaseClient, userId, dayDate) => {
  const { data, error } = await supabaseClient
    .from("food_diary_entries")
    .select("id, water_ml, created_at")
    .eq("user_id", userId)
    .eq("meal_type", "hydration")
    .eq("entry_date", dayDate)
    .order("created_at", { ascending: false });

  // Não deixa quebrar o /api/water se isso falhar
  if (error) {
    console.warn(
      "Aviso: não foi possível buscar hidratação do diário:",
      error.message
    );
    return [];
  }

  return data || [];
};

const getHydrationRowsFromLogs = async (supabaseClient, userId, dayDate) => {
  const { data, error } = await supabaseClient
    .from("hydration_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[WATER] Falha no select hydration_logs",
      {
        userId,
        dayDate,
        columns: "*",
      },
      error
    );
    throw error;
  }

  return (data || []).filter((row) => {
    if (row?.day_date === dayDate || row?.entry_date === dayDate) {
      return true;
    }
    if (!row?.created_at) {
      return false;
    }
    return getBrazilDateFromTimestamp(row.created_at) === dayDate;
  });
};

const getLatestHydrationEntry = (logRows, diaryRows) => {
  const latestLog = logRows?.[0];
  const latestDiary = diaryRows?.[0];

  if (!latestLog && !latestDiary) {
    return null;
  }

  const logTime = latestLog?.created_at
    ? new Date(latestLog.created_at).getTime()
    : null;
  const diaryTime = latestDiary?.created_at
    ? new Date(latestDiary.created_at).getTime()
    : null;

  if (logTime != null && diaryTime != null) {
    return logTime >= diaryTime
      ? { source: "hydration_logs", id: latestLog.id }
      : { source: "food_diary_entries", id: latestDiary.id };
  }

  if (logTime != null) {
    return { source: "hydration_logs", id: latestLog.id };
  }

  if (diaryTime != null) {
    return { source: "food_diary_entries", id: latestDiary.id };
  }

  return latestLog
    ? { source: "hydration_logs", id: latestLog.id }
    : { source: "food_diary_entries", id: latestDiary.id };
};

const getHydrationTotals = async (supabaseClient, userId, dayDate) => {
  const [logRows, diaryRows] = await Promise.all([
    getHydrationRowsFromLogs(supabaseClient, userId, dayDate),
    getHydrationRowsFromDiary(supabaseClient, userId, dayDate),
  ]);

  const totalFromLogs = (logRows || []).reduce(
    (sum, row) =>
      sum +
      Number(
        row.amount_ml ??
          row.water_ml ??
          (Number.isFinite(Number(row.amount_l)) ? Number(row.amount_l) * 1000 : 0)
      ),
    0
  );
  const totalFromDiary = (diaryRows || []).reduce(
    (sum, row) => sum + Number(row.water_ml || 0),
    0
  );

  const latest = getLatestHydrationEntry(logRows, diaryRows);

  return {
    totalMl: totalFromLogs + totalFromDiary,
    latestEntry: latest,
  };
};

export const getWaterSummary = async ({
  supabase: supabaseClient = supabase,
  userId,
  dayDate,
}) => {
  const resolvedDate = dayDate || getLocalDateString();
  const [totals, goalL] = await Promise.all([
    getHydrationTotals(supabaseClient, userId, resolvedDate),
    getWaterGoalL(supabaseClient, userId),
  ]);

  const totalMl = totals.totalMl || 0;
  const totalL = Number((totalMl / 1000).toFixed(2));

  return {
    totalMl,
    totalL,
    goalL,
    lastEntryId: totals.latestEntry?.id ?? null,
  };
};

export const updateWaterGoal = async ({
  supabase: supabaseClient = supabase,
  userId,
  goalLiters,
}) => {
  const parsedGoal = toNumberOrNull(goalLiters);
  if (parsedGoal == null || parsedGoal <= 0) {
    return { ok: false, error: new Error("Meta de água inválida.") };
  }

  const { error: authError } = await supabaseClient
    .from("profiles")
    .update({ water_goal_l: parsedGoal })
    .eq("id", userId);

  if (authError) {
    return { ok: false, error: authError };
  }

  const { error: diaryError } = await supabaseClient
    .from("food_diary_profile")
    .upsert(
      {
        user_id: userId,
        water_goal_l: parsedGoal,
      },
      { onConflict: "user_id" }
    );

  if (diaryError) {
    return { ok: false, error: diaryError };
  }

  return { ok: true, goalL: parsedGoal };
};

export const getFoodDiaryState = async (userId, { dayDate } = {}) => {
  const entriesByDate = {};
  const resolvedDayDate = dayDate || getLocalDateString();

  const { data: entries, error: entriesError } = await supabase
    .from("food_diary_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (entriesError) throw entriesError;

  (entries || []).forEach((row) => {
    const date = row.entry_date || row.day_date;
    if (!date) return;

    if (row.meal_type === "hydration") {
      return;
    }

    if (!entriesByDate[date]) entriesByDate[date] = [];
    entriesByDate[date].push(normalizeEntryFromDb(row));
  });

  const { data: profile, error: profileError } = await supabase
    .from("food_diary_profile")
    .select(
      "calorie_goal, protein_goal, water_goal_l, height_cm, weight, goal_weight, objective"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const goals = mapGoalsFromProfile(profile);
  const body = mapBodyFromProfile(profile);
  const waterGoalL = await getWaterGoalL(supabase, userId, profile);
  goals.water = waterGoalL;

  const hydrationTotals = await getHydrationTotals(
    supabase,
    userId,
    resolvedDayDate
  );

  const { data: weightRows, error: weightError } = await supabase
    .from("food_weight_history")
    .select("entry_date, weight_kg, recorded_at")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false });

  if (weightError) throw weightError;

  const weightHistory = (weightRows || [])
    .map((row) => ({
      date: row.entry_date,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      recordedAt: row.recorded_at,
    }))
    .filter((item) => item.date && item.weightKg != null);

  return {
    entriesByDate,
    goals,
    body,
    weightHistory,
    hydrationTotalMl: hydrationTotals.totalMl,
    hydrationGoalMl: Number(waterGoalL || DEFAULT_GOALS.water) * 1000,
    hydrationLastEntryId: hydrationTotals.latestEntry?.id ?? null,
  };
};

export const saveFoodDiaryState = async (userId, state = {}) => {
  const goals = state.goals || {};
  const body = state.body || {};
  const weightHistory = Array.isArray(state.weightHistory)
    ? state.weightHistory
    : [];

  const profilePayload = {
    user_id: userId,
    calorie_goal:
      goals.calories != null ? Number(goals.calories) : DEFAULT_GOALS.calories,
    protein_goal:
      goals.protein != null ? Number(goals.protein) : DEFAULT_GOALS.protein,
    water_goal_l:
      goals.water != null ? Number(goals.water) : DEFAULT_GOALS.water,
    height_cm: body.heightCm !== "" ? body.heightCm : null,
    weight: body.weightKg !== "" ? body.weightKg : null,
    goal_weight: body.goalWeightKg !== "" ? body.goalWeightKg : null,
  };

  const { error: profileError } = await supabase
    .from("food_diary_profile")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) throw profileError;

  if (goals.water != null) {
    const result = await updateWaterGoal({
      supabase,
      userId,
      goalLiters: goals.water,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  const latestWeight = weightHistory.find(
    (item) => item?.date && item?.weightKg != null
  );

  if (latestWeight) {
    const { data: existingEntry, error: findError } = await supabase
      .from("food_weight_history")
      .select("id")
      .eq("user_id", userId)
      .eq("entry_date", latestWeight.date)
      .maybeSingle();

    if (findError) throw findError;

    if (existingEntry) {
      const { error: updateError } = await supabase
        .from("food_weight_history")
        .update({ weight_kg: Number(latestWeight.weightKg) })
        .eq("id", existingEntry.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("food_weight_history")
        .insert({
          user_id: userId,
          entry_date: latestWeight.date,
          weight_kg: Number(latestWeight.weightKg),
        });

      if (insertError) throw insertError;
    }

    const { error: profileSyncError } = await supabase
      .from("food_diary_profile")
      .upsert(
        {
          user_id: userId,
          weight: Number(latestWeight.weightKg),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (profileSyncError) throw profileSyncError;
  }

  return getFoodDiaryState(userId);
};

export const addHydration = async ({
  supabase: supabaseClient = supabase,
  userId,
  dayDate,
  amountMl,
}) => {
  const payload = {
    user_id: userId,
    day_date: dayDate,
    entry_date: dayDate,
    amount_ml: amountMl,
    water_ml: amountMl,
    created_at: new Date().toISOString(),
  };

  console.info("[WATER] Tentando insert em hydration_logs", {
    table: "hydration_logs",
    payload,
  });

  let { data, error } = await supabaseClient
    .from("hydration_logs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    const payloadFallback = {
      user_id: userId,
      amount_l: Number((Number(amountMl || 0) / 1000).toFixed(3)),
      created_at: new Date().toISOString(),
    };

    const fallbackResult = await supabaseClient
      .from("hydration_logs")
      .insert(payloadFallback)
      .select("id")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error("[WATER] Erro no insert em hydration_logs", { payload }, error);
    return { ok: false, error };
  }

  console.info("[WATER] Insert em hydration_logs executado com sucesso", {
    insertedId: data?.id ?? null,
    payload,
  });
  return { ok: true, insertedId: data?.id ?? null };
};

export const undoLastHydration = async ({
  supabase: supabaseClient = supabase,
  userId,
  dayDate,
}) => {
  const [logRows, diaryRows] = await Promise.all([
    getHydrationRowsFromLogs(supabaseClient, userId, dayDate),
    getHydrationRowsFromDiary(supabaseClient, userId, dayDate),
  ]);

  const latest = getLatestHydrationEntry(logRows, diaryRows);
  if (!latest?.id) {
    return { ok: false, reason: "no_hydration" };
  }

  const tableName =
    latest.source === "food_diary_entries" ? "food_diary_entries" : "hydration_logs";

  const { error: deleteError } = await supabaseClient
    .from(tableName)
    .delete()
    .eq("id", latest.id);

  if (deleteError) {
    return { ok: false, error: deleteError };
  }

  return { ok: true, deletedId: latest.id };
};
