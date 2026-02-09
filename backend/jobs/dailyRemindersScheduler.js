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

const fetchReminderLogsForDate = async (reminderIds, entryDate) => {
  if (!reminderIds.length) return [];

  const { data, error } = await supabase
    .from("daily_reminder_logs")
    .select("user_id, reminder_id")
    .eq("entry_date", entryDate)
    .in("reminder_id", reminderIds);

  if (error) {
    throw new Error(`Erro ao buscar logs de lembretes diários: ${error.message}`);
  }

  return data || [];
};

const saveReminderLog = async ({ userId, reminderId, entryDate }) => {
  const { error } = await supabase
    .from("daily_reminder_logs")
    .upsert(
      {
        user_id: userId,
        reminder_id: reminderId,
        entry_date: entryDate,
      },
      { onConflict: "user_id,reminder_id,entry_date", ignoreDuplicates: true }
    );

  if (error) {
    console.error("❌ Erro ao salvar log de lembrete diário:", error.message);
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

  const reminderIds = dueReminders.map((reminder) => reminder.id).filter(Boolean);
  const loggedToday = await fetchReminderLogsForDate(reminderIds, todayStr);
  const loggedSet = new Set(
    loggedToday.map((row) => `${row.user_id}:${row.reminder_id}`)
  );

  for (const reminder of dueReminders) {
    const userId = reminder.user_id;
    const reminderId = reminder.id;

    if (!userId || !reminderId) continue;

    const logKey = `${userId}:${reminderId}`;
    if (loggedSet.has(logKey)) continue;

    try {
      const whatsapp = await fetchUserWhatsapp(userId);
      if (!whatsapp) continue;

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
        continue;
      }

      await saveReminderLog({ userId, reminderId, entryDate: todayStr });
    } catch (err) {
      console.error("❌ Erro ao enviar lembrete diário:", err.message || err);
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
        await runDailyReminders();
      } catch (err) {
        console.error(
          "❌ Erro no scheduler de lembretes diários:",
          err.message || err
        );
      } finally {
        isRunning = false;
      }
    },
    { timezone: TZ }
  );

  console.log(
    `⏰ Scheduler de lembretes diários ativo (${CRON_EXPRESSION} - ${TZ}).`
  );

  return dailyReminderTask;
};
