import cron from "node-cron";
import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "0 7 * * *";

const fetchEventsForToday = async (todayISOString) => {
  const { data: todaysEvents, error } = await supabase
    .from("events")
    .select("id, user_id, title, notes, date, status")
    .eq("date", todayISOString)
    .eq("status", "pendente");

  if (error) {
    throw new Error(
      `Erro ao buscar eventos por data na agenda: ${error.message}`
    );
  }

  return todaysEvents || [];
};

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
  return sendWhatsAppMessage({ phone, message });
};

export const processDateBasedReminders = async () => {
  console.log("Scheduler 07:00 iniciado");

  // ===== AGENDA =====
  try {
    const today = getTodayDate();

    const dailyEvents = await fetchEventsForToday(today);
    console.log("Eventos pendentes encontrados:", dailyEvents.length);

    for (const event of dailyEvents) {
      const message = `Bom dia! 📅\n\nHoje você tem:\n${event.title}\nHorário: ${event.start_time} - ${event.end_time}`;

      let whatsapp = null;

      // 1. tentar buscar direto do evento
      if (event.user_whatsapp) {
        whatsapp = event.user_whatsapp;
      }

      // 2. se não tiver, buscar do perfil
      if (!whatsapp) {
        const { data: profile } = await supabase
          .from("profiles_auth")
          .select("whatsapp")
          .eq("auth_id", event.user_id)
          .single();

        if (profile?.whatsapp) {
          whatsapp = profile.whatsapp;
        }
      }

      // normalizar telefone
      if (whatsapp) {
        whatsapp = whatsapp.replace(/\D/g, "");
      }

      if (!whatsapp || whatsapp.length < 10) {
        console.log("WhatsApp inválido para usuário:", event.user_id);
        continue;
      }

      const sendResult = await sendWhatsApp(whatsapp, message);

      if (!sendResult?.ok) {
        await supabase
          .from("events")
          .update({
            status: "enviado",
            dispatched_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        console.log("Falha no envio do evento:", event.id);
      } else {
        await supabase
          .from("events")
          .update({
            status: "enviado",
            dispatched_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        console.log("Evento atualizado para enviado:", event.id);
      }
    }
  } catch (err) {
    console.error("Erro no envio da agenda:", err.message || err);
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
    console.log("Erro no bloco treino:", err.message);
  }

  console.log("Scheduler 07:00 finalizado");
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
