import cron from "node-cron";
import { supabase } from "../supabase.js";
import { sendWhatsAppMessage } from "../reminders.js";

let started = false;

const TZ = "America/Sao_Paulo";

const formatDateOnlyInSaoPaulo = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const getWeekdayInSaoPaulo = (date = new Date()) => {
  const jsWeekday = new Date(
    date.toLocaleString("en-US", { timeZone: TZ })
  ).getDay();

  return jsWeekday === 0 ? 7 : jsWeekday;
};

const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
};

const buildAgendaSection = (events) => {
  if (!events?.length) {
    return "";
  }

  const sortedEvents = [...events].sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
  );

  const lines = ["", "📅 Compromissos de hoje", ""];

  for (const event of sortedEvents) {
    lines.push(`• ${event.title || "Evento"}`);
    lines.push(`  ⏰ Início: ${event.start || "-"}`);

    const notes = String(event.notes || "").trim();
    if (notes) {
      lines.push(`  📝 Observações: ${notes}`);
    }

    lines.push("");
  }

  while (lines.length && !lines[lines.length - 1]) {
    lines.pop();
  }

  return lines.join("\n");
};

const fetchTodayAgendaEvents = async (userId, referenceDate = new Date()) => {
  const today = new Date(referenceDate);
  const dateStr = formatDateOnlyInSaoPaulo(today);

  console.log("📅 Buscando eventos para:", dateStr);

  const { data: eventsToday, error } = await supabase
    .from("events")
    .select("*")
    .gte("date", `${dateStr}T00:00:00`)
    .lte("date", `${dateStr}T23:59:59`)
    .eq("user_id", userId);

  if (error) {
    console.error("❌ Erro ao buscar eventos:", error);
    return [];
  }

  let normalizedEvents = eventsToday || [];

  if (!normalizedEvents.length) {
    const { data: dateOnlyEvents, error: dateOnlyError } = await supabase
      .from("events")
      .select("*")
      .eq("date", dateStr)
      .eq("user_id", userId);

    if (dateOnlyError) {
      console.error("❌ Erro ao buscar eventos em formato date:", dateOnlyError);
      return [];
    }

    normalizedEvents = dateOnlyEvents || [];
  }

  console.log("📦 Eventos encontrados:", normalizedEvents);
  return normalizedEvents.filter((event) => event?.is_active !== false);
};

const markAgendaEventsAsSent = async (events) => {
  const eventIds = (events || []).map((event) => event?.id).filter(Boolean);
  if (!eventIds.length) {
    return;
  }

  const { error } = await supabase
    .from("events")
    .update({ sent: true })
    .in("id", eventIds);

  if (error) {
    console.error("❌ Erro ao marcar eventos como enviados no disparo matinal:", error);
  }
};

const sendWhatsApp = async (userId, message) => {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("whatsapp")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar WhatsApp do usuário: ${error.message}`);
  }

  const phone = normalizePhone(profile?.whatsapp);
  if (!phone) {
    throw new Error("WhatsApp não encontrado para usuário");
  }

  await sendWhatsAppMessage({ phone, message });
};

const getRandomMotivationalQuote = async () => {
  const { data, error } = await supabase
    .from("motivational_quotes")
    .select("message")
    .eq("active", true)
    .order("random()")
    .limit(1)
    .single();

  if (error || !data) {
    return "Disciplina vence motivação.";
  }

  return data.message;
};

export function startWorkoutReminderScheduler() {
  if (started) return;
  started = true;

  cron.schedule(
    "30 6 * * *",
    async () => {
      console.log("Scheduler de treino iniciado (06:30)");

      const weekday = getWeekdayInSaoPaulo();
      const entryDate = formatDateOnlyInSaoPaulo();

      const { data: schedules, error } = await supabase
        .from("workout_schedule")
        .select(
          `
            user_id,
            weekday,
            is_active,
            time,
            workout_routines (
              name,
              muscle_groups,
              sports_list
            )
          `
        )
        .eq("weekday", weekday)
        .eq("is_active", true);

      if (error) {
        console.error("Erro ao buscar treinos:", error);
        return;
      }

      for (const schedule of schedules || []) {
        const { data: alreadySent } = await supabase
          .from("workout_schedule_reminder_logs")
          .select("*")
          .eq("user_id", schedule.user_id)
          .eq("entry_date", entryDate)
          .maybeSingle();

        if (alreadySent) continue;

        const workout = schedule.workout_routines;
        const workoutName = workout?.name || "Treino";
        const workoutTime = schedule?.time || "Não definido";
        const quote = await getRandomMotivationalQuote();
        const eventsToday = await fetchTodayAgendaEvents(schedule.user_id);
        const agendaSection = buildAgendaSection(eventsToday);

        const message = `
☀️ Bom dia!

🔥 ${quote}

💪 Treino de hoje
${workoutName}

⏰ Horário: ${workoutTime}${agendaSection}
`;

        try {
          await sendWhatsApp(schedule.user_id, message);
          await markAgendaEventsAsSent(eventsToday);

          await supabase.from("workout_schedule_reminder_logs").insert({
            user_id: schedule.user_id,
            entry_date: entryDate,
            status: "success",
            message,
          });
        } catch (err) {
          console.error("Erro ao enviar lembrete:", err);

          await supabase.from("workout_schedule_reminder_logs").insert({
            user_id: schedule.user_id,
            entry_date: entryDate,
            status: "error",
            message,
          });
        }
      }
    },
    {
      timezone: TZ,
    }
  );
}
