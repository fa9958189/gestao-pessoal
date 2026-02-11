import cron from "node-cron";
import { supabase } from "../supabase.js";
import { fetchUserWhatsapp, sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "* * * * *";

const formatDateOnlyInSaoPaulo = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const formatTimeInSaoPaulo = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
};

const normalizeReminderTime = (timeValue) => {
  if (!timeValue) return null;
  const match = String(timeValue).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = match[1].padStart(2, "0");
  const minute = match[2].padStart(2, "0");
  return `${hour}:${minute}`;
};

const buildDailyReminderMessage = (reminder) => {
  const title = String(reminder.title || "").trim();
  const notes = String(reminder.notes || "").trim();
  if (title && notes) {
    return `${title}\n${notes}`;
  }
  return title || notes || "Lembrete diário";
};

const buildDateBasedReminderMessage = (event) => {
  const title = String(event.title || "").trim();
  const notes = String(event.notes || "").trim();
  if (title && notes) {
    return `${title}\n${notes}`;
  }
  return title || notes || "Lembrete da agenda";
};

const fetchActiveDailyReminders = async () => {
  const { data, error } = await supabase
    .from("daily_reminders")
    .select("id, user_id, title, reminder_time, notes, is_active")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Erro ao buscar lembretes diários: ${error.message}`);
  }

  return data || [];
};

const reserveReminderLog = async ({ userId, reminderId, entryDate }) => {
  const { data, error } = await supabase
    .from("daily_reminder_logs")
    .insert(
      {
        user_id: userId,
        reminder_id: reminderId,
        entry_date: entryDate,
      },
      { onConflict: "user_id,reminder_id,entry_date", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    console.error("❌ Erro ao registrar log do lembrete diário:", error.message);
    return { inserted: false };
  }

  return { inserted: Array.isArray(data) && data.length > 0 };
};

const removeReminderLog = async ({ userId, reminderId, entryDate }) => {
  const { error } = await supabase
    .from("daily_reminder_logs")
    .delete()
    .eq("user_id", userId)
    .eq("reminder_id", reminderId)
    .eq("entry_date", entryDate);

  if (error) {
    console.error("❌ Erro ao remover log de lembrete diário:", error.message);
  }
};

const fetchEventsForToday = async (todayStr) => {
  const primaryQuery = await supabase
    .from("events")
    .select("id, user_id, title, notes, data_evento, is_active")
    .eq("data_evento", todayStr)
    .eq("is_active", true);

  if (!primaryQuery.error) {
    return primaryQuery.data || [];
  }

  const fallbackQuery = await supabase
    .from("events")
    .select("id, user_id, title, notes, date, is_active")
    .eq("date", todayStr)
    .eq("is_active", true);

  if (fallbackQuery.error) {
    throw new Error(
      `Erro ao buscar eventos por data na agenda: ${fallbackQuery.error.message}`
    );
  }

  return fallbackQuery.data || [];
};

const alreadySentDateBasedReminderToday = async ({ userId, eventId, todayStr }) => {
  const query = await supabase
    .from("registros_de_alertas_do_whatsapp")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("entry_date", todayStr)
    .limit(1);

  if (query.error) {
    console.error(
      "❌ Erro ao verificar envio duplicado de lembrete por data:",
      query.error.message
    );
    return false;
  }

  return Array.isArray(query.data) && query.data.length > 0;
};

const registerDateBasedReminderLog = async ({ userId, eventId, todayStr, message }) => {
  const { error } = await supabase.from("registros_de_alertas_do_whatsapp").insert({
    user_id: userId,
    event_id: eventId,
    entry_date: todayStr,
    message,
    channel: "whatsapp",
  });

  if (error) {
    console.error(
      "❌ Erro ao registrar envio em registros_de_alertas_do_whatsapp:",
      error.message
    );
  }
};

const runDailyReminders = async () => {
  const now = new Date();
  const todayStr = formatDateOnlyInSaoPaulo(now);
  const currentTime = formatTimeInSaoPaulo(now);

  const reminders = await fetchActiveDailyReminders();
  const dueReminders = reminders.filter(
    (reminder) => normalizeReminderTime(reminder.reminder_time) === currentTime
  );

  if (!dueReminders.length) return;

  for (const reminder of dueReminders) {
    const userId = reminder.user_id;
    const reminderId = reminder.id;

    if (!userId || !reminderId) continue;

    const reservation = await reserveReminderLog({
      userId,
      reminderId,
      entryDate: todayStr,
    });

    if (!reservation.inserted) {
      continue;
    }

    try {
      const whatsapp = await fetchUserWhatsapp(userId);
      if (!whatsapp) {
        await removeReminderLog({ userId, reminderId, entryDate: todayStr });
        continue;
      }

      const message = buildDailyReminderMessage(reminder);
      const sendResult = await sendWhatsAppMessage({
        phone: whatsapp,
        message,
      });

      if (!sendResult?.ok) {
        console.error(
          "❌ Falha ao enviar lembrete diário:",
          sendResult?.status
        );
        await removeReminderLog({ userId, reminderId, entryDate: todayStr });
        continue;
      }
    } catch (err) {
      console.error("❌ Erro ao enviar lembrete diário:", err.message || err);
      await removeReminderLog({ userId, reminderId, entryDate: todayStr });
    }
  }
};

export const processDateBasedReminders = async () => {
  const now = new Date();
  const todayStr = formatDateOnlyInSaoPaulo(now);
  const events = await fetchEventsForToday(todayStr);

  if (!events.length) return;

  for (const event of events) {
    const userId = event.user_id;
    const eventId = event.id;
    if (!userId || !eventId) continue;

    const alreadySent = await alreadySentDateBasedReminderToday({
      userId,
      eventId,
      todayStr,
    });

    if (alreadySent) {
      continue;
    }

    try {
      const whatsapp = await fetchUserWhatsapp(userId);
      if (!whatsapp) {
        continue;
      }

      const message = buildDateBasedReminderMessage(event);
      const sendResult = await sendWhatsAppMessage({
        phone: whatsapp,
        message,
      });

      if (!sendResult?.ok) {
        console.error(
          "❌ Falha ao enviar lembrete por data da agenda:",
          sendResult?.status
        );
        continue;
      }

      await registerDateBasedReminderLog({
        userId,
        eventId,
        todayStr,
        message,
      });
    } catch (err) {
      console.error(
        "❌ Erro ao enviar lembrete por data da agenda:",
        err.message || err
      );
    }
  }
};

let dailyReminderTask = null;

export const startDailyRemindersScheduler = () => {
  if (dailyReminderTask) {
    return dailyReminderTask;
  }

  let isRunning = false;

  dailyReminderTask = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      if (isRunning) {
        return;
      }

      isRunning = true;

      try {
        await processDateBasedReminders();
      } catch (err) {
        console.error(
          "❌ Erro no scheduler de lembretes por data:",
          err.message || err
        );
      } finally {
        isRunning = false;
      }
    },
    { timezone: TZ }
  );

  console.log(
    `⏰ Scheduler de lembretes por data ativo (${CRON_EXPRESSION} - ${TZ}).`
  );

  return dailyReminderTask;
};
