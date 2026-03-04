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

const sendWhatsApp = async (userId, message) => {
  const { data: profile, error } = await supabase
    .from("profiles_auth")
    .select("whatsapp")
    .eq("auth_id", userId)
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

        const message = `
☀️ Bom dia!

💪 Treino de hoje:
${workout?.name || "Treino"}

🏋️ Músculos:
${workout?.muscle_groups || ""}

🔥 Disciplina vence motivação.
`;

        try {
          await sendWhatsApp(schedule.user_id, message);

          await supabase.from("workout_schedule_reminder_logs").insert({
            user_id: schedule.user_id,
            entry_date: entryDate,
            status: "success",
          });
        } catch (err) {
          console.error("Erro ao enviar lembrete:", err);

          await supabase.from("workout_schedule_reminder_logs").insert({
            user_id: schedule.user_id,
            entry_date: entryDate,
            status: "error",
            message: err.message,
          });
        }
      }
    },
    {
      timezone: TZ,
    }
  );
}
