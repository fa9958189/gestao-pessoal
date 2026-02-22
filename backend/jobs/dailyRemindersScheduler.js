import cron from "node-cron";
import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "0 7 * * *";

const getTodayDate = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const sendWhatsApp = async (phone, message) => {
  const sendResult = await sendWhatsAppMessage({ phone, message });
  return Boolean(sendResult?.ok);
};

export const processDateBasedReminders = async () => {
  console.log("Scheduler de lembretes matinal iniciado (07:00)");

  // ===== AGENDA =====
  try {
    const today = getTodayDate();

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("date", today)
      .eq("status", "pending");

    if (error) throw error;

    const dailyEvents = events || [];
    console.log("Eventos do dia encontrados:", dailyEvents.length);

    for (const event of dailyEvents) {
      const message = `Bom dia! 📅\n\nHoje você tem:\n${event.title}\nHorário: ${event.start_time} - ${event.end_time}`;

      const sent = await sendWhatsApp(event.user_whatsapp, message);

      if (sent) {
        await supabase
          .from("events")
          .update({
            status: "sent",
            dispatched_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        console.log("Evento atualizado para sent:", event.id);
      }
    }
  } catch (err) {
    console.error("Erro no envio da agenda:", err.message);
  }

  // ===== TREINO =====
  try {
    const today = getTodayDate();

    const { data: workouts, error } = await supabase
      .from("workout_schedule")
      .select("*")
      .eq("date", today);

    if (error) throw error;

    const dailyWorkouts = workouts || [];
    console.log("Treinos do dia encontrados:", dailyWorkouts.length);

    for (const workout of dailyWorkouts) {
      const message = `💪 Treino de hoje:\n${
        workout.name || workout.workout_name || "Treino programado"
      }`;

      await sendWhatsApp(workout.user_whatsapp, message);
    }
  } catch (err) {
    console.error("Erro no envio de treinos:", err.message);
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
    `⏰ Scheduler de lembretes por data ativo (todos os dias às 07:00 - ${TZ}).`
  );

  return dailyReminderTask;
};
