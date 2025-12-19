import { supabase } from "./supabase.js";

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 120,
  water: 2.5,
};

const DEFAULT_BODY = {
  heightCm: "",
  weightKg: "",
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
  date: row.entry_date,
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
    profile?.weight_kg != null && profile.weight_kg !== ""
      ? profile.weight_kg
      : DEFAULT_BODY.weightKg,
});

export const getFoodDiaryState = async (userId) => {
  const entriesByDate = {};

  const { data: entries, error: entriesError } = await supabase
    .from("food_diary_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (entriesError) throw entriesError;

  (entries || []).forEach((row) => {
    const date = row.entry_date;
    if (!date) return;

    if (!entriesByDate[date]) entriesByDate[date] = [];
    entriesByDate[date].push(normalizeEntryFromDb(row));
  });

  const { data: profile, error: profileError } = await supabase
    .from("food_diary_profile")
    .select("calorie_goal, protein_goal, water_goal_l, height_cm, weight_kg")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const goals = mapGoalsFromProfile(profile);
  const body = mapBodyFromProfile(profile);

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
    weight_kg: body.weightKg !== "" ? body.weightKg : null,
  };

  const { error: profileError } = await supabase
    .from("food_diary_profile")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) throw profileError;

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
  }

  return getFoodDiaryState(userId);
};
