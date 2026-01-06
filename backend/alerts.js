const TZ = "America/Sao_Paulo";
const ALERT_WINDOW_START_HOUR = 8;
const ALERT_WINDOW_END_HOUR = 20;

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

export async function runWhatsAppAlerts({ supabase, sendMessage, now = new Date() }) {
  if (!supabase || typeof sendMessage !== "function") return;

  const nowInSp = toSaoPaulo(now);
  if (!isWithinAlertWindow(nowInSp)) {
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
}
