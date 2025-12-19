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
  } catch (err) {
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
  } catch (err) {
    return { templates: [], sessions: [], reminders: [] };
  }
};

const writeData = async (data) => {
  await ensureFile();
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
};

const generateId = () => crypto.randomUUID();

const supabaseAvailable = Boolean(supabase);

const normalizeSportsArray = (sports) => {
  if (Array.isArray(sports)) {
    return sports.map((s) => String(s).trim()).filter(Boolean);
  }

  if (typeof sports === "string") {
    const trimmed = sports.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch (err) {
        // fallback para tratamento comum
      }
    }

    return trimmed
      .split(",")
      .map((s) => String(s).replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  }

  return [];
};

const saveTemplateToSupabase = async (template) => {
  try {
    const { data, error } = await supabase
      .from("workout_templates")
      .upsert(template)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn("Supabase indisponível para templates, fallback para JSON:", err);
    return null;
  }
};

const saveSessionToSupabase = async (session) => {
  try {
    const row = {
      id: session.id,
      user_id: session.userId,
      workout_name: session.workoutName || session.name || "",
      muscle_groups: Array.isArray(session.muscleGroups)
        ? session.muscleGroups.join(", ")
        : "",
      sports_list: Array.isArray(session.sports)
        ? session.sports.join(", ")
        : "",
      performed_at: session.date ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert(row)
      .select(
        "id, user_id, workout_name, muscle_groups, sports_list, performed_at"
      )
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      workoutName: data.workout_name,
      muscleGroups: data.muscle_groups
        ? data.muscle_groups.split(",").map((s) => s.trim())
        : [],
      sports: data.sports_list
        ? data.sports_list.split(",").map((s) => s.trim())
        : [],
      date: data.performed_at,
    };
  } catch (error) {
    console.error("Erro ao salvar sessão no Supabase, usando JSON:", error);
    return null;
  }
};

const saveReminderToSupabase = async (reminder) => {
  try {
    // Monta o objeto exatamente com os nomes das colunas do banco
    const payload = {
      id: reminder.id || undefined, // deixa o Postgres gerar se vier undefined
      user_id: reminder.userId || null,
      type: reminder.type || "workout",
      workout_name:
        reminder.workoutName || reminder.workout_name || null,
      date: reminder.date || null,
      created_at: reminder.created_at || new Date().toISOString(),
    };

    // Garantir que não vamos violar o NOT NULL de workout_name
    if (!payload.workout_name) {
      throw new Error(
        "workout_name é obrigatório para salvar em workout_reminders"
      );
    }

    const { data, error } = await supabase
      .from("workout_reminders")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    // Normaliza o objeto que o resto da API usa
    return {
      ...reminder,
      id: data.id,
      userId: data.user_id,
      workoutName: data.workout_name,
      date: data.date,
      created_at: data.created_at,
      type: data.type,
    };
  } catch (err) {
    console.warn(
      "Supabase indisponível para lembretes, fallback para JSON:",
      err
    );
    return null;
  }
};

export const listWorkoutTemplates = async (userId) => {
  if (!userId) return [];

  if (supabaseAvailable) {
    try {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("*")
        .eq("userId", userId)
        .order("updatedAt", { ascending: false });

      if (error) throw error;
      if (Array.isArray(data) && data.length) return data;
    } catch (err) {
      console.warn("Supabase indisponível para listagem de templates, fallback para JSON:", err);
    }
  }

  const db = await readData();
  return (db.templates || []).filter((tpl) => tpl.userId === userId);
};

export const deleteWorkoutTemplate = async (id, userId) => {
  if (!id || !userId) return false;

  if (supabaseAvailable) {
    try {
      const { error } = await supabase
        .from("workout_templates")
        .delete()
        .eq("id", id)
        .eq("userId", userId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.warn("Supabase indisponível para deletar template, fallback para JSON:", err);
    }
  }

  const db = await readData();
  db.templates = (db.templates || []).filter(
    (tpl) => !(tpl.id === id && tpl.userId === userId)
  );
  await writeData(db);
  return true;
};

export const upsertWorkoutTemplate = async (template) => {
  const now = new Date().toISOString();
  const payload = {
    ...template,
    id: template.id || generateId(),
    createdAt: template.createdAt || now,
    updatedAt: now,
  };

  if (supabaseAvailable) {
    const saved = await saveTemplateToSupabase(payload);
    if (saved) return saved;
  }

  const db = await readData();
  const existingIndex = (db.templates || []).findIndex((t) => t.id === payload.id);
  if (existingIndex >= 0) {
    db.templates[existingIndex] = payload;
  } else {
    db.templates.unshift(payload);
  }
  await writeData(db);
  return payload;
};

export const createWorkoutSession = async (session) => {
  const now = new Date().toISOString();
  const sportsActivities = normalizeSportsArray(
    session.sportsActivities ?? session.sports ?? session.sports_activities
  );
  const payload = {
    ...session,
    id: session.id || generateId(),
    sportsActivities,
    sports: sportsActivities,
    sports_activities: sportsActivities,
    createdAt: session.createdAt || now,
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

export const listWorkoutSessions = async (userId, { from, to }) => {
  if (!userId) return [];

  if (supabaseAvailable) {
    try {
      let query = supabase
        .from("workout_sessions")
        .select(
          "id, user_id, workout_name, muscle_groups, sports_list, performed_at"
        )
        .eq("user_id", userId)
        .order("performed_at", { ascending: false });

      if (from) query = query.gte("performed_at", from);
      if (to) query = query.lte("performed_at", to);

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        workoutName: row.workout_name,
        muscleGroups: row.muscle_groups
          ? row.muscle_groups.split(",").map((s) => s.trim())
          : [],
        sports: row.sports_list
          ? row.sports_list.split(",").map((s) => s.trim())
          : [],
        date: row.performed_at,
      }));
    } catch (error) {
      console.error(
        "Supabase indisponível para sessões, fallback para JSON:",
        error
      );
    }
  }

  const db = await readData();
  return (db.sessions || [])
    .filter((item) => item.userId === userId)
    .filter((item) => {
      if (from && item.date < from) return false;
      if (to && item.date > to) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      sportsActivities: normalizeSportsArray(
        item.sportsActivities ?? item.sports ?? item.sports_activities
      ),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};

export const summarizeProgress = async (userId, period) => {
  const now = new Date();
  let fromDate;
  if (period === "month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  }

  const sessions = await listWorkoutSessions(userId, { from: fromDate, to: null });
  const totalSessions = sessions.length;
  const byMuscleGroup = {};

  sessions.forEach((session) => {
    (session.muscleGroups || []).forEach((group) => {
      byMuscleGroup[group] = (byMuscleGroup[group] || 0) + 1;
    });
  });

  return { totalSessions, byMuscleGroup };
};

export const saveWorkoutReminder = async (reminder) => {
  const payload = { ...reminder, id: reminder.id || generateId() };

  if (supabaseAvailable) {
    const saved = await saveReminderToSupabase(payload);
    if (saved) return saved;
  }

  const db = await readData();
  db.reminders = [payload, ...(db.reminders || [])];
  await writeData(db);
  return payload;
};
