import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const REMINDER_PROVIDER = "z-api";

let lastMinuteKey = null;

function getNowInSaoPaulo() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function formatDateOnly(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function formatHHMM(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function normalizeHHMM(value) {
  if (!value) return null;
  const parts = String(value).trim().split(":");
  if (parts.length < 2) return null;
  const hours = String(parts[0]).padStart(2, "0");
  const minutes = String(parts[1]).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export async function fetchActiveDailyReminders() {
  const { data, error } = await supabase
    .from("daily_reminders")
    .select("id, user_id, title, reminder_time, notes, is_active")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Erro ao buscar agenda diária: ${error.message}`);
  }

  return data || [];
}

export async function fetchEventsByDate(dateStr) {
  const { data, error } = await supabase
    .from("events")
    .select("id, user_id, title, date, start, notes")
    .eq("date", dateStr);

  if (error) {
    throw new Error(`Erro ao buscar agenda (${dateStr}): ${error.message}`);
  }

  return data || [];
}

async function fetchUserWhatsapp(userId) {
  if (!userId) return null;

  const { data: authData, error: authError } = await supabase
    .from("profiles_auth")
    .select("whatsapp")
    .eq("auth_id", userId)
    .maybeSingle();

  if (authError) {
    console.error("❌ Erro ao buscar WhatsApp (profiles_auth):", authError);
  } else if (authData?.whatsapp) {
    return authData.whatsapp;
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("whatsapp")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("❌ Erro ao buscar WhatsApp (profiles):", profileError);
  }

  return profileData?.whatsapp || null;
}

async function hasDailyReminderBeenSent(reminderId, userId, dateStr) {
  const { data, error } = await supabase
    .from("daily_reminder_logs")
    .select("reminder_id")
    .eq("user_id", userId)
    .eq("reminder_id", reminderId)
    .eq("entry_date", dateStr)
    .eq("status", "success")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar log da agenda diária: ${error.message}`);
  }

  return Boolean(data);
}

async function logDailyReminderSent(reminderId, userId, dateStr, status, message) {
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

async function hasEventReminderBeenSent(eventId, type) {
  const { data, error } = await supabase
    .from("event_reminder_logs")
    .select("id")
    .eq("event_id", eventId)
    .eq("type", type)
    .eq("status", "success")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar envio da agenda: ${error.message}`);
  }

  return Boolean(data);
}

async function logEventReminder({ eventId, userId, status, message, type }) {
  const payload = {
    event_id: eventId,
    user_id: userId,
    sent_at: new Date().toISOString(),
    provider: REMINDER_PROVIDER,
    status,
    error: status === "success" ? null : message,
    type,
  };

  const { error } = await supabase.from("event_reminder_logs").insert(payload);

  if (error) {
    throw new Error(`Erro ao registrar lembrete de agenda: ${error.message}`);
  }
}

async function sendDailyReminders({ now, hhmm, todayStr }) {
  const reminders = await fetchActiveDailyReminders();
  const targetReminders = reminders.filter(
    (reminder) => normalizeHHMM(reminder.reminder_time) === hhmm
  );

  for (const reminder of targetReminders) {
    try {
      if (!reminder.user_id) {
        console.warn("⚠️ Lembrete diário sem usuário:", reminder.id);
        continue;
      }

      const alreadySent = await hasDailyReminderBeenSent(
        reminder.id,
        reminder.user_id,
        todayStr
      );
      if (alreadySent) continue;

      const whatsapp = await fetchUserWhatsapp(reminder.user_id);
      if (!whatsapp) {
        console.warn("⚠️ WhatsApp não encontrado:", reminder.user_id);
        continue;
      }

      let message = `⏰ Agenda Diária\n${reminder.title || ""}`;
      const notes = String(reminder.notes || "").trim();
      if (notes) {
        message += `\n\n📝 Notas: ${notes}`;
      }

      const sendResult = await sendWhatsAppMessage({
        phone: whatsapp,
        message,
      });

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
      console.error("❌ Erro ao processar agenda diária:", err);
    }
  }
}

async function sendAgendaReminders({ now, hhmm, todayStr }) {
  const twoDaysAhead = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const twoDaysAheadStr = formatDateOnly(twoDaysAhead);

  const [eventsToday, eventsTwoDays] = await Promise.all([
    fetchEventsByDate(todayStr),
    fetchEventsByDate(twoDaysAheadStr),
  ]);

  const sendAgendaMessage = async (event, type) => {
    if (!event?.user_id) return;

    const alreadySent = await hasEventReminderBeenSent(event.id, type);
    if (alreadySent) return;

    const whatsapp = await fetchUserWhatsapp(event.user_id);
    if (!whatsapp) {
      console.warn("⚠️ WhatsApp não encontrado:", event.user_id);
      return;
    }

    const timeLabel = normalizeHHMM(event.start) || "-";
    const messageLines =
      type === "two_days"
        ? [
            "⏰ Lembrete antecipado",
            "Seu compromisso está marcado para daqui a 2 dias.",
            "",
            `📌 Título: ${event.title || "Evento"}`,
            `📅 Data: ${event.date || "-"}`,
            `🕒 Horário: ${timeLabel}`,
          ]
        : [
            "📅 Lembrete de agenda",
            "",
            `Título: ${event.title || "Evento"}`,
            `Horário: ${timeLabel}`,
          ];

    if (event.notes) {
      messageLines.push("", `📝 Notas: ${event.notes}`);
    }

    const message = messageLines.join("\n");

    const sendResult = await sendWhatsAppMessage({
      phone: whatsapp,
      message,
    });

    if (!sendResult?.ok) {
      console.error("❌ Falha ao enviar agenda:", sendResult);
      await logEventReminder({
        eventId: event.id,
        userId: event.user_id,
        status: "error",
        message: `Envio falhou (status ${sendResult?.status})`,
        type,
      });
      return;
    }

    await logEventReminder({
      eventId: event.id,
      userId: event.user_id,
      status: "success",
      message: null,
      type,
    });
  };

  for (const event of eventsToday) {
    const eventTime = normalizeHHMM(event.start);
    if (!eventTime || eventTime !== hhmm) continue;
    try {
      await sendAgendaMessage(event, "today");
    } catch (err) {
      console.error("❌ Erro ao enviar agenda do dia:", err);
    }
  }

  for (const event of eventsTwoDays) {
    const eventTime = normalizeHHMM(event.start);
    if (!eventTime || eventTime !== hhmm) continue;
    try {
      await sendAgendaMessage(event, "two_days");
    } catch (err) {
      console.error("❌ Erro ao enviar agenda D+2:", err);
    }
  }
}

export async function runReminderChecks({ now } = {}) {
  const current = now || getNowInSaoPaulo();
  const hhmm = formatHHMM(current);
  const todayStr = formatDateOnly(current);
  const minuteKey = `${todayStr}-${hhmm}`;

  if (lastMinuteKey === minuteKey) {
    return;
  }

  lastMinuteKey = minuteKey;

  try {
    await sendDailyReminders({ now: current, hhmm, todayStr });
  } catch (err) {
    console.error("❌ Erro na agenda diária:", err);
  }

  try {
    await sendAgendaReminders({ now: current, hhmm, todayStr });
  } catch (err) {
    console.error("❌ Erro na agenda:", err);
  }
}
