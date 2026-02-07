const TZ = "America/Sao_Paulo";
const ALERT_WINDOW_START_HOUR = 8;
const ALERT_WINDOW_END_HOUR = 20;
const DAILY_GOALS_WINDOW_START_HOUR = 23;
const DAILY_GOALS_WINDOW_END_HOUR = 23;
const DAILY_GOALS_WINDOW_END_MINUTE = 20;

const DEFAULT_MAX_PER_DAY = 3;
const DEFAULT_LOW_BALANCE_BRL = 200;
const DEFAULT_CATEGORY_SPIKE_BRL = 400;
const DEFAULT_CATEGORY_SPIKE_PCT = 0.35;
const DEFAULT_JUNK_KEYWORDS = [
  "batata frita",
  "refrigerante",
  "hamburguer",
  "lanche",
  "pizza",
  "doce",
  "brigadeiro",
  "salgadinho",
];
const DEFAULT_JUNK_REPEAT_COUNT = 3;
const DEFAULT_PROTEIN_MIN = 80;
const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_PROTEIN_GOAL = 120;
const DEFAULT_WATER_GOAL_L = 2.5;
const DEFAULT_MEAL_ADAPTIVE_ENABLED = true;
const DEFAULT_MEAL_LOOKBACK_DAYS = 14;
const DEFAULT_MEAL_MIN_SAMPLES = 3;
const DEFAULT_MEAL_WINDOW_MINUTES = 20;
const MEAL_DAY_START_MINUTES = 300;
const MEAL_DAY_END_MINUTES = 1350;
const MEAL_WINDOWS = [
  {
    label: "Café da manhã",
    startHour: 7,
    startMinute: 0,
    endHour: 7,
    endMinute: 20,
  },
  {
    label: "Almoço",
    startHour: 11,
    startMinute: 0,
    endHour: 11,
    endMinute: 20,
  },
  {
    label: "Lanche",
    startHour: 15,
    startMinute: 40,
    endHour: 16,
    endMinute: 0,
  },
  {
    label: "Jantar",
    startHour: 19,
    startMinute: 30,
    endHour: 19,
    endMinute: 50,
  },
];

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function toSaoPaulo(dateLike) {
  return new Date(
    new Date(dateLike || Date.now()).toLocaleString("en-US", { timeZone: TZ })
  );
}

function formatDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getTimeZoneOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "UTC";
  const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;

  const sign = match[1]?.startsWith("-") ? -1 : 1;
  const hours = Math.abs(Number(match[1])) || 0;
  const minutes = Number(match[2] || "0");
  return sign * (hours * 60 + minutes);
}

function getDayBounds(date) {
  const offsetMinutes = getTimeZoneOffsetMinutes(date);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const startUtc = Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMinutes * 60000;
  const endUtc =
    Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMinutes * 60000;

  return { start: new Date(startUtc), end: new Date(endUtc) };
}

function isWithinAlertWindow(date) {
  const hour = date.getHours();
  return hour >= ALERT_WINDOW_START_HOUR && hour <= ALERT_WINDOW_END_HOUR;
}

function isWithinDailyGoalsWindow(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  return (
    hour >= DAILY_GOALS_WINDOW_START_HOUR &&
    hour <= DAILY_GOALS_WINDOW_END_HOUR &&
    minute <= DAILY_GOALS_WINDOW_END_MINUTE
  );
}

function isWithinWindow(date, window) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  return minutes >= start && minutes <= end;
}

function getFallbackMealWindows() {
  return MEAL_WINDOWS.map((window) => ({
    label: window.label,
    startMin: window.startHour * 60 + window.startMinute,
    endMin: window.endHour * 60 + window.endMinute,
  }));
}

function getMealWindow(date) {
  return MEAL_WINDOWS.find((window) => isWithinWindow(date, window)) || null;
}

function getMealWindowByMinutes(mealWindows, nowMinutes) {
  return mealWindows.find(
    (window) => nowMinutes >= window.startMin && nowMinutes <= window.endMin
  );
}

function parseBooleanEnv(value, fallback) {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function getAdaptiveMealConfig() {
  return {
    enabled: parseBooleanEnv(
      process.env.ALERT_MEAL_ADAPTIVE,
      DEFAULT_MEAL_ADAPTIVE_ENABLED
    ),
    lookbackDays:
      Number(process.env.ALERT_MEAL_LOOKBACK_DAYS) || DEFAULT_MEAL_LOOKBACK_DAYS,
    minSamples: Number(process.env.ALERT_MEAL_MIN_SAMPLES) || DEFAULT_MEAL_MIN_SAMPLES,
    windowMinutes:
      Number(process.env.ALERT_MEAL_WINDOW_MINUTES) || DEFAULT_MEAL_WINDOW_MINUTES,
  };
}

function clampMealWindow(startMin, endMin) {
  const start = Math.max(startMin, MEAL_DAY_START_MINUTES);
  const end = Math.min(endMin, MEAL_DAY_END_MINUTES);
  if (end < start) {
    return { startMin: start, endMin: start };
  }
  return { startMin: start, endMin: end };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function isWithinMealReminderWindow(date) {
  const { enabled } = getAdaptiveMealConfig();
  if (!enabled) {
    return Boolean(getMealWindow(date));
  }
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= MEAL_DAY_START_MINUTES && minutes <= MEAL_DAY_END_MINUTES;
}

function parseKeywords() {
  const raw = process.env.ALERT_JUNK_KEYWORDS;
  if (!raw) return DEFAULT_JUNK_KEYWORDS;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchActiveUsers(supabase) {
  const { data, error } = await supabase
    .from("profiles_auth")
    .select("id, auth_id, name, whatsapp, subscription_status, role")
    .not("whatsapp", "is", null)
    .neq("whatsapp", "")
    .neq("subscription_status", "inactive");

  if (error) {
    throw new Error(`Erro ao buscar usuários ativos: ${error.message}`);
  }

  return (data || []).filter((user) => user.role !== "admin");
}

async function fetchDailyAlertCount(supabase, userId, start, end) {
  const { count, error } = await supabase
    .from("whatsapp_alert_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) {
    console.error("❌ Erro ao contar alertas do dia:", error.message);
    return 0;
  }

  return count || 0;
}

async function hasAlertBeenSent(supabase, userId, alertType, alertKey) {
  const { data, error } = await supabase
    .from("whatsapp_alert_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("alert_type", alertType)
    .eq("alert_key", alertKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar alerta existente: ${error.message}`);
  }

  return Boolean(data);
}

async function logAlert(supabase, { userId, alertType, alertKey }) {
  const { error } = await supabase.from("whatsapp_alert_logs").insert({
    user_id: userId,
    alert_type: alertType,
    alert_key: alertKey,
  });

  if (error) {
    if (
      error.code === "23505" ||
      (typeof error.message === "string" &&
        error.message.toLowerCase().includes("duplicate"))
    ) {
      return false;
    }
    throw new Error(`Erro ao registrar alerta: ${error.message}`);
  }

  return true;
}

async function handleTrialExpirations({ supabase, sendMessage, now }) {
  const adminNumber =
    process.env.ADMIN_WHATSAPP_NUMBER || "+5563992393705";
  const referenceDate = now instanceof Date ? now : new Date(now || Date.now());
  const alertDate = formatDate(toSaoPaulo(referenceDate));

  let trialUsers = [];
  try {
    const { data, error } = await supabase
      .from("profiles_auth")
      .select("id, auth_id, name, email, whatsapp, trial_end_at, trial_notified_at")
      .eq("trial_status", "trial")
      .eq("subscription_status", "active")
      .is("trial_notified_at", null)
      .lte("trial_end_at", referenceDate.toISOString());

    if (error) {
      throw error;
    }

    trialUsers = data || [];
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const missingColumn =
      error?.code === "42703" ||
      (message.includes("column") && message.includes("trial"));

    if (!missingColumn) {
      console.error("❌ Erro ao buscar trials expirados:", error.message);
      return;
    }

    const { data, error: fallbackError } = await supabase
      .from("profiles_auth")
      .select("id, auth_id, name, email, whatsapp, trial_end_at")
      .eq("trial_status", "trial")
      .eq("subscription_status", "active")
      .lte("trial_end_at", referenceDate.toISOString());

    if (fallbackError) {
      console.error("❌ Erro ao buscar trials expirados:", fallbackError.message);
      return;
    }

    trialUsers = data || [];
  }

  for (const user of trialUsers || []) {
    const userId = user.auth_id || user.id;
    if (!userId) continue;

    const alertKey = `${userId}-${alertDate}`;
    let alreadySent = false;

    try {
      alreadySent = await hasAlertBeenSent(
        supabase,
        userId,
        "trial_expired",
        alertKey
      );
    } catch (err) {
      console.error("❌ Erro ao validar alerta de trial:", err.message || err);
      continue;
    }

    if (alreadySent) {
      continue;
    }

    const userMessage = [
      "⏳ Gestão Pessoal",
      "Seu período de 7 dias grátis acabou hoje.",
      "Se quiser continuar com acesso total, fale com nossa equipe comercial e conclua sua assinatura. 💪",
    ].join("\n");

    const adminMessage = [
      "⚠️ Trial finalizado",
      `O usuário ${user.name || "Sem nome"} (${user.email || "sem e-mail"}) terminou os 7 dias grátis e foi inativado automaticamente.`,
      `WhatsApp: ${user.whatsapp || "não informado"}`,
    ].join("\n");

    let sentUser = false;
    let sentAdmin = false;

    if (user.whatsapp) {
      try {
        const resp = await sendMessage({ phone: user.whatsapp, message: userMessage });
        sentUser = resp?.ok !== false;
      } catch (err) {
        console.error(`❌ Falha ao enviar WhatsApp de trial para usuário ${userId}:`, err);
      }
    }

    if (adminNumber) {
      try {
        const resp = await sendMessage({ phone: adminNumber, message: adminMessage });
        sentAdmin = resp?.ok !== false;
      } catch (err) {
        console.error(`❌ Falha ao enviar WhatsApp de trial para admin ${userId}:`, err);
      }
    }

    if (sentUser || sentAdmin) {
      try {
        await logAlert(supabase, {
          userId,
          alertType: "trial_expired",
          alertKey,
        });
      } catch (err) {
        console.error("❌ Erro ao registrar log de trial expirado:", err);
      }

      const { error: updateError } = await supabase
        .from("profiles_auth")
        .update({
          subscription_status: "inactive",
          trial_status: "expired",
          trial_notified_at: new Date().toISOString(),
        })
        .or(`auth_id.eq.${userId},id.eq.${userId}`);

      if (updateError) {
        console.error("❌ Erro ao expirar trial:", updateError.message);
      }
    }
  }
}

async function sendUserAlert({
  supabase,
  user,
  alertType,
  alertKey,
  message,
  dailyLimit,
  todayCount,
  sendMessage,
}) {
  const userId = user.auth_id || user.id;
  if (!userId || todayCount.value >= dailyLimit) return;

  const alreadySent = await hasAlertBeenSent(supabase, userId, alertType, alertKey);
  if (alreadySent) return;

  const remaining = dailyLimit - todayCount.value;
  if (remaining <= 0) return;

  let sent = false;
  try {
    const resp = await sendMessage({ phone: user.whatsapp, message });
    sent = resp?.ok !== false;
  } catch (err) {
    console.error(`❌ Falha ao enviar alerta ${alertType} para`, userId, err);
    sent = false;
  }

  if (!sent) return;

  try {
    const logged = await logAlert(supabase, { userId, alertType, alertKey });
    if (logged) {
      todayCount.value += 1;
    }
  } catch (err) {
    console.error("❌ Erro ao registrar log do alerta:", err);
  }
}

async function buildFinanceAlerts(supabase, user, nowStr) {
  const userId = user.auth_id || user.id;
  const alerts = [];
  if (!userId) return alerts;

  const thresholdBrl = Number(process.env.ALERT_LOW_BALANCE_BRL) || DEFAULT_LOW_BALANCE_BRL;
  const spikeBrl = Number(process.env.ALERT_CATEGORY_SPIKE_BRL) || DEFAULT_CATEGORY_SPIKE_BRL;
  const spikePct = Number(process.env.ALERT_CATEGORY_SPIKE_PCT) || DEFAULT_CATEGORY_SPIKE_PCT;

  const monthStart = `${nowStr.slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, type, category")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lte("date", nowStr);

  if (error) {
    console.error("❌ Erro ao carregar transações:", error.message);
    return alerts;
  }

  const incomes = (data || [])
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const expenses = (data || [])
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const balance = incomes - expenses;

  if (balance <= thresholdBrl) {
    const alertKey = `${nowStr.slice(0, 7)}-${thresholdBrl}-${Math.floor(balance)}`;
    alerts.push({
      alertType: "finance_low_balance",
      alertKey,
      message: [
        "⚠️ Alerta financeiro",
        `${user.name ? `${user.name}, ` : ""}seu saldo do mês está em ${numberFormatter.format(
          balance
        )}.`,
        `Limite definido: ${numberFormatter.format(thresholdBrl)}.`,
      ].join("\n"),
    });
  }

  const expensesByCategory = {};
  for (const tx of data || []) {
    if (tx.type !== "expense") continue;
    const category = tx.category || "Outros";
    expensesByCategory[category] =
      (expensesByCategory[category] || 0) + Number(tx.amount || 0);
  }

  const totalExpenses = Object.values(expensesByCategory).reduce(
    (sum, val) => sum + val,
    0
  );

  if (totalExpenses > 0) {
    const [topCategory, topValue] = Object.entries(expensesByCategory).sort(
      (a, b) => b[1] - a[1]
    )[0] || [null, 0];

    const pct = topValue / totalExpenses;
    if (topCategory && (topValue >= spikeBrl || pct >= spikePct)) {
      const alertKey = `${nowStr.slice(0, 7)}-${topCategory}`;
      alerts.push({
        alertType: "finance_category_spike",
        alertKey,
        message: [
          "📊 Gastos em alta",
          `${topCategory} já consumiu ${numberFormatter.format(topValue)} neste mês.`,
          `Isso representa ${(pct * 100).toFixed(0)}% dos gastos do período.`,
        ].join("\n"),
      });
    }
  }

  return alerts;
}

async function buildFoodAlerts(supabase, user, todayStr, today) {
  const userId = user.auth_id || user.id;
  const alerts = [];
  if (!userId) return alerts;

  const junkKeywords = parseKeywords();
  const junkRepeatCount = Number(process.env.ALERT_JUNK_REPEAT_COUNT) || DEFAULT_JUNK_REPEAT_COUNT;
  const proteinMin = Number(process.env.ALERT_PROTEIN_MIN) || DEFAULT_PROTEIN_MIN;

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartStr = formatDate(weekStart);

  const { data: recentEntries, error: recentError } = await supabase
    .from("food_diary_entries")
    .select("food, entry_date, protein")
    .eq("user_id", userId)
    .gte("entry_date", weekStartStr)
    .lte("entry_date", todayStr);

  if (recentError) {
    console.error("❌ Erro ao buscar diário alimentar:", recentError.message);
    return alerts;
  }

  const counts = {};
  for (const entry of recentEntries || []) {
    const foodText = String(entry.food || "").toLowerCase();
    for (const keyword of junkKeywords) {
      if (foodText.includes(keyword.toLowerCase())) {
        counts[keyword] = (counts[keyword] || 0) + 1;
      }
    }
  }

  const topJunk = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (topJunk && topJunk[1] >= junkRepeatCount) {
    const [keyword, count] = topJunk;
    const alertKey = `${weekStartStr}-${keyword}`;
    alerts.push({
      alertType: "food_junk_repeat",
      alertKey,
      message: [
        "🍔 Olho na alimentação",
        `${keyword} apareceu ${count}x nos últimos 7 dias.`,
        "Tente equilibrar as escolhas nesta semana!",
      ].join("\n"),
    });
  }

  const proteinToday = (recentEntries || [])
    .filter((entry) => entry.entry_date === todayStr)
    .reduce((sum, entry) => sum + Number(entry.protein || 0), 0);

  const hour = today.getHours();
  if (hour >= 18 && proteinToday < proteinMin) {
    const alertKey = `${todayStr}`;
    alerts.push({
      alertType: "food_protein_low",
      alertKey,
      message: [
        "🥚 Proteína baixa hoje",
        `Total ingerido: ${proteinToday.toFixed(0)}g. Meta: ${proteinMin}g.`,
        "Planeje uma refeição com mais proteínas até o fim do dia.",
      ].join("\n"),
    });
  }

  return alerts;
}

async function buildDailyGoalsMissedAlert(supabase, user, todayStr) {
  const userId = user.auth_id || user.id;
  if (!userId) return [];

  const { data: profile, error: profileError } = await supabase
    .from("food_diary_profile")
    .select("calorie_goal, protein_goal, water_goal_l")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("❌ Erro ao buscar metas do diário alimentar:", profileError.message);
    return [];
  }

  const { data: authProfile, error: authError } = await supabase
    .from("profiles_auth")
    .select("water_goal_l, water_goal, water")
    .eq("auth_id", userId)
    .maybeSingle();

  if (authError) {
    console.error("❌ Erro ao buscar meta de água em profiles_auth:", authError.message);
  }

  const authWaterGoal = Number(
    authProfile?.water_goal_l ?? authProfile?.water_goal ?? authProfile?.water
  );

  const goalCalories = Number(profile?.calorie_goal) || DEFAULT_CALORIE_GOAL;
  const goalProtein = Number(profile?.protein_goal) || DEFAULT_PROTEIN_GOAL;
  const goalWaterL = Number.isFinite(authWaterGoal)
    ? authWaterGoal
    : Number(profile?.water_goal_l) || DEFAULT_WATER_GOAL_L;

  const { data: entries, error: entriesError } = await supabase
    .from("food_diary_entries")
    .select("calories, protein, water_ml")
    .eq("user_id", userId)
    .eq("entry_date", todayStr);

  if (entriesError) {
    console.error("❌ Erro ao buscar entradas do diário alimentar:", entriesError.message);
    return [];
  }

  const totals = (entries || []).reduce(
    (acc, entry) => {
      acc.calories += Number(entry.calories || 0);
      acc.protein += Number(entry.protein || 0);
      acc.waterMl += Number(entry.water_ml || 0);
      return acc;
    },
    { calories: 0, protein: 0, waterMl: 0 }
  );

  const { data: hydrationLogs, error: hydrationError } = await supabase
    .from("hydration_logs")
    .select("amount_ml")
    .eq("user_id", userId)
    .eq("day_date", todayStr);

  if (hydrationError) {
    console.error("❌ Erro ao buscar hidratação:", hydrationError.message);
  }

  const hydrationMl = (hydrationLogs || []).reduce(
    (sum, row) => sum + Number(row.amount_ml || 0),
    0
  );

  const totalCalories = totals.calories;
  const totalProtein = totals.protein;
  const totalWaterL = (totals.waterMl + hydrationMl) / 1000;

  const caloriesMissed = totalCalories > goalCalories;
  const proteinMissed = totalProtein < goalProtein;
  const waterMissed = totalWaterL < goalWaterL;

  if (!caloriesMissed && !proteinMissed && !waterMissed) {
    return [];
  }

  const lines = [
    "⚠️ Gestão Pessoal — Fechamento do dia",
    "Hoje você não bateu suas metas:",
  ];

  if (caloriesMissed) {
    lines.push(
      `• Calorias: ${totalCalories.toFixed(0)}/${goalCalories.toFixed(0)} (acima)`
    );
  }

  if (proteinMissed) {
    lines.push(
      `• Proteína: ${totalProtein.toFixed(0)}/${goalProtein.toFixed(0)}g (abaixo)`
    );
  }

  if (waterMissed) {
    lines.push(
      `• Água: ${totalWaterL.toFixed(1)}/${goalWaterL.toFixed(1)}L (abaixo)`
    );
  }

  lines.push("Amanhã a gente ajusta isso. Constância ganha. 💪");

  return [
    {
      alertType: "food_daily_goals_missed",
      alertKey: todayStr,
      message: lines.join("\n"),
    },
  ];
}

async function buildMealMissingReminders(supabase, user, todayStr, nowInSp) {
  const userId = user.auth_id || user.id;
  if (!userId) return [];

  const adaptiveConfig = getAdaptiveMealConfig();
  const fallbackWindows = getFallbackMealWindows();
  let mealWindows = fallbackWindows;

  if (adaptiveConfig.enabled) {
    const lookbackStart = new Date(nowInSp);
    lookbackStart.setDate(lookbackStart.getDate() - adaptiveConfig.lookbackDays);
    const lookbackIso = lookbackStart.toISOString();
    const { data: historyEntries, error: historyError } = await supabase
      .from("food_diary_entries")
      .select("meal_type, created_at")
      .eq("user_id", userId)
      .gte("created_at", lookbackIso);

    if (historyError) {
      console.error(
        "❌ Erro ao buscar histórico de refeições:",
        historyError.message
      );
    } else {
      const mealSamples = {};
      for (const entry of historyEntries || []) {
        if (!entry.meal_type || !entry.created_at) continue;
        if (!MEAL_WINDOWS.find((window) => window.label === entry.meal_type)) {
          continue;
        }
        const localTime = toSaoPaulo(entry.created_at);
        const minutes = localTime.getHours() * 60 + localTime.getMinutes();
        if (!mealSamples[entry.meal_type]) {
          mealSamples[entry.meal_type] = [];
        }
        mealSamples[entry.meal_type].push(minutes);
      }

      mealWindows = fallbackWindows.map((window) => {
        const samples = mealSamples[window.label] || [];
        if (samples.length < adaptiveConfig.minSamples) {
          return window;
        }
        const medianMinutes = median(samples);
        if (medianMinutes === null) {
          return window;
        }
        const { startMin, endMin } = clampMealWindow(
          medianMinutes - adaptiveConfig.windowMinutes,
          medianMinutes + adaptiveConfig.windowMinutes
        );
        return { label: window.label, startMin, endMin };
      });
    }
  }

  const nowMinutes = nowInSp.getHours() * 60 + nowInSp.getMinutes();
  const mealWindow = getMealWindowByMinutes(mealWindows, nowMinutes);
  if (!mealWindow) return [];

  const { data: profile, error: profileError } = await supabase
    .from("food_diary_profile")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("❌ Erro ao buscar perfil do diário alimentar:", profileError.message);
    return [];
  }

  if (!profile) {
    const weekStart = new Date(nowInSp);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartStr = formatDate(weekStart);

    const { data: recentEntries, error: recentError } = await supabase
      .from("food_diary_entries")
      .select("id")
      .eq("user_id", userId)
      .gte("entry_date", weekStartStr)
      .lte("entry_date", todayStr)
      .limit(1);

    if (recentError) {
      console.error("❌ Erro ao buscar entradas recentes do diário alimentar:", recentError.message);
      return [];
    }

    if (!recentEntries || recentEntries.length === 0) {
      return [];
    }
  }

  const expectedMealType = mealWindow.label;
  const { data: entries, error: entriesError } = await supabase
    .from("food_diary_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", todayStr)
    .eq("meal_type", expectedMealType)
    .limit(1);

  if (entriesError) {
    console.error("❌ Erro ao verificar refeição do dia:", entriesError.message);
    return [];
  }

  if (entries && entries.length > 0) {
    return [];
  }

  return [
    {
      alertType: "food_meal_missing",
      alertKey: `${todayStr}-${expectedMealType}`,
      message: [
        "⏰ Gestão Pessoal: lembrete rápido",
        `Ainda não foi registrado: ${expectedMealType}.`,
        "Não perde o foco — registra pra manter o acompanhamento. 💪",
      ].join("\n"),
    },
  ];
}

export async function runWhatsAppAlerts({ supabase, sendMessage, now = new Date() }) {
  if (!supabase || typeof sendMessage !== "function") return;

  await handleTrialExpirations({ supabase, sendMessage, now });

  const nowInSp = toSaoPaulo(now);
  const withinDefaultWindow = isWithinAlertWindow(nowInSp);
  const withinDailyGoalsWindow = isWithinDailyGoalsWindow(nowInSp);
  const withinMealWindow = isWithinMealReminderWindow(nowInSp);

  if (!withinDefaultWindow && !withinDailyGoalsWindow && !withinMealWindow) {
    return;
  }

  const todayStr = formatDate(nowInSp);
  const todayBounds = getDayBounds(nowInSp);
  const maxPerDay = Number(process.env.ALERT_MAX_PER_DAY) || DEFAULT_MAX_PER_DAY;

  let users;
  try {
    users = await fetchActiveUsers(supabase);
  } catch (err) {
    console.error("❌ Erro ao carregar usuários para alertas:", err.message || err);
    return;
  }

  for (const user of users) {
    const userId = user.auth_id || user.id;
    if (!userId) continue;

    let todayCount = { value: 0 };
    try {
      todayCount.value = await fetchDailyAlertCount(
        supabase,
        userId,
        todayBounds.start,
        todayBounds.end
      );
    } catch (err) {
      console.error("❌ Erro ao contar alertas diários:", err.message || err);
      continue;
    }

    if (todayCount.value >= maxPerDay) {
      continue;
    }

    if (withinDefaultWindow) {
      const financeAlerts = await buildFinanceAlerts(supabase, user, todayStr);
      for (const alert of financeAlerts) {
        await sendUserAlert({
          supabase,
          user,
          alertType: alert.alertType,
          alertKey: alert.alertKey,
          message: alert.message,
          dailyLimit: maxPerDay,
          todayCount,
          sendMessage,
        });
        if (todayCount.value >= maxPerDay) break;
      }

      if (todayCount.value >= maxPerDay) continue;

      const foodAlerts = await buildFoodAlerts(supabase, user, todayStr, nowInSp);
      for (const alert of foodAlerts) {
        await sendUserAlert({
          supabase,
          user,
          alertType: alert.alertType,
          alertKey: alert.alertKey,
          message: alert.message,
          dailyLimit: maxPerDay,
          todayCount,
          sendMessage,
        });
        if (todayCount.value >= maxPerDay) break;
      }
    }

    if (todayCount.value >= maxPerDay) continue;

    if (withinMealWindow) {
      const mealMissingAlerts = await buildMealMissingReminders(
        supabase,
        user,
        todayStr,
        nowInSp
      );

      for (const alert of mealMissingAlerts) {
        await sendUserAlert({
          supabase,
          user,
          alertType: alert.alertType,
          alertKey: alert.alertKey,
          message: alert.message,
          dailyLimit: maxPerDay,
          todayCount,
          sendMessage,
        });
        if (todayCount.value >= maxPerDay) break;
      }
    }

    if (todayCount.value >= maxPerDay) continue;

    if (withinDailyGoalsWindow) {
      const dailyGoalsAlerts = await buildDailyGoalsMissedAlert(
        supabase,
        user,
        todayStr
      );

      for (const alert of dailyGoalsAlerts) {
        await sendUserAlert({
          supabase,
          user,
          alertType: alert.alertType,
          alertKey: alert.alertKey,
          message: alert.message,
          dailyLimit: maxPerDay,
          todayCount,
          sendMessage,
        });
        if (todayCount.value >= maxPerDay) break;
      }
    }
  }
}
