import cron from "node-cron";
import { supabase } from "../supabase.js";
import { fetchUserWhatsapp, sendWhatsAppMessage } from "../reminders.js";

const TZ = "America/Sao_Paulo";
const CRON_EXPRESSION = "0 7 * * *";

const formatDateOnlyInSaoPaulo = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const buildAgendaDigestMessage = ({ events = [], workouts = [] }) => {
  let msg = "Olá, bom dia! ";

  if (events.length) {
    msg += `Na sua agenda diária hoje você tem ${events.length} compromisso(s):\n\n`;

    for (const ev of events) {
      const title = String(ev.title || "").trim() || "Sem título";
      const notes = String(ev.notes || "").trim();
      const start = String(ev.start || "").trim();
      const end = String(ev.end || "").trim();

      const time = start && end ? `${start}–${end}` : start ? start : "";
      msg += `📌 ${time ? `${time} — ` : ""}${title}\n`;
      if (notes) msg += `📝 ${notes}\n`;
      msg += "\n";
    }
  } else {
    // Se não tem eventos, a mensagem pode continuar só com treino
    msg += "sem compromissos na agenda para hoje.\n";
  }

  if (workouts.length) {
    msg += "\n🏋️ Treino de hoje:\n";
    for (const w of workouts) {
      const title = String(w.title || "").trim() || "Treino";
      const muscles = Array.isArray(w.muscle_groups)
        ? w.muscle_groups.filter(Boolean)
        : [];
      msg += `• ${title}`;
      if (muscles.length) msg += ` — ${muscles.join(", ")}`;
      msg += "\n";
    }
  }

  return msg.trim();
};

const fetchEventsForToday = async (todayISOString) => {
  const { data: todaysEvents, error } = await supabase
    .from("events")
    .select("id, user_id, title, notes, date, start, end, status")
    .eq("date", todayISOString)
    .eq("status", "active")
    .order("start", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao buscar eventos por data na agenda: ${error.message}`
    );
  }

  return todaysEvents || [];
};

const fetchWorkoutsForToday = async (todayISOString) => {
  const { data, error } = await supabase
    .from("workout_schedule")
    .select("id, user_id, title, muscle_groups, date, status")
    .eq("date", todayISOString)
    .eq("status", "active");

  if (error) {
    throw new Error(`Erro ao buscar treinos do dia: ${error.message}`);
  }

  return data || [];
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
  const workouts = await fetchWorkoutsForToday(todayISOString);

  // Agrupar eventos por usuário (somente os que ainda não foram enviados)
  const eventsByUser = new Map();

  for (const event of events) {
    const userId = event.user_id;
    const eventId = event.id;
    if (!userId || !eventId) continue;

    const alreadySent = await alreadySentDateBasedReminder({ userId, eventId });
    if (alreadySent) continue;

    if (!eventsByUser.has(userId)) eventsByUser.set(userId, []);
    eventsByUser.get(userId).push(event);
  }

  // Agrupar treinos por usuário
  const workoutsByUser = new Map();
  for (const w of workouts) {
    const userId = w.user_id;
    if (!userId) continue;
    if (!workoutsByUser.has(userId)) workoutsByUser.set(userId, []);
    workoutsByUser.get(userId).push(w);
  }

  // Lista final de usuários que precisam receber algo
  const userIds = new Set([...eventsByUser.keys(), ...workoutsByUser.keys()]);
  if (!userIds.size) return;

  for (const userId of userIds) {
    try {
      const whatsapp = await fetchUserWhatsapp(userId);
      if (!whatsapp) continue;

      const userEvents = eventsByUser.get(userId) || [];
      const userWorkouts = workoutsByUser.get(userId) || [];

      // Se não tem eventos e não tem treino, não manda nada
      if (!userEvents.length && !userWorkouts.length) continue;

      const message = buildAgendaDigestMessage({
        events: userEvents,
        workouts: userWorkouts,
      });

      const sendResult = await sendWhatsAppMessage({ phone: whatsapp, message });

      if (!sendResult?.ok) {
        console.error("❌ Falha ao enviar resumo diário:", sendResult?.status);
        continue;
      }

      // Registrar log somente dos eventos enviados
      for (const ev of userEvents) {
        await registerDateBasedReminderLog({ userId, eventId: ev.id });
      }
    } catch (err) {
      console.error("❌ Erro ao enviar resumo diário:", err?.message || err);
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
    `⏰ Scheduler de lembretes por data ativo (todos os dias às 07:00 - ${TZ}).`
  );

  return dailyReminderTask;
};
