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

const buildDateBasedReminderMessage = (event) => {
  const title = String(event.title || "").trim();
  const notes = String(event.notes || "").trim();
  return `Lembrete da agenda de hoje:\n${title}\n${notes}`;
};

const fetchEventsForToday = async (todayISOString) => {
  const { data: todaysEvents, error } = await supabase
    .from("events")
    .select("id, user_id, title, notes, date")
    .eq("date", todayISOString);

  if (error) {
    throw new Error(
      `Erro ao buscar eventos por data na agenda: ${error.message}`
    );
  }

  return todaysEvents || [];
};

const alreadySentDateBasedReminder = async ({ userId, eventId }) => {
  const { data, error } = await supabase
    .from("reminder_event_dispatch_log")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .limit(1);

  if (error) {
    console.error(
      "❌ Erro ao verificar envio duplicado de lembrete por data:",
      error.message
    );
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

const registerDateBasedReminderLog = async ({ userId, eventId }) => {
  const { error } = await supabase.from("reminder_event_dispatch_log").insert({
    user_id: userId,
    event_id: eventId,
  });

  if (error) {
    console.error(
      "❌ Erro ao registrar envio em reminder_event_dispatch_log:",
      error.message
    );
  }
};

export const processDateBasedReminders = async () => {
  const now = new Date();
  const todayISOString = formatDateOnlyInSaoPaulo(now);
  const events = await fetchEventsForToday(todayISOString);

  if (!events.length) return;

  for (const event of events) {
    const userId = event.user_id;
    const eventId = event.id;
    if (!userId || !eventId) continue;

    const alreadySent = await alreadySentDateBasedReminder({
      userId,
      eventId,
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
