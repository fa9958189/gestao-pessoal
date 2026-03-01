import cron from "node-cron";
import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "0 23 * * *";
const ALERT_TYPE = "daily_goals_23h";
const GOALS_INTERVAL_MINUTES =
  Number(process.env.GOALS_INTERVAL_MINUTES) || 15; // PERF: intervalo configurável

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

const formatNumber = (value, decimals = 0) => Number(value || 0).toFixed(decimals);

const clampPercent = (value) => Math.min(120, Math.max(0, value));

const computeAvatarState = ({ pctCalories, pctProtein, pctWater }) => {
  const average = (pctCalories + pctProtein + pctWater) / 3;

  if (average >= 85) return "Em forma";
  if (average >= 55) return "Em progresso";
  return "Recuperação";
};

const computeAvatarTip = ({ pctCalories, pctProtein, pctWater }) => {
  const worstMetric = [
    { key: "water", pct: pctWater },
    { key: "protein", pct: pctProtein },
    { key: "calories", pct: pctCalories },
  ].sort((a, b) => a.pct - b.pct)[0]?.key;

  switch (worstMetric) {
    case "water":
      return "Bebe mais água.";
    case "protein":
      return "Capricha na proteína.";
    case "calories":
      if (pctCalories > 110) return "Reduz um pouco as calorias.";
      return "Ajusta as calorias.";
    default:
      return "Segue firme nas metas.";
  }
};

const fetchTableColumns = async (tableName) => {
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
    userColumn: pickColumn(columns, ["user_id", "auth_id"]) || "user_id",
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
  const userColumn = pickColumn(columns, ["user_id", "auth_id"]);
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
    .from("profiles_auth")
    .select("id, auth_id, whatsapp, subscription_status, role")
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
    .from("profiles_auth")
    .select("water_goal_l, water_goal, water")
    .eq("auth_id", userId)
    .maybeSingle();

  if (authError) {
    console.warn("⚠️ Erro ao buscar meta de água em profiles_auth:", authError.message);
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

const buildDailyGoalsMessage = ({ totals, goals, missing }) => {
  const caloriesText = `${formatNumber(totals.calories, 0)} / ${formatNumber(
    goals.calories,
    0
  )}`;
  const proteinText = `${formatNumber(totals.protein, 0)}g / ${formatNumber(
    goals.protein,
    0
  )}g`;
  const waterText = `${formatNumber(totals.waterL, 1)}L / ${formatNumber(
    goals.waterL,
    1
  )}L`;
  const pctCalories = goals.calories
    ? clampPercent((totals.calories / goals.calories) * 100)
    : 0;
  const pctProtein = goals.protein
    ? clampPercent((totals.protein / goals.protein) * 100)
    : 0;
  const pctWater = goals.waterL ? clampPercent((totals.waterL / goals.waterL) * 100) : 0;
  const avatarState = computeAvatarState({ pctCalories, pctProtein, pctWater });
  const avatarTip = computeAvatarTip({ pctCalories, pctProtein, pctWater });
  const avatarLines = [`👤 Seu Avatar hoje: ${avatarState}`, `💡 Dica: ${avatarTip}`];

  if (missing.calories === 0 && missing.protein === 0 && missing.waterL === 0) {
    return [
      "✅ Parabéns! Você bateu suas metas de hoje! 🎉",
      `🔥 Calorias: ${caloriesText}`,
      `💪 Proteína: ${proteinText}`,
      `💧 Água: ${waterText}`,
      ...avatarLines,
      "Continua assim!",
    ].join("\n");
  }

  return [
    "⚠️ Hoje você NÃO bateu todas as metas.",
    `🔥 Calorias: ${caloriesText} (faltou ${formatNumber(missing.calories, 0)})`,
    `💪 Proteína: ${proteinText} (faltou ${formatNumber(missing.protein, 0)}g)`,
    `💧 Água: ${waterText} (faltou ${formatNumber(missing.waterL, 1)}L)`,
    ...avatarLines,
    "Amanhã dá pra fechar 💪",
  ].join("\n");
};

const runDailyGoalsReminder = async () => {
  const todayStr = formatDateOnlyInSaoPaulo();
  const config = await getLogTableConfig();
  const users = await fetchActiveUsers();

  for (const user of users) {
    const userId = user.auth_id || user.id;
    if (!userId || !user.whatsapp) continue;

    try {
      const alreadySent = await hasNotificationBeenSent(config, userId, todayStr);
      if (alreadySent) continue;

      const [goals, totals] = await Promise.all([
        fetchUserGoals(userId),
        fetchDailyTotals(userId, todayStr),
      ]);

      const missing = {
        calories: Math.max(0, goals.calories - totals.calories),
        protein: Math.max(0, goals.protein - totals.protein),
        waterL: Math.max(0, goals.waterL - totals.waterL),
      };

      const message = buildDailyGoalsMessage({ totals, goals, missing });

      await sendWhatsAppMessage({ phone: user.whatsapp, message });

      const payload = buildLogPayload(config, {
        userId,
        dateStr: todayStr,
        message,
        status: "success",
      });

      await logNotification(config, payload);
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
