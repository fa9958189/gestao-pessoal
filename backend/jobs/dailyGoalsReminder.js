import cron from "node-cron";
import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "0 23 * * *";
const ALERT_TYPE = "daily_goals_23h";
const GOALS_INTERVAL_MINUTES =
  Number(process.env.GOALS_INTERVAL_MINUTES) || 15; // PERF: intervalo configurável
const ENABLE_DAILY_GOALS_LOGGING =
  process.env.ENABLE_DAILY_GOALS_LOGGING === "true";

const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_PROTEIN_GOAL = 120;
const DEFAULT_WATER_GOAL_L = 2.5;

const LOG_TABLE_PREFERRED = "registros_de_alertas_do_whatsapp";
const LOG_TABLE_FALLBACK = "daily_goals_notifications";

let logTableConfig = null;

const formatDateOnlyInSaoPaulo = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const fetchTableColumns = async (tableName) => {
  if (!ENABLE_DAILY_GOALS_LOGGING) {
    return [];
  }

  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName);

  if (error) {
    console.warn("⚠️ Erro ao buscar colunas da tabela:", tableName, error.message);
    return [];
  }

  return (data || []).map((row) => row.column_name);
};

const pickColumn = (columns, options) =>
  options.find((candidate) => columns.includes(candidate)) || null;

const resolveLogTableFallback = (columns) => {
  const columnSet = new Set(columns);
  return {
    tableName: LOG_TABLE_FALLBACK,
    columns: columnSet,
    userColumn: pickColumn(columns, ["user_id", "id"]) || "user_id",
    dateColumn: pickColumn(columns, ["entry_date", "day_date", "date"]) || "entry_date",
    typeColumn: pickColumn(columns, ["alert_type", "tipo", "type"]) || "alert_type",
    statusColumn: pickColumn(columns, ["status"]),
    messageColumn: pickColumn(columns, ["message", "mensagem", "texto", "body"]),
    sentAtColumn: pickColumn(columns, ["sent_at", "created_at"]),
  };
};

const resolveLogTable = async () => {
  const preferredColumns = await fetchTableColumns(LOG_TABLE_PREFERRED);
  const columns = preferredColumns.length
    ? preferredColumns
    : await fetchTableColumns(LOG_TABLE_FALLBACK);

  const tableName = preferredColumns.length ? LOG_TABLE_PREFERRED : LOG_TABLE_FALLBACK;

  const columnSet = new Set(columns);
  const userColumn = pickColumn(columns, ["user_id", "id"]);
  const dateColumn = pickColumn(columns, [
    "entry_date",
    "day_date",
    "data",
    "data_hoje",
    "date",
    "sent_date",
  ]);
  const typeColumn = pickColumn(columns, ["alert_type", "tipo", "type"]);
  const statusColumn = pickColumn(columns, ["status"]);
  const messageColumn = pickColumn(columns, ["message", "mensagem", "texto", "body"]);
  const sentAtColumn = pickColumn(columns, ["sent_at", "created_at"]);

  if (!userColumn || !dateColumn || !typeColumn) {
    if (tableName === LOG_TABLE_PREFERRED) {
      const fallbackColumns = await fetchTableColumns(LOG_TABLE_FALLBACK);
      return resolveLogTableFallback(fallbackColumns);
    }
    console.warn(
      "⚠️ Tabela de logs sem colunas suficientes para idempotência:",
      tableName
    );
  }

  return {
    tableName,
    columns: columnSet,
    userColumn,
    dateColumn,
    typeColumn,
    statusColumn,
    messageColumn,
    sentAtColumn,
  };
};

const getLogTableConfig = async () => {
  if (!ENABLE_DAILY_GOALS_LOGGING) {
    return null;
  }

  if (!logTableConfig) {
    logTableConfig = await resolveLogTable();
  }
  return logTableConfig;
};

const buildLogPayload = (config, { userId, dateStr, message, status }) => {
  const payload = {};

  if (config.userColumn) payload[config.userColumn] = userId;
  if (config.dateColumn) payload[config.dateColumn] = dateStr;
  if (config.typeColumn) payload[config.typeColumn] = ALERT_TYPE;
  if (config.statusColumn) payload[config.statusColumn] = status;
  if (config.messageColumn) payload[config.messageColumn] = message;
  if (config.sentAtColumn) payload[config.sentAtColumn] = new Date().toISOString();

  return payload;
};

const hasNotificationBeenSent = async (config, userId, dateStr) => {
  if (!ENABLE_DAILY_GOALS_LOGGING) {
    return false;
  }

  if (!config?.tableName || !config.userColumn || !config.dateColumn || !config.typeColumn) {
    return false;
  }

  const { data, error } = await supabase
    .from(config.tableName)
    .select("id")
    .eq(config.userColumn, userId)
    .eq(config.dateColumn, dateStr)
    .eq(config.typeColumn, ALERT_TYPE)
    .maybeSingle();

  if (error) {
    console.error("❌ Erro ao verificar log diário:", error.message);
    return false;
  }

  return Boolean(data);
};

const logNotification = async (config, payload) => {
  if (!ENABLE_DAILY_GOALS_LOGGING) {
    return;
  }

  if (!config?.tableName) {
    return;
  }

  const { error } = await supabase.from(config.tableName).insert(payload);
  if (error) {
    console.error("❌ Erro ao registrar log diário:", error.message);
  }
};

const fetchActiveUsers = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, whatsapp, subscription_status, role, goal_type")
    .not("whatsapp", "is", null)
    .neq("whatsapp", "")
    .neq("subscription_status", "inactive");

  if (error) {
    throw new Error(`Erro ao buscar usuários ativos: ${error.message}`);
  }

  return data || [];
};

const fetchUserGoals = async (userId) => {
  const { data: profile, error: profileError } = await supabase
    .from("food_diary_profile")
    .select("calorie_goal, protein_goal, water_goal_l")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Erro ao buscar metas do diário alimentar: ${profileError.message}`);
  }

  const { data: authProfile, error: authError } = await supabase
    .from("profiles")
    .select("water_goal_l, water_goal, water")
    .eq("id", userId)
    .maybeSingle();

  if (authError) {
    console.warn("⚠️ Erro ao buscar meta de água em profiles:", authError.message);
  }

  const authWaterGoal = Number(
    authProfile?.water_goal_l ?? authProfile?.water_goal ?? authProfile?.water
  );

  return {
    calories: Number(profile?.calorie_goal) || DEFAULT_CALORIE_GOAL,
    protein: Number(profile?.protein_goal) || DEFAULT_PROTEIN_GOAL,
    waterL: Number.isFinite(authWaterGoal)
      ? authWaterGoal
      : Number(profile?.water_goal_l) || DEFAULT_WATER_GOAL_L,
  };
};

const fetchDailyTotals = async (userId, dayDate) => {
  const { data: entries, error: entriesError } = await supabase
    .from("food_diary_entries")
    .select("calories, protein, water_ml, meal_type")
    .eq("user_id", userId)
    .eq("entry_date", dayDate);

  if (entriesError) {
    throw new Error(`Erro ao buscar entradas do diário alimentar: ${entriesError.message}`);
  }

  const { data: hydrationLogs, error: hydrationError } = await supabase
    .from("hydration_logs")
    .select("amount_ml, water_ml, day_date, entry_date")
    .eq("user_id", userId)
    .or(`day_date.eq.${dayDate},entry_date.eq.${dayDate}`);

  if (hydrationError) {
    console.warn("⚠️ Erro ao buscar hidratação:", hydrationError.message);
  }

  const totals = (entries || []).reduce(
    (acc, entry) => {
      if (entry.meal_type !== "hydration") {
        acc.calories += Number(entry.calories || 0);
        acc.protein += Number(entry.protein || 0);
      }
      acc.waterMl += Number(entry.water_ml || 0);
      return acc;
    },
    { calories: 0, protein: 0, waterMl: 0 }
  );

  const hydrationMl = (hydrationLogs || []).reduce(
    (sum, row) => sum + Number(row.amount_ml || row.water_ml || 0),
    0
  );

  return {
    calories: totals.calories,
    protein: totals.protein,
    waterL: (totals.waterMl + hydrationMl) / 1000,
  };
};

const resolveGoalTypeMessage = (goalType) => {
  switch (goalType) {
    case "lose_weight":
      return "🔥 Você está no caminho certo para perder peso.";
    case "gain_muscle":
      return "💪 Continue alimentando seu corpo para crescimento muscular.";
    case "maintain":
    default:
      return "⚖️ Manter equilíbrio é o segredo da saúde.";
  }
};

const buildDailyGoalsMessage = ({ name, goalReached, goalType }) => {
  const userName = name || "";
  const objectiveLine = resolveGoalTypeMessage(goalType);

  if (goalReached) {
    return [
      `🎉 Parabéns ${userName}!`,
      "",
      "Hoje você atingiu suas metas:",
      "",
      "Calorias ✔",
      "Proteína ✔",
      "Água ✔",
      "",
      "Continue assim! Consistência gera resultado.",
      "",
      objectiveLine,
    ].join("\n");
  }

  return [
    `⚠️ ${userName}, hoje suas metas não foram totalmente atingidas.`,
    "",
    "Mas não tem problema!",
    "Amanhã é uma nova oportunidade.",
    "",
    "Continue firme!",
    "",
    objectiveLine,
  ].join("\n");
};

const runDailyGoalsReminder = async () => {
  const todayStr = formatDateOnlyInSaoPaulo();
  const config = await getLogTableConfig();
  const users = await fetchActiveUsers();

  for (const user of users) {
    const userId = user.id;
    if (!userId || !user.whatsapp) continue;

    try {
      const alreadySent = await hasNotificationBeenSent(config, userId, todayStr);
      if (alreadySent) continue;

      const [goals, totals] = await Promise.all([
        fetchUserGoals(userId),
        fetchDailyTotals(userId, todayStr),
      ]);

      const calorias_consumidas = totals.calories;
      const meta_calorias = goals.calories;
      const proteina_consumida = totals.protein;
      const meta_proteina = goals.protein;
      const agua_consumida = totals.waterL;
      const meta_agua = goals.waterL;

      const goalReached =
        calorias_consumidas >= meta_calorias &&
        proteina_consumida >= meta_proteina &&
        agua_consumida >= meta_agua;

      const message = buildDailyGoalsMessage({
        name: user.name,
        goalReached,
        goalType: user.goal_type,
      });

      await sendWhatsAppMessage({ phone: user.whatsapp, message });

      if (ENABLE_DAILY_GOALS_LOGGING) {
        const payload = buildLogPayload(config, {
          userId,
          dateStr: todayStr,
          message,
          status: "success",
        });

        await logNotification(config, payload);
      }
    } catch (err) {
      console.error("❌ Erro ao enviar metas diárias:", err.message || err);
    }
  }
};

export const startDailyGoalsReminder = () => {
  let isRunning = false;
  let lastRunAt = 0;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      const now = Date.now();
      if (isRunning) {
        return;
      }

      if (now - lastRunAt < GOALS_INTERVAL_MINUTES * 60 * 1000) {
        return;
      }

      isRunning = true;
      lastRunAt = now; // PERF: evita reentrância por intervalo mínimo

      try {
        await runDailyGoalsReminder();
      } catch (err) {
        console.error("❌ Erro no scheduler de metas diárias:", err.message || err);
      } finally {
        isRunning = false;
      }
    },
    { timezone: TZ }
  );

  console.log(
    `⏰ Scheduler de metas diárias ativo (${CRON_EXPRESSION} - ${TZ}).`
  );
};
