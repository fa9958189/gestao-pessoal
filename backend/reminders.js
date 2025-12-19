import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const MOTIVATIONAL_MESSAGES = [
  "Disciplina vence a motivação.",
  "Quem começa cedo chega mais longe.",
  "Sem desculpas, só ação.",
  "Constância hoje, resultado amanhã.",
  "Um dia de cada vez, sem parar.",
  "O corpo alcança o que a mente decide.",
  "Foco no processo, o resultado vem.",
  "Treino feito é treino que conta.",
  "Acordar cedo é uma escolha de quem quer evoluir.",
  "Pequenos esforços diários constroem grandes resultados.",
  "Não é sobre vontade, é sobre compromisso.",
  "O difícil de hoje vira força amanhã.",
  "Você não precisa de motivação, precisa de constância.",
  "Faça hoje o que o seu futuro vai agradecer.",
  "Todo treino te deixa mais forte que ontem.",
  "Levanta, respira e vai. Simples assim.",
  "Nada muda se você não se mover.",
  "O hábito certo vence qualquer desculpa.",
  "A disciplina constrói o que a motivação promete.",
  "Treinar cedo é investir no seu dia inteiro.",
];

function getRandomMotivationalMessage() {
  if (!MOTIVATIONAL_MESSAGES.length) {
    return "";
  }

  return MOTIVATIONAL_MESSAGES[
    Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)
  ];
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://gklpjwjzluqsnavwhwxf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const WORKOUT_SCHEDULE_TABLE = process.env.WORKOUT_SCHEDULE_TABLE || "events";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

// Z-API
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || WHATSAPP_API_TOKEN;
const WHATSAPP_API_URL =
  process.env.WHATSAPP_API_URL ||
  (ZAPI_INSTANCE_ID && ZAPI_INSTANCE_TOKEN
    ? `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`
    : null);

const TZ = "America/Sao_Paulo";

const REMINDER_PROVIDER = "z-api";
const REMINDER_INTERVAL_MINUTES =
  Number(process.env.REMINDER_INTERVAL_MINUTES) || 15;

function getNowInSaoPaulo() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function formatDateOnlyInSaoPaulo(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getWeekdaySP(now) {
  const day = now.getDay();
  return day === 0 ? 7 : day;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function toSaoPauloDate(dateStr, timeStr) {
  const [year, month, day] = (dateStr || "").split("-").map(Number);
  const [hour, minute] = (timeStr || "0:0").split(":").map(Number);
  if (
    [year, month, day, hour, minute].some((value) =>
      Number.isNaN(Number(value))
    )
  ) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const localInTz = new Date(
    utcGuess.toLocaleString("en-US", { timeZone: TZ })
  );
  const offsetMinutes = (localInTz.getTime() - utcGuess.getTime()) / 60000;
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

async function hasEventReminderBeenSent(eventId) {
  const { data, error } = await supabase
    .from("event_reminder_logs")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "success")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar envio do lembrete: ${error.message}`);
  }

  return Boolean(data);
}

async function logEventReminder({
  eventId,
  userId,
  providerMessageId = null,
  status,
  error: errorMessage = null,
  type = null,
}) {
  const payload = {
    event_id: eventId,
    user_id: userId,
    sent_at: new Date().toISOString(),
    provider: REMINDER_PROVIDER,
    provider_message_id: providerMessageId,
    status,
    error: errorMessage,
  };

  if (type) {
    payload.type = type;
  }

  const { error } = await supabase.from("event_reminder_logs").insert(payload);

  if (error) {
    throw new Error(`Erro ao registrar log de lembrete: ${error.message}`);
  }
}

async function fetchTodaysEvents(todayStr) {
  const { data, error } = await supabase
    .from("events")
    .select("id, user_id, title, date, start, notes")
    .eq("date", todayStr);

  if (error) {
    throw new Error(`Erro ao buscar eventos do dia: ${error.message}`);
  }

  return data || [];
}

async function fetchEventsByDate(dateStr) {
  const { data, error } = await supabase
    .from("events")
    .select("id, user_id, title, date, start, notes")
    .eq("date", dateStr);

  if (error) {
    throw new Error(
      `Erro ao buscar eventos da data ${dateStr}: ${error.message}`
    );
  }

  return data || [];
}

const TWO_DAYS_BEFORE_REMINDER_TYPE = "two_days_before";
const TWO_DAYS_BEFORE_HOUR = 8;
const TWO_DAYS_BEFORE_MINUTE = 0;

async function hasReminderTypeBeenSent(eventId, type) {
  const { data, error } = await supabase
    .from("event_reminder_logs")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "success")
    .eq("type", type)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar envio do lembrete (${type}): ${error.message}`
    );
  }

  return Boolean(data);
}

function buildTwoDaysBeforeMessage(event) {
  const lines = [
    "⏰ Lembrete antecipado",
    "Seu compromisso está marcado para daqui a 2 dias.",
    "",
    `📌 Título: ${event.title || "Evento"}`,
    `📅 Data: ${event.date || "-"}`,
    `🕒 Horário: ${event.start || "-"}`,
  ];

  if (event.notes) {
    lines.push("", `📝 Notas: ${event.notes}`);
  }

  return lines.join("\n");
}

function getTwoDaysBeforeReminderTime(event) {
  const eventDate = toSaoPauloDate(event.date, event.start || "00:00");
  if (!eventDate) return null;

  const twoDaysBefore = new Date(
    eventDate.getTime() - 2 * 24 * 60 * 60 * 1000
  );
  const twoDaysBeforeStr = formatDateOnlyInSaoPaulo(twoDaysBefore);

  return toSaoPauloDate(
    twoDaysBeforeStr,
    `${String(TWO_DAYS_BEFORE_HOUR).padStart(2, "0")}:${String(
      TWO_DAYS_BEFORE_MINUTE
    ).padStart(2, "0")}`
  );
}

function buildEventReminderMessage(event) {
  const lines = [
    "📅 Lembrete de agenda",
    "",
    `Título: ${event.title || "Evento"}`,
    `Horário: ${event.start || "-"}`,
  ];

  if (event.notes) {
    lines.push("", event.notes);
  }

  return lines.join("\n");
}

export async function checkEventReminders() {
  try {
    const now = getNowInSaoPaulo();
    const todayStr = formatDateOnlyInSaoPaulo(now);

    console.log(`🕒 Verificando eventos do dia ${todayStr}`);

    const twoDaysAhead = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const twoDaysAheadStr = formatDateOnlyInSaoPaulo(twoDaysAhead);

    const eventsTwoDaysAhead = await fetchEventsByDate(twoDaysAheadStr);

    for (const event of eventsTwoDaysAhead) {
      if (!event.user_id) continue;

      const reminderTime = getTwoDaysBeforeReminderTime(event);
      if (!reminderTime) continue;

      if (!isWithinWindow(now, reminderTime, REMINDER_INTERVAL_MINUTES)) {
        continue;
      }

      const alreadySentTwoDays = await hasReminderTypeBeenSent(
        event.id,
        TWO_DAYS_BEFORE_REMINDER_TYPE
      );

      if (alreadySentTwoDays) {
        continue;
      }

      const whatsapp = await fetchUserWhatsapp(event.user_id);
      const phone = normalizePhone(whatsapp);

      if (!phone) {
        const errorMessage = "Telefone inválido para o usuário";
        await logEventReminder({
          eventId: event.id,
          userId: event.user_id,
          status: "error",
          error: errorMessage,
          type: TWO_DAYS_BEFORE_REMINDER_TYPE,
        });
        console.error("⚠️ Usuário sem telefone válido, ignorando evento D-2");
        continue;
      }

      const message = buildTwoDaysBeforeMessage(event);

      const maskedPhone = phone.replace(/.(?=.{4})/g, "*");
      console.log(`📤 Enviando WhatsApp (D-2) para ${maskedPhone}`);
      const sendResult = await sendWhatsappMessage({ to: phone, message });

      if (!sendResult?.ok) {
        const errorMessage = `Envio D-2 via Z-API retornou status ${sendResult?.status}`;
        await logEventReminder({
          eventId: event.id,
          userId: event.user_id,
          status: "error",
          error: errorMessage,
          type: TWO_DAYS_BEFORE_REMINDER_TYPE,
        });
        console.error("❌ Falha ao enviar lembrete D-2:", errorMessage);
        continue;
      }

      await logEventReminder({
        eventId: event.id,
        userId: event.user_id,
        status: "success",
        type: TWO_DAYS_BEFORE_REMINDER_TYPE,
      });

      console.log("✅ Lembrete D-2 enviado e registrado");
    }

    const events = await fetchTodaysEvents(todayStr);

    for (const event of events) {
      if (!event.user_id || !event.start) continue;

      console.log(`📌 Evento encontrado: ${event.title} às ${event.start}`);

      const eventDate = toSaoPauloDate(event.date, event.start);
      if (!eventDate) continue;

      const nowTs = now.getTime();
      const eventTs = eventDate.getTime();
      const diff = nowTs - eventTs;

      if (diff < 0 || diff > 59_000) {
        continue;
      }

      try {
        const alreadySent = await hasEventReminderBeenSent(event.id);
        if (alreadySent) {
          console.log("⏭️ Evento já notificado, ignorando");
          continue;
        }

        const whatsapp = await fetchUserWhatsapp(event.user_id);
        const phone = normalizePhone(whatsapp);

        if (!phone) {
          const errorMessage = "Telefone inválido para o usuário";
          await logEventReminder({
            eventId: event.id,
            userId: event.user_id,
            status: "error",
            error: errorMessage,
          });
          console.error("⚠️ Usuário sem telefone válido, ignorando evento");
          continue;
        }

        const message = buildEventReminderMessage(event);

        const maskedPhone = phone.replace(/.(?=.{4})/g, "*");
        console.log(`📤 Enviando WhatsApp para ${maskedPhone}`);
        const sendResult = await sendWhatsappMessage({ to: phone, message });

        if (!sendResult?.ok) {
          const errorMessage = `Envio via Z-API retornou status ${sendResult?.status}`;
          await logEventReminder({
            eventId: event.id,
            userId: event.user_id,
            status: "error",
            error: errorMessage,
          });
          console.error("❌ Falha ao enviar lembrete:", errorMessage);
          continue;
        }

        await logEventReminder({
          eventId: event.id,
          userId: event.user_id,
          status: "success",
        });

        console.log("✅ Lembrete enviado e registrado");
      } catch (err) {
        console.error("❌ Erro ao processar evento:", err.message || err);
        try {
          await logEventReminder({
            eventId: event.id,
            userId: event.user_id,
            status: "error",
            error: err.message || String(err),
          });
        } catch (logError) {
          console.error("❌ Falha ao registrar erro de lembrete:", logError);
        }
      }
    }
  } catch (err) {
    console.error("❌ Erro no worker de eventos:", err.message || err);
  }
}

let eventReminderIntervalId = null;

export function startEventReminderWorker() {
  if (eventReminderIntervalId) return eventReminderIntervalId;

  console.log("🟢 Worker de lembretes de agenda iniciado");

  checkEventReminders().catch((err) =>
    console.error("❌ Erro inicial no worker de eventos:", err)
  );

  eventReminderIntervalId = setInterval(() => {
    checkEventReminders().catch((err) =>
      console.error("❌ Erro no ciclo do worker de eventos:", err)
    );
  }, REMINDER_INTERVAL_MINUTES * 60 * 1000);

  return eventReminderIntervalId;
}

const sentInMinute = new Set();
function makeKey(userId, dateStr, hhmm) {
  return `${userId}|${dateStr}|${hhmm}`;
}

function logSupabaseInfo() {
  console.log("🔎 Tabela agenda:", WORKOUT_SCHEDULE_TABLE);
}

// --------------------
// Eventos (lógica original)
// --------------------

/**
 * Busca eventos de hoje e de amanhã.
 */
export async function fetchUpcomingEvents() {
  const now = new Date();

  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, start, end, notes, user_id")
    .in("date", [todayStr, tomorrowStr])
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar eventos: ${error.message}`);
  }

  return data || [];
}

/**
 * Busca o WhatsApp do usuário na tabela profiles.
 * Aqui usamos o userId que vem do campo user_id da tabela events.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function fetchUserWhatsapp(userId) {
  const { data, error } = await supabase
    .from("profiles_auth")
    .select("whatsapp")
    .eq("auth_id", userId)
    .maybeSingle();

  if (error) {
    console.error("❌ Erro buscando whatsapp em profiles_auth:", error);
    return null;
  }

  if (!data?.whatsapp) {
    console.warn("⚠️ WhatsApp não encontrado para usuário:", userId);
    return null;
  }

  return data.whatsapp || null;
}

/**
 * Envia uma mensagem via API de WhatsApp.
 * @param {{ to: string, message: string }} payload
 * @returns {Promise<any>}
 */
export async function sendWhatsappMessage({ to, message }) {
  return sendWhatsAppMessage({ phone: to, message });
}

const buildReminderMessage = (event, type) => {
  const date = new Date(event.date).toLocaleDateString("pt-BR");
  const startTime = event.start || "-";
  const endTime = event.end || "-";
  const notes = event.notes || "-";
  const title = event.title || "Evento";

  const base =
    type === "day_before"
      ? "Não esqueça do seu compromisso amanhã!"
      : "Não esqueça do seu compromisso hoje!";

  return `${base}\nTítulo: ${title}\nData: ${date}\nHorário: ${startTime} – ${endTime}\nNotas: ${notes}`;
};

const getDateTimeAt = (dateStr, hour, minute) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  return new Date(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate(),
    dt.getUTCHours(),
    dt.getUTCMinutes(),
    dt.getUTCSeconds()
  );
};

const parseEventStartTime = (event) => {
  if (!event.start) return null;
  const [hourStr, minuteStr] = event.start.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr || 0);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return getDateTimeAt(event.date, hour, minute);
};

const MORNING_SEND_HOUR = 6;
const MORNING_SEND_MINUTE = 20;
const EARLY_EVENT_LIMIT_HOUR = 9;
const EARLY_EVENT_LIMIT_MINUTE = 20;

const shouldSendReminder = (event, now, intervalMinutes) => {
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const startDateTime = parseEventStartTime(event);
  const windowMinutes = intervalMinutes;

  if (event.date === tomorrowStr) {
    const sendTime = getDateTimeAt(todayStr, MORNING_SEND_HOUR, MORNING_SEND_MINUTE);
    if (isWithinWindow(now, sendTime, windowMinutes)) {
      return { shouldSend: true, reminderType: "day_before" };
    }
    return { shouldSend: false };
  }

  if (event.date !== todayStr) return { shouldSend: false };

  if (startDateTime) {
    const earlyLimit = getDateTimeAt(
      event.date,
      EARLY_EVENT_LIMIT_HOUR,
      EARLY_EVENT_LIMIT_MINUTE
    );

    if (startDateTime > earlyLimit) {
      const sendTime = getDateTimeAt(
        event.date,
        MORNING_SEND_HOUR,
        MORNING_SEND_MINUTE
      );
      if (isWithinWindow(now, sendTime, windowMinutes)) {
        return { shouldSend: true, reminderType: "day_of_morning" };
      }
    } else {
      const sendTime = new Date(startDateTime.getTime() - 3 * 60 * 60 * 1000);
      if (isWithinWindow(now, sendTime, windowMinutes)) {
        return { shouldSend: true, reminderType: "day_of_three_hours_before" };
      }
    }
  } else {
    const sendTime = getDateTimeAt(event.date, MORNING_SEND_HOUR, MORNING_SEND_MINUTE);
    if (isWithinWindow(now, sendTime, windowMinutes)) {
      return { shouldSend: true, reminderType: "day_of_morning" };
    }
  }

  return { shouldSend: false };
};

const getReminderKey = (event, reminderType) => `${event.id}-${reminderType}`;

async function hasReminderBeenSent(userId, eventId, reminderKey, dayStr) {
  const { data, error } = await supabase
    .from("event_reminder_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("reminder_key", reminderKey)
    .eq("day", dayStr)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar logs de lembrete: ${error.message}`);
  }

  return Boolean(data);
}

async function markReminderSent(userId, eventId, reminderKey, dayStr) {
  const payload = {
    user_id: userId,
    event_id: eventId,
    reminder_key: reminderKey,
    day: dayStr,
    sent_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("event_reminder_logs")
    .upsert(payload, { onConflict: "user_id,event_id,day,reminder_key" });

  if (error) {
    throw new Error(`Erro ao registrar lembrete enviado: ${error.message}`);
  }
}

function parseHourMinute(timeValue) {
  const str = String(timeValue || "").trim();
  if (!str) return null;
  const [hh, mm] = str.split(":");
  const hour = Number(hh);
  const minute = Number(mm);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function isWithinWindow(now, target, windowMinutes) {
  const diff = now.getTime() - target.getTime();
  return diff >= 0 && diff < windowMinutes * 60 * 1000;
}

export async function startRemindersJob({
  intervalMinutes = REMINDER_INTERVAL_MINUTES,
} = {}) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const events = await fetchUpcomingEvents();

      const now = new Date();
      const dayStr = now.toISOString().slice(0, 10);

      for (const event of events) {
        if (!event.user_id) continue;

        const { shouldSend, reminderType } = shouldSendReminder(
          event,
          now,
          intervalMinutes
        );

        if (!shouldSend || !reminderType) continue;

        const reminderKey = getReminderKey(event, reminderType);
        const alreadySent = await hasReminderBeenSent(
          event.user_id,
          event.id,
          reminderKey,
          dayStr
        );
        if (alreadySent) continue;

        const whatsapp = await fetchUserWhatsapp(event.user_id);
        const phone = normalizePhone(whatsapp);
        if (!phone) {
          console.error("⚠️ Telefone inválido, lembrete não enviado");
          continue;
        }

        const message = buildReminderMessage(
          event,
          reminderType === "day_before" ? "day_before" : "day_of"
        );

        await sendWhatsappMessage({ to: phone, message });
        await markReminderSent(event.user_id, event.id, reminderKey, dayStr);
      }
    } catch (err) {
      console.error("Erro no job de lembretes:", err.message);
    } finally {
      isRunning = false;
    }
  };

  tick();
  const intervalId = setInterval(tick, intervalMinutes * 60 * 1000);

  return () => clearInterval(intervalId);
}

// --------------------
// Worker de treinos
// --------------------

const MINUTE_CACHE_TTL_MS = 70_000;

export async function sendWhatsAppMessage({ phone, message }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new Error("Telefone vazio ou inválido");

  const url = WHATSAPP_API_URL;
  if (!url) {
    throw new Error("URL não configurada");
  }

  const body = {
    phone: normalizedPhone,
    message,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  if (ZAPI_CLIENT_TOKEN) headers["Client-Token"] = ZAPI_CLIENT_TOKEN;

  const maskedPhone = normalizedPhone.replace(/.(?=.{4})/g, "*");
  console.log("📨 Enviando WhatsApp (Z-API) para", maskedPhone);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await resp.text().catch(() => "");
    const ok = resp.status === 200 || resp.status === 201;

    console.log("📥 Resposta Z-API: status", resp.status);

    if (!ok) {
      console.error("❌ Z-API retornou status inesperado", {
        status: resp.status,
        body: text,
      });
    }

    return { ok, status: resp.status, body: text };
  } catch (err) {
    console.error("❌ Erro na chamada Z-API:", err);
    throw err;
  }
}

export const sendZapiMessage = sendWhatsAppMessage;

function formatHHMM(now) {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function fetchDailyRemindersByTime(hhmm) {
  const { data, error } = await supabase
    .from("daily_reminders")
    .select("id, user_id, title, reminder_time, notes, is_active")
    .eq("reminder_time", hhmm)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Erro ao buscar agenda diária: ${error.message}`);
  }

  return data || [];
}

async function hasDailyReminderBeenSent(reminder, dateStr) {
  const { user_id: userId } = reminder;

  const { data, error } = await supabase
    .from("daily_reminder_logs")
    .select("reminder_id")
    .eq("user_id", userId)
    .eq("reminder_id", reminder.id)
    .eq("entry_date", dateStr)
    .eq("status", "success")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar log da agenda diária: ${error.message}`);
  }

  return Boolean(data);
}

async function logDailyReminderSent(reminderId, userId, dateStr, status, message) {
  if (!userId) {
    console.error("Daily reminder missing user_id", { reminderId, userId });
    return;
  }

  const payload = {
    user_id: userId,
    reminder_id: reminderId,
    entry_date: dateStr,
    status,
    message,
  };

  const { error } = await supabase
    .from("daily_reminder_logs")
    .upsert(payload, { onConflict: "user_id,reminder_id,entry_date" });

  if (error) {
    throw new Error(`Erro ao registrar agenda diária: ${error.message}`);
  }
}

export async function checkDailyRemindersOnce() {
  const now = getNowInSaoPaulo();
  const hhmm = formatHHMM(now);
  const todayStr = formatDateOnlyInSaoPaulo(now);

  let reminders = [];

  try {
    reminders = await fetchDailyRemindersByTime(hhmm);
  } catch (err) {
    console.error("❌ Erro ao carregar agenda diária:", err);
    return;
  }

  for (const reminder of reminders) {
    try {
      if (!reminder.user_id) {
        console.error("Daily reminder missing user_id", reminder);
        continue;
      }

      const alreadySent = await hasDailyReminderBeenSent(reminder, todayStr);
      if (alreadySent) {
        continue;
      }

      const phone = await getUserPhone(reminder.user_id);
      if (!phone) {
        console.warn("⚠️ WhatsApp não encontrado para usuário:", reminder.user_id);
        continue;
      }

      let message = `⏰ Agenda Diária\n${reminder.title || ""}`;
      const notes = String(reminder.notes || "").trim();
      if (notes) {
        message += `\n\n📝 Notas: ${notes}`;
      }

      const sendResult = await sendWhatsAppMessage({ phone, message });

      if (!sendResult?.ok) {
        console.error("❌ Falha ao enviar agenda diária:", sendResult);
        await logDailyReminderSent(
          reminder.id,
          reminder.user_id,
          todayStr,
          "failed",
          message
        );
        continue;
      }

      await logDailyReminderSent(
        reminder.id,
        reminder.user_id,
        todayStr,
        "success",
        message
      );
    } catch (err) {
      console.error("❌ Erro ao processar lembrete diário:", err);
    }
  }
}

let dailyRemindersWorkerIntervalId = null;

export function startDailyRemindersWorker() {
  if (dailyRemindersWorkerIntervalId) {
    return dailyRemindersWorkerIntervalId;
  }

  console.log("🟢 Worker de agenda diária iniciado");

  checkDailyRemindersOnce().catch((err) =>
    console.error("❌ Erro inicial no worker de agenda diária:", err)
  );

  dailyRemindersWorkerIntervalId = setInterval(() => {
    checkDailyRemindersOnce().catch((err) =>
      console.error("❌ Erro no ciclo da agenda diária:", err)
    );
  }, 30_000);

  return dailyRemindersWorkerIntervalId;
}

async function hasDailyWorkoutReminderBeenSent(userId, dateStr) {
  const { data, error } = await supabase
    .from("workout_schedule_reminder_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", dateStr)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar log de lembrete diário: ${error.message}`
    );
  }

  return Boolean(data);
}

async function markDailyWorkoutReminderSent(userId, dateStr, message) {
  const payload = {
    user_id: userId,
    entry_date: dateStr,
    message,
  };

  const { error } = await supabase
    .from("workout_schedule_reminder_logs")
    .upsert(payload, { onConflict: "user_id,entry_date" });

  if (error) {
    throw new Error(
      `Erro ao registrar lembrete diário: ${error.message}`
    );
  }
}

export async function checkDailyWorkoutScheduleRemindersOnce() {
  try {
    const now = getNowInSaoPaulo();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (hours !== 5 || minutes > 1) {
      return;
    }

    const weekday = getWeekdaySP(now);
    const todayStr = formatDateOnlyInSaoPaulo(now);

    const { data: schedules, error } = await supabase
      .from("workout_schedule")
      .select("id, user_id, workout_id")
      .eq("weekday", weekday)
      .eq("is_active", true)
      .not("workout_id", "is", null);

    if (error) {
      throw new Error(`Erro ao buscar agenda de treino: ${error.message}`);
    }

    for (const schedule of schedules || []) {
      try {
        const alreadySent = await hasDailyWorkoutReminderBeenSent(
          schedule.user_id,
          todayStr
        );

        if (alreadySent) {
          continue;
        }

        const whatsapp = await fetchUserWhatsapp(schedule.user_id);
        const phone = normalizePhone(whatsapp);

        if (!phone) {
          console.warn(
            "⚠️ WhatsApp não encontrado ou inválido para usuário:",
            schedule.user_id
          );
          continue;
        }

        const { data: routine, error: routineError } = await supabase
          .from("workout_routines")
          .select("name")
          .eq("id", schedule.workout_id)
          .maybeSingle();

        if (routineError) {
          console.error("❌ Erro ao buscar treino:", routineError.message);
          continue;
        }

        const workoutName = routine?.name;
        if (!workoutName) {
          console.warn(
            "⚠️ Treino não encontrado para o lembrete diário:",
            schedule.workout_id
          );
          continue;
        }

        const motivationalMessage = getRandomMotivationalMessage();
        const message = `🌅 Bom dia! ${motivationalMessage}\nHoje seu treino é o ${workoutName}. 💪`;
        const sendResult = await sendWhatsAppMessage({ phone, message });

        if (!sendResult?.ok) {
          console.error(
            "❌ Falha ao enviar lembrete diário:",
            sendResult?.status
          );
          continue;
        }

        await markDailyWorkoutReminderSent(schedule.user_id, todayStr, message);
      } catch (err) {
        console.error("❌ Erro ao processar lembrete diário:", err);
      }
    }
  } catch (err) {
    console.error("❌ Erro no worker diário de treinos:", err);
  }
}

let dailyWorkoutScheduleIntervalId = null;

export function startDailyWorkoutScheduleWorker() {
  if (dailyWorkoutScheduleIntervalId) {
    return dailyWorkoutScheduleIntervalId;
  }

  console.log("🟢 Worker de treino diário iniciado");

  checkDailyWorkoutScheduleRemindersOnce().catch((err) =>
    console.error("❌ Erro inicial no worker diário:", err)
  );

  dailyWorkoutScheduleIntervalId = setInterval(() => {
    checkDailyWorkoutScheduleRemindersOnce().catch((err) =>
      console.error("❌ Erro no ciclo do worker diário:", err)
    );
  }, 30_000);

  return dailyWorkoutScheduleIntervalId;
}

function formatTempo(value) {
  return String(value ?? "").slice(0, 5);
}

function isSchemaCacheError(error) {
  return (
    error?.code === "PGST205" ||
    /schema cache/i.test(error?.message || "") ||
    /reload schema/i.test(error?.message || "")
  );
}

async function loadRemindersFromSupabase(todayStr) {
  const { data, error } = await supabase
    .from(WORKOUT_SCHEDULE_TABLE)
    .select("id, user_id, start, title, notes")
    .eq("date", todayStr);

  if (error) throw error;
  return data || [];
}

async function loadRemindersViaRest(todayStr) {
  const baseUrl = SUPABASE_URL?.replace(/\/$/, "");
  const url = `${baseUrl}/rest/v1/${WORKOUT_SCHEDULE_TABLE}` +
    `?select=id,user_id,start,title,notes` +
    `&date=eq.${todayStr}`;

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
  };

  const resp = await fetch(url, { headers });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `REST fallback falhou (${resp.status}): ${text || "sem corpo"}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("REST fallback retornou JSON inválido");
  }
}

async function loadRemindersForNow(todayStr) {
  try {
    return await loadRemindersFromSupabase(todayStr);
  } catch (error) {
    console.error("❌ Erro Supabase ao buscar cronograma:", error);

    if (!isSchemaCacheError(error)) {
      throw error;
    }

    console.warn(
      "⚠️ Erro PGST205/schema cache detectado. Tentando fallback REST..."
    );

    return await loadRemindersViaRest(todayStr);
  }
}

async function getUserPhone(userId) {
  // 1) Primeiro: tabela correta para ID do Auth
  {
    const { data, error } = await supabase
      .from("profiles_auth")
      .select("whatsapp")
      .eq("auth_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro buscando telefone (profiles_auth):", error);
    } else if (data?.whatsapp) {
      return normalizePhone(data.whatsapp);
    }
  }

  // 2) Fallback: caso você também guarde em profiles (id = userId)
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("whatsapp")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro buscando telefone (profiles):", error);
    } else if (data?.whatsapp) {
      return normalizePhone(data.whatsapp);
    }
  }

  // Se não achou, retorna null (sem quebrar o worker)
  return null;
}

export async function checkWorkoutRemindersOnce() {
  const now = getNowInSaoPaulo();
  const hhmm = formatHHMM(now);
  const todayStr = formatDateOnlyInSaoPaulo(now);

  console.log(`⏱ Checando lembretes... data=${todayStr} hora=${hhmm}`);

  let reminders = [];

  try {
    reminders = await loadRemindersForNow(todayStr);
    console.log(`📋 Eventos encontrados hoje: ${reminders.length}`);
  } catch (error) {
    console.error("❌ Falha na busca da agenda de treino:", error);
    console.error(
      "ℹ️ Worker continuará rodando mesmo com erro na consulta do Supabase."
    );
    return;
  }

  for (const reminder of reminders) {
    const tempo = formatTempo(reminder.start);
    if (!tempo || tempo !== hhmm) continue;

    const key = makeKey(reminder.user_id, todayStr, hhmm);
    if (sentInMinute.has(key)) {
      console.log("⏭️ Ignorando duplicado (anti-spam):", key);
      continue;
    }

    sentInMinute.add(key);
    setTimeout(() => sentInMinute.delete(key), MINUTE_CACHE_TTL_MS);

    const phone = await getUserPhone(reminder.user_id);

    if (!phone) {
      console.warn("Sem telefone para o usuário:", reminder.user_id);
      continue;
    }

    let message = reminder.title
      ? `📌 Lembrete: "${reminder.title}" está marcado para agora (${hhmm}).`
      : `📌 Lembrete: seu treino está marcado para agora (${hhmm}). Bora! 💪`;

    if (reminder.notes && String(reminder.notes).trim()) {
      message += `\n📝 Notas: ${String(reminder.notes).trim()}`;
    }

    try {
      const z = await sendWhatsAppMessage({ phone, message });

      if (!z.ok) {
        console.error("❌ Z-API falhou:", { status: z.status, body: z.body });
      } else {
        console.log("✅ Z-API OK:", { status: z.status, body: z.body });
      }
    } catch (err) {
      console.error("❌ Erro ao enviar via Z-API:", err);
    }
  }

  if (sentInMinute.size > 5000) {
    sentInMinute.clear();
  }
}

let workoutWorkerIntervalId = null;

export function startWorkoutReminderWorker() {
  if (workoutWorkerIntervalId) {
    return workoutWorkerIntervalId;
  }

  console.log("🟢 Worker de lembretes iniciado");
  logSupabaseInfo();

  checkWorkoutRemindersOnce().catch((e) =>
    console.error("❌ Erro no worker (boot):", e)
  );

  workoutWorkerIntervalId = setInterval(() => {
    checkWorkoutRemindersOnce().catch((e) =>
      console.error("❌ Erro no worker:", e)
    );
  }, 30_000);

  return workoutWorkerIntervalId;
}

if (process.argv[1] && process.argv[1].endsWith("reminders.js")) {
  startEventReminderWorker();
}
