import "dotenv/config";
import cron from "node-cron";
import { supabase } from "./supabase.js";

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

function getTodayDateOnly() {
  const now = getNowInSaoPaulo();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getDateOnly(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a, b) {
  return a.getTime() === b.getTime();
}

function isBefore(a, b) {
  return a.getTime() < b.getTime();
}

function hasPaidPlan(user) {
  const planType = String(user?.plan_type || "").toLowerCase();
  const billingStatus = String(user?.billing_status || "").toLowerCase();
  return planType && planType !== "trial" && billingStatus === "paid";
}

function isTrialLifecycleEligible(user) {
  if (String(user?.trial_status || "").toLowerCase() !== "active") return false;
  if (!user?.trial_end_at) return false;
  if (hasPaidPlan(user)) return false;
  return true;
}

function isTrialEndingToday(user) {
  if (!isTrialLifecycleEligible(user)) return false;
  const today = getTodayDateOnly();
  const end = getDateOnly(user.trial_end_at);
  if (!end) return false;
  return isSameDay(today, end);
}

function shouldBlockTrialUser(user) {
  if (!isTrialLifecycleEligible(user)) return false;
  const today = getTodayDateOnly();
  const end = getDateOnly(user.trial_end_at);
  if (!end) return false;
  return isBefore(end, today);
}

async function runTrialLifecycle(users) {
  for (const user of users || []) {
    if (!isTrialLifecycleEligible(user)) continue;

    if (isTrialEndingToday(user) && !user?.trial_notified_at && user?.whatsapp) {
      await sendWhatsApp(user.whatsapp, [
        "⚠️ Seu período de teste termina hoje.",
        "Para continuar usando o sistema sem interrupções, entre em contato para ativar seu plano.",
      ].join("\n"));

      const { error: notifyError } = await supabase
        .from("profiles")
        .update({ trial_notified_at: new Date().toISOString() })
        .eq("id", user.id);

      if (notifyError) {
        console.error("❌ Erro ao registrar aviso de trial:", {
          userId: user.id,
          error: notifyError,
        });
      }
    }

    if (shouldBlockTrialUser(user)) {
      const { error: blockError } = await supabase
        .from("profiles")
        .update({
          trial_status: "expired",
          subscription_status: "inactive",
        })
        .eq("id", user.id)
        .eq("trial_status", "active");

      if (blockError) {
        console.error("❌ Erro ao bloquear usuário com trial expirado:", {
          userId: user.id,
          error: blockError,
        });
      }
    }
  }
}


function getDayOfWeek() {
  const jsDay = getNowInSaoPaulo().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

async function fetchTodayWorkoutPlans() {
  const today = getDayOfWeek();

  const { data: plans, error } = await supabase
    .from('workout_schedule')
    .select('user_id, weekday, workout_id, time, is_active')
    .eq('weekday', today)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Erro ao buscar planejamento semanal: ${error.message}`);
  }

  const planRows = plans || [];
  const workoutIds = [...new Set(planRows.map((item) => item.workout_id).filter(Boolean))];

  let workoutById = new Map();
  if (workoutIds.length) {
    const { data: workouts, error: workoutError } = await supabase
      .from('workout_routines')
      .select('id, name')
      .in('id', workoutIds);

    if (workoutError) {
      throw new Error(`Erro ao buscar treinos do planejamento: ${workoutError.message}`);
    }

    workoutById = new Map((workouts || []).map((workout) => [workout.id, workout]));
  }

  return planRows.map((plan) => ({
    ...plan,
    workout: workoutById.get(plan.workout_id) || null,
  }));
}

function buildDailyWorkoutReminderMessage(plan) {
  return [
    'Bom dia! 💪',
    '',
    'Hoje é dia de:',
    `${plan?.workout?.name || 'Seu treino'}`,
    '',
    `Horário programado: ${plan?.time || '--:--'}`,
    '',
    'Bora treinar 🚀',
  ].join('\n');
}


function hasUserPaidThisMonth(user) {
  const today = getNowInSaoPaulo();

  const firstDayOfMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  if (!user?.last_payment_date) return false;

  const lastPayment = new Date(user.last_payment_date);

  return lastPayment >= firstDayOfMonth;
}

async function sendWhatsApp(phone, message) {
  try {
    return await sendWhatsAppMessage({ phone, message });
  } catch (err) {
    console.error("Erro WhatsApp:", err);
    return null;
  }
}

async function runDailyBilling(users) {
  const today = getNowInSaoPaulo();
  const day = today.getDate();

  for (const user of users || []) {
    if (user?.role === "admin") continue;
    if (hasUserPaidThisMonth(user)) continue;
    if (user?.subscription_status === "inactive") continue;
    if (!user?.whatsapp) continue;

    let message = null;

    if (day === 10) {
      message = `👋 Bom dia, ${user.name}!

Sua mensalidade do Gestão Pessoal venceu hoje (dia 10).

Para continuar com acesso completo ao sistema, realize o pagamento 🙏

Se já pagou, pode ignorar esta mensagem 👍`;
    }

    if (day === 15) {
      message = `👋 Olá, ${user.name}!

Identificamos que sua mensalidade ainda está em aberto.

Evite a suspensão do seu acesso realizando o pagamento o quanto antes 🙏

Se já pagou, pode ignorar esta mensagem 👍`;
    }

    if (day >= 20) {
      message = `⚠️ Atenção, ${user.name}!

Sua assinatura foi suspensa por falta de pagamento.

Para continuar utilizando o sistema, regularize sua mensalidade.

Se já pagou, pode ignorar esta mensagem 👍`;

      const { error: blockError } = await supabase
        .from("profiles")
        .update({ subscription_status: "inactive" })
        .eq("id", user.id);

      if (blockError) {
        console.error("❌ Erro ao bloquear usuário inadimplente:", {
          userId: user.id,
          error: blockError,
        });
      }
    }

    if (message) {
      await sendWhatsApp(user.whatsapp, message);
    }
  }
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
async function fetchActiveEventsForDate(dateStr) {
  const { data, error } = await supabase
    .from("events")
    .select("id, user_id, title, date, start, notes, is_active, sent")
    .eq("date", dateStr)
    .eq("is_active", true)
    .eq("sent", false);

  if (error) {
    throw new Error(`Erro ao buscar eventos ativos do dia: ${error.message}`);
  }

  return data || [];
}

async function deleteEventsByIds(eventIds) {
  if (!eventIds?.length) return;

  const uniqueIds = [...new Set(eventIds)];
  const { data, error } = await supabase
    .from("events")
    .delete()
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    console.error("❌ Erro ao remover eventos após disparo:", error);
    return;
  }

  (data || uniqueIds).forEach((event) => {
    const eventId = typeof event === "object" ? event.id : event;
    if (eventId) {
      console.log(`🗑️ Evento ${eventId} removido após disparo`);
    }
  });
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

function groupEventsByUser(events) {
  return events.reduce((acc, event) => {
    if (!event.user_id) return acc;
    if (!acc.has(event.user_id)) acc.set(event.user_id, []);
    acc.get(event.user_id).push(event);
    return acc;
  }, new Map());
}

async function sendAgendaEvents(date = getNowInSaoPaulo()) {
  const todayStr = formatDateOnlyInSaoPaulo(date);
  const eventsToday = await fetchActiveEventsForDate(todayStr);
  const groupedEvents = groupEventsByUser(eventsToday);

  console.log(`Eventos do dia encontrados: ${eventsToday.length}`);

  if (!eventsToday.length) {
    console.log("Nenhum evento encontrado para hoje");
    console.log("Disparo de agenda executado");
    return;
  }

  for (const [userId, userEvents] of groupedEvents.entries()) {
    const whatsapp = await fetchUserWhatsapp(userId);
    const phone = normalizePhone(whatsapp);

    if (!phone) {
      console.warn(
        "⚠️ WhatsApp não encontrado ou inválido para usuário da agenda:",
        userId
      );
      continue;
    }

    const message = buildMorningAgendaMessage(userEvents);
    const sendResult = await sendWhatsAppMessage({ phone, message });

    if (!sendResult?.ok) {
      console.error("❌ Falha ao enviar agenda diária:", sendResult?.status);
      continue;
    }

    const { error: markSentError } = await supabase
      .from("events")
      .update({ sent: true })
      .in("id", userEvents.map((event) => event.id));

    if (markSentError) {
      console.error("❌ Erro ao marcar eventos como enviados:", markSentError);
    }
  }

  console.log("Disparo de agenda executado");
}

/**
 * Busca o WhatsApp do usuário na tabela profiles.
 * Aqui usamos o userId que vem do campo user_id da tabela events.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function fetchUserWhatsapp(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("whatsapp")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("❌ Erro buscando whatsapp em profiles:", error);
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

        const now = getNowInSaoPaulo();

        await sendAgendaEvents(now);

        const plans = await fetchTodayWorkoutPlans();
        console.log(`Planejamentos de treino ativos para hoje: ${plans.length}`);

        for (const plan of plans) {
          const whatsapp = await fetchUserWhatsapp(plan.user_id);
          const phone = normalizePhone(whatsapp);

          if (!phone) {
            console.warn(
              "⚠️ WhatsApp não encontrado ou inválido para usuário do planejamento:",
              plan.user_id
            );
            continue;
          }

          const message = buildDailyWorkoutReminderMessage(plan);
          const sendResult = await sendWhatsAppMessage({ phone, message });

          if (!sendResult?.ok) {
            console.error(
              "❌ Falha ao enviar lembrete diário de treino:",
              sendResult?.status
            );
          }
        }

        const { data: users, error: usersError } = await supabase
          .from("profiles")
          .select("*");

        if (usersError) {
          console.error("❌ Erro ao buscar usuários para cobrança:", usersError);
        } else {
          await runTrialLifecycle(users);
          await runDailyBilling(users);
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
