import "dotenv/config";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://gklpjwjzluqsnavwhwxf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY;

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
const MORNING_AGENDA_CRON = "0 7 * * *";

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

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// --------------------
// Eventos (lógica original)
// --------------------

/**
 * Busca eventos de hoje e de amanhã.
 */
async function fetchActiveEventsForDate() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: eventosDoDia, error } = await supabase
    .from("events")
    .select("*")
    .eq("date", today);

  if (error) {
    throw new Error(`Erro ao buscar eventos do dia: ${error.message}`);
  }

  return eventosDoDia || [];
}

async function fetchActiveWorkoutsForWeekday(weekday) {
  const { data, error } = await supabase
    .from("workout_schedule")
    .select(
      "id, user_id, weekday, is_active, workout_routines(name, muscle_groups)"
    )
    .eq("weekday", weekday)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Erro ao buscar treino ativo do dia: ${error.message}`);
  }

  return data || [];
}

async function markEventsAsCompleted(events = []) {
  for (const event of events) {
    const { error } = await supabase
      .from("events")
      .update({ status: "completed" })
      .eq("id", event.id);

    if (error) {
      console.error(
        `❌ Erro ao atualizar evento ${event.id} para completed:`,
        error
      );
      continue;
    }

    console.log(`✅ Evento ${event.id} atualizado para completed`);
  }
}

async function archivePastCompletedEvents() {
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("events")
    .update({ status: "archived" })
    .lt("date", today);

  if (error) {
    console.error("❌ Erro ao arquivar eventos completed do passado:", error);
  }
}

function buildMorningAgendaMessage(events) {
  const sortedEvents = [...events].sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
  );

  const lines = ["📅 Agenda do dia", ""];

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
}

function buildMorningAgendaAndWorkoutMessage(events = [], workout = null) {
  const sortedEvents = [...events].sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
  );

  let workoutText = "";

  const workoutRoutine = Array.isArray(workout?.workout_routines)
    ? workout.workout_routines[0]
    : workout?.workout_routines;

  if (workoutRoutine?.name) {
    const workoutName = workoutRoutine.name;
    const muscleGroups = String(workoutRoutine.muscle_groups || "").trim();

    workoutText = `💪 Treino de hoje:\n${workoutName}${
      muscleGroups ? `\n${muscleGroups}` : ""
    }`;
  }

  let message = "📅 Bom dia — Gestão Pessoal\n";

  if (sortedEvents.length > 0) {
    message += "\n🗓 Eventos de hoje:\n";

    for (const ev of sortedEvents) {
      message += `• ${ev.title || "Evento"} ${ev.start || ""}\n`;
    }
  }

  if (workoutText) {
    message += `\n${workoutText}\n`;
  }

  if (sortedEvents.length === 0 && !workoutText) {
    return "";
  }

  message += "\nBora manter a constância.";

  return message;
}

function groupEventsByUser(events) {
  return events.reduce((acc, event) => {
    if (!event.user_id) return acc;
    if (!acc.has(event.user_id)) acc.set(event.user_id, []);
    acc.get(event.user_id).push(event);
    return acc;
  }, new Map());
}

function groupWorkoutsByUser(workouts) {
  return workouts.reduce((acc, workout) => {
    if (!workout.user_id) return acc;
    if (!acc.has(workout.user_id)) acc.set(workout.user_id, []);
    acc.get(workout.user_id).push(workout);
    return acc;
  }, new Map());
}

function getWorkoutWeekdayInSaoPaulo(date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
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

let morningAgendaSchedulerTask = null;

export function startMorningAgendaScheduler() {
  if (morningAgendaSchedulerTask) {
    return morningAgendaSchedulerTask;
  }

  let isRunning = false;

  morningAgendaSchedulerTask = cron.schedule(
    MORNING_AGENDA_CRON,
    async () => {
      if (isRunning) {
        return;
      }

      isRunning = true;

      try {
        console.log("Scheduler de agenda matinal iniciado (07:00)");
        await archivePastCompletedEvents();

        const now = getNowInSaoPaulo();
        const workoutWeekday = getWorkoutWeekdayInSaoPaulo(now);

        const [events, workouts] = await Promise.all([
          fetchActiveEventsForDate(),
          fetchActiveWorkoutsForWeekday(workoutWeekday),
        ]);

        console.log(`Eventos do dia encontrados: ${events.length}`);
        console.log(`Treinos do dia encontrados: ${workouts.length}`);

        if (!events.length && !workouts.length) {
          console.log("Nenhum evento ou treino encontrado para hoje");
          return;
        }

        const groupedEvents = groupEventsByUser(events);
        const groupedWorkouts = groupWorkoutsByUser(workouts);
        const usersToNotify = new Set([
          ...groupedEvents.keys(),
          ...groupedWorkouts.keys(),
        ]);

        for (const userId of usersToNotify) {
          const userEvents = groupedEvents.get(userId) || [];
          const userWorkout = (groupedWorkouts.get(userId) || [])[0] || null;
          const whatsapp = await fetchUserWhatsapp(userId);
          const phone = normalizePhone(whatsapp);

          if (!phone) {
            console.warn(
              "⚠️ WhatsApp não encontrado ou inválido para usuário:",
              userId
            );
            continue;
          }

          const message = buildMorningAgendaAndWorkoutMessage(
            userEvents,
            userWorkout
          );

          if (!message) {
            continue;
          }

          console.log("Enviando WhatsApp (agenda + treino do dia)");
          const sendResult = await sendWhatsAppMessage({ phone, message });

          if (!sendResult?.ok) {
            console.error(
              "❌ Falha ao enviar agenda do dia:",
              sendResult?.status
            );
            continue;
          }

          console.log("Mensagem enviada com sucesso");

          if (userEvents.length) {
            await markEventsAsCompleted(userEvents);
          }
        }
      } catch (err) {
        console.error(
          "❌ Erro no scheduler de agenda matinal:",
          err.message || err
        );
      } finally {
        isRunning = false;
      }
    },
    { timezone: TZ }
  );

  console.log(
    `⏰ Scheduler de agenda matinal ativo (${MORNING_AGENDA_CRON} - ${TZ}).`
  );

  return morningAgendaSchedulerTask;
}

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
