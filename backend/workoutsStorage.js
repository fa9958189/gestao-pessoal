import { supabase } from "./supabase.js";
import crypto from "crypto";

const generateId = () => crypto.randomUUID();
const supabaseAvailable = Boolean(supabase);

function getLocalDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const isDateOnlyString = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const toSafePerformedAt = (value) => {
  if (!value) return new Date().toISOString();

  const raw = String(value).trim();

  if (isDateOnlyString(raw)) {
    return `${raw}T12:00:00.000`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
};

const toDateOnly = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return getLocalDateOnly();
  if (isDateOnlyString(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return getLocalDateOnly();

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeSportsArray = (sports) => {
  if (Array.isArray(sports)) {
    return sports.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof sports === "string") {
    return sports.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const periodStartFrom = (period) => {
  const now = new Date();
  if (period === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === "year") {
    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
};

//
// =========================
// TEMPLATES
// =========================
//

export const listWorkoutTemplates = async (userId) => {
  const { data } = await supabase
    .from("workout_templates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return data || [];
};

export const createWorkoutTemplate = async (template) => {
  const { data, error } = await supabase
    .from("workout_templates")
    .insert({
      id: generateId(),
      user_id: template.userId,
      name: template.name,
      muscle_groups: (template.muscleGroups || []).join(", "),
      sports_list: normalizeSportsArray(template.sportsActivities || template.sports).join(", "),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const upsertWorkoutTemplate = async (template) => {
  if (template?.id) {
    const { data, error } = await supabase
      .from("workout_templates")
      .update({
        name: template.name,
        muscle_groups: (template.muscleGroups || []).join(", "),
        sports_list: normalizeSportsArray(template.sportsActivities || template.sports).join(", "),
      })
      .eq("id", template.id)
      .eq("user_id", template.userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  return createWorkoutTemplate(template);
};

//
// =========================
// SESSÕES
// =========================
//

export const createWorkoutSession = async (session) => {
  const normalizedDate = toDateOnly(session.date || getLocalDateOnly());

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      id: generateId(),
      user_id: session.userId,
      workout_name: session.workoutName || session.name || "",
      muscle_groups: (session.muscleGroups || []).join(", "),
      sports_list: normalizeSportsArray(session.sports).join(", "),
      performed_at: toSafePerformedAt(normalizedDate),
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    workoutName: data.workout_name,
    muscleGroups: data.muscle_groups ? splitList(data.muscle_groups) : [],
    sports: data.sports_list ? splitList(data.sports_list) : [],
    date: toDateOnly(data.performed_at),
  };
};

export const listWorkoutSessions = async (userId) => {
  const { data } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false });

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    workoutName: row.workout_name,
    muscleGroups: row.muscle_groups ? splitList(row.muscle_groups) : [],
    sports: row.sports_list ? splitList(row.sports_list) : [],
    date: toDateOnly(row.performed_at),
  }));
};

export const deleteWorkoutSession = async (id, userId) => {
  if (!id || !userId) return false;

  const { data, error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
};

export const summarizeProgress = async (userId, period = "month") => {
  const sessions = await listWorkoutSessions(userId);
  const start = periodStartFrom(period);

  const filtered = sessions.filter((item) => {
    const parsed = new Date(item.date || item.performed_at || "");
    return !Number.isNaN(parsed.getTime()) && parsed >= start;
  });

  return {
    period,
    totalSessions: filtered.length,
    lastSessionDate: filtered[0]?.date || null,
  };
};

export const saveWorkoutReminder = async (reminder) => ({
  id: reminder.id || generateId(),
  ...reminder,
  createdAt: new Date().toISOString(),
});
