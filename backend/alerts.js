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

function getMealWindow(date) {
  return MEAL_WINDOWS.find((window) => isWithinWindow(date, window)) || null;
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
    throw new Error(`Erro ao contar alertas do dia: ${error.message}`);
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

  const goalCalories = Number(profile?.calorie_goal) || DEFAULT_CALORIE_GOAL;
  const goalProtein = Number(profile?.protein_goal) || DEFAULT_PROTEIN_GOAL;
  const goalWaterL = Number(profile?.water_goal_l) || DEFAULT_WATER_GOAL_L;

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

  const totalCalories = totals.calories;
  const totalProtein = totals.protein;
  const totalWaterL = totals.waterMl / 1000;

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

  const mealWindow = getMealWindow(nowInSp);
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

  const nowInSp = toSaoPaulo(now);
  const withinDefaultWindow = isWithinAlertWindow(nowInSp);
  const withinDailyGoalsWindow = isWithinDailyGoalsWindow(nowInSp);
  const withinMealWindow = Boolean(getMealWindow(nowInSp));

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
