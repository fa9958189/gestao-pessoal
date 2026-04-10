import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "./supabase.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "workouts.json");

const ensureFile = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(
      dataFile,
      JSON.stringify({ templates: [], sessions: [], reminders: [] }, null, 2)
    );
  }
};

const readData = async () => {
  await ensureFile();
  const raw = await fs.readFile(dataFile, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { templates: [], sessions: [], reminders: [] };
  }
};

const writeData = async (data) => {
  await ensureFile();
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
};

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

const saveSessionToSupabase = async (session) => {
  try {
    const normalizedDate = toDateOnly(session.date || getLocalDateOnly());

    const row = {
      id: session.id,
      user_id: session.userId,
      workout_name: session.workoutName || "",
      muscle_groups: (session.muscleGroups || []).join(", "),
      sports_list: (session.sports || []).join(", "),
      performed_at: toSafePerformedAt(normalizedDate),
    };

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      workoutName: data.workout_name,
      muscleGroups: data.muscle_groups
        ? data.muscle_groups.split(",")
        : [],
      sports: data.sports_list ? data.sports_list.split(",") : [],
      date: toDateOnly(data.performed_at),
    };
  } catch (error) {
    console.error("Erro ao salvar sessão:", error);
    return null;
  }
};

export const createWorkoutSession = async (session) => {
  const payload = {
    ...session,
    id: session.id || generateId(),
    date: getLocalDateOnly(),
    sports: normalizeSportsArray(session.sports),
  };

  if (supabaseAvailable) {
    const saved = await saveSessionToSupabase(payload);
    if (saved) return saved;
  }

  const db = await readData();
  db.sessions = [payload, ...(db.sessions || [])];
  await writeData(db);

  return payload;
};

export const listWorkoutSessions = async (userId) => {
  if (!userId) return [];

  const { data } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false });

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    workoutName: row.workout_name,
    muscleGroups: row.muscle_groups
      ? row.muscle_groups.split(",")
      : [],
    sports: row.sports_list ? row.sports_list.split(",") : [],
    date: toDateOnly(row.performed_at),
  }));
};

export const deleteWorkoutSession = async (id, userId) => {
  if (!id || !userId) return false;

  if (supabaseAvailable) {
    try {
      const { data, error } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id");

      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    } catch (err) {
      console.warn("Erro ao deletar sessão:", err);
    }
  }

  const db = await readData();
  const before = (db.sessions || []).length;

  db.sessions = (db.sessions || []).filter(
    (s) => !(s.id === id && s.userId === userId)
  );

  await writeData(db);

  return (db.sessions || []).length !== before;
};
