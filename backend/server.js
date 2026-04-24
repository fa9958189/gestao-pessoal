import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import Stripe from "stripe";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import multer from "multer";
import foodsRouter from "./routes/foods.js";
import eventsRoutes from "./routes/events.js";
import treinosRoutes from "./routes/treinos.js";
import {
  getCircuitBreakerState,
  supabase,
} from "./supabase.js";
import { logError, logInfo, logWarn } from "./utils/logger.js";
import {
  sendWhatsAppMessage,
  startMorningAgendaScheduler,
} from "./reminders.js";
import { startDailyGoalsReminder } from "./jobs/dailyGoalsReminder.js";
import { startWorkoutReminderScheduler } from "./schedulers/workoutReminderScheduler.js";
import { analyzeFoodImage } from "./ai/foodScanner.js";
import {
  createWorkoutSession,
  deleteWorkoutSession,
  listWorkoutSessions,
  listWorkoutTemplates,
  saveWorkoutReminder,
  summarizeProgress,
  upsertWorkoutTemplate,
} from "./workoutsStorage.js";
import {
  addHydration,
  getFoodDiaryState,
  getWaterSummary,
  saveFoodDiaryState,
  undoLastHydration,
  updateWaterGoal,
} from "./foodDiaryStorage.js";
import PLANOS from "./config/planos.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_PRICE_ID_NORMAL = String(process.env.STRIPE_PRICE_ID_NORMAL || "").trim();
const STRIPE_PRICE_ID_PROMO = String(process.env.STRIPE_PRICE_ID_PROMO || "").trim();
const PAYMENT_ALREADY_USED_MESSAGE = "Este pagamento já foi utilizado para criar um acesso.";

const app = express();
app.use(cors());

const normalizeStripePlanType = ({ priceId, amountTotal }) => {
  if (priceId && STRIPE_PRICE_ID_NORMAL && priceId === STRIPE_PRICE_ID_NORMAL) return "normal";
  if (priceId && STRIPE_PRICE_ID_PROMO && priceId === STRIPE_PRICE_ID_PROMO) return "promo";
  if (Number(amountTotal) === 8000) return "normal";
  if (Number(amountTotal) === 4990) return "promo";
  return "normal";
};

const getStripeSessionPriceId = async (sessionId) => {
  if (!sessionId) return null;
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 1 });
    const firstItem = Array.isArray(lineItems?.data) ? lineItems.data[0] : null;
    return firstItem?.price?.id || null;
  } catch (error) {
    console.error("Erro ao obter line items da sessão Stripe:", error);
    return null;
  }
};

const upsertPaymentAccessToken = async (payload) => {
  const { error } = await supabase
    .from("payment_access_tokens")
    .upsert(payload, { onConflict: "session_id" });

  if (error) {
    console.error("Erro ao salvar token de ativação por pagamento:", error);
    throw error;
  }
};

app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;
  console.log("[Stripe webhook] Evento recebido:", event.type);

  switch (event.type) {
    case "checkout.session.completed": {
      const sessionId = data?.id || null;
      const stripeCustomerId = data?.customer || null;
      const email = String(data?.customer_details?.email || data?.customer_email || "").trim().toLowerCase();
      const stripeSubscriptionId = data?.subscription || null;
      const amountTotal = Number(data?.amount_total || 0);
      const priceId = await getStripeSessionPriceId(sessionId);
      const planType = normalizeStripePlanType({ priceId, amountTotal });

      if (!sessionId || !email) {
        console.warn("[Stripe webhook] checkout.session.completed sem session_id/email.");
        break;
      }

      await upsertPaymentAccessToken({
        session_id: sessionId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        email,
        plan_type: planType,
        payment_status: "paid",
        used: false,
      });

      console.log("[Stripe webhook] Sessão marcada como paga:", sessionId);
      break;
    }
    case "customer.subscription.deleted": {
      const stripeCustomerId = data?.customer || null;
      if (!stripeCustomerId) break;

      await supabase
        .from("profiles")
        .update({
          subscription_status: "inactive",
          billing_status: "canceled",
          status_acesso: "inativo",
        })
        .eq("stripe_customer_id", stripeCustomerId);

      await supabase
        .from("payment_access_tokens")
        .update({
          payment_status: "canceled",
        })
        .eq("stripe_customer_id", stripeCustomerId);

      console.log("[Stripe webhook] Assinatura cancelada:", stripeCustomerId);
      break;
    }
    case "invoice.payment_failed": {
      const stripeCustomerId = data?.customer || null;
      if (!stripeCustomerId) break;

      await supabase
        .from("profiles")
        .update({
          billing_status: "past_due",
        })
        .eq("stripe_customer_id", stripeCustomerId);

      await supabase
        .from("payment_access_tokens")
        .update({
          payment_status: "past_due",
        })
        .eq("stripe_customer_id", stripeCustomerId);

      console.log("[Stripe webhook] Pagamento falhou:", stripeCustomerId);
      break;
    }
    case "invoice.paid": {
      const stripeCustomerId = data?.customer || null;
      if (!stripeCustomerId) break;

      await supabase
        .from("profiles")
        .update({
          billing_status: "paid",
          subscription_status: "active",
          status_acesso: "ativo",
          last_paid_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", stripeCustomerId);

      await supabase
        .from("payment_access_tokens")
        .update({
          payment_status: "paid",
        })
        .eq("stripe_customer_id", stripeCustomerId);

      console.log("[Stripe webhook] Fatura paga:", stripeCustomerId);
      break;
    }
    default:
      console.log(`Evento não tratado: ${event.type}`);
  }

  res.json({ received: true });
});

app.use(express.json());
app.use("/api/foods", foodsRouter);
app.use("/api/events", eventsRoutes);
app.use("/events", eventsRoutes);
app.use("/treinos", treinosRoutes);

const BILLING_DEFAULT_DUE_DAY = 10;
const BILLING_OVERDUE_DAY = 20;
const USER_PLAN_TYPES = Object.freeze({
  TRIAL: "trial",
  NORMAL: "normal",
  PROMO: "promo",
});
const PLAN_MONTHLY_VALUES = Object.freeze({
  [USER_PLAN_TYPES.TRIAL]: 0,
  [USER_PLAN_TYPES.NORMAL]: PLANOS.NORMAL.valor,
  [USER_PLAN_TYPES.PROMO]: PLANOS.PROMO.valor,
  vip: 200,
});
const ALLOWED_USER_PLAN_TYPES = new Set(Object.values(USER_PLAN_TYPES));
const SUPER_ADMIN_EMAIL = "gestaopessoaloficial@gmail.com";
let schedulerStarted = false;
const OWNER_EMAIL = SUPER_ADMIN_EMAIL.toLowerCase();
const OWNER_AFFILIATE_SEED = Object.freeze({
  code: "FELI0001",
  name: "Felipe",
  email: SUPER_ADMIN_EMAIL,
  whatsapp: "+5563992393705",
  is_active: true,
  pix_key: null,
  commission_cents: 2000,
});

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isOwnerEmail = (email) => normalizeEmail(email) === OWNER_EMAIL;

const getOwnerProtectionUpdatePayload = () => ({
  subscription_status: "active",
  billing_status: "paid",
  is_affiliate: true,
});

const enforceOwnerProtectionByEmail = async () => {
  const { error } = await supabase
    .from("profiles")
    .update(getOwnerProtectionUpdatePayload())
    .eq("email", SUPER_ADMIN_EMAIL);

  if (error && error.code !== "PGRST116") {
    console.error("Erro ao aplicar proteção do owner por email:", error);
  }
};

const getUserByIdForOwnerProtection = async (userId) => {
  const { data: user, error } = await supabase
    .from("profiles")
    .select("id, email, role, is_affiliate, subscription_status, billing_status")
    .eq("id", userId)
    .maybeSingle();
  return { user, error };
};

const enforceOwnerProtectionById = async (userId) => {
  const { user, error } = await getUserByIdForOwnerProtection(userId);
  if (error) return { user: null, error };
  if (!user?.id) return { user: null, isOwner: false, error: null };
  if (!isOwnerEmail(user.email)) return { user, isOwner: false, error: null };

  const payload = getOwnerProtectionUpdatePayload();
  const needsUpdate =
    user.subscription_status !== payload.subscription_status ||
    user.billing_status !== payload.billing_status ||
    user.is_affiliate !== payload.is_affiliate;

  if (needsUpdate) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);
    if (updateError) {
      return { user, isOwner: true, error: updateError };
    }
  }

  return {
    user: {
      ...user,
      ...payload,
    },
    isOwner: true,
    error: null,
  };
};

function parseBoolean(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeErrorMessage = (error) => String(error?.message || "").toLowerCase();
const normalizeErrorCode = (error) => String(error?.code || "").toLowerCase();
const isDuplicateEmailError = (error) => {
  const code = normalizeErrorCode(error);
  const message = normalizeErrorMessage(error);
  return (
    code === "email_exists" ||
    code === "23505" ||
    message.includes("email_exists") ||
    message.includes("already been registered") ||
    message.includes("duplicate key")
  );
};
const isPermissionError = (error) => {
  const code = normalizeErrorCode(error);
  const message = normalizeErrorMessage(error);
  return (
    code === "42501" ||
    code === "401" ||
    code === "403" ||
    message.includes("permission denied") ||
    message.includes("not authorized") ||
    message.includes("jwt") ||
    message.includes("forbidden")
  );
};
const buildApiErrorMessage = (error) => {
  if (isDuplicateEmailError(error)) return "Este email já está cadastrado";
  if (isPermissionError(error)) return "Sem permissão";
  return "Erro interno, tente novamente";
};
const isSupabaseTemporaryFailure = (error) => {
  const raw =
    `${error?.message || ""} ${error?.details || ""} ${error?.cause?.message || ""} ${
      error?.cause?.code || ""
    } ${error?.code || ""} ${error?.status || ""}`.toLowerCase();

  return (
    raw.includes("supabase_circuit_open") ||
    raw.includes("timeout") ||
    raw.includes("connect timeout") ||
    raw.includes("und_err_connect_timeout") ||
    raw.includes("fetch failed") ||
    raw.includes("502") ||
    raw.includes("503") ||
    raw.includes("504")
  );
};

const formatDateOnly = (date) => date.toISOString().split("T")[0];
const parseDateSafe = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPlanMonthlyValue = (planType) => {
  const normalizedPlan = String(planType || "").trim().toLowerCase();
  return PLAN_MONTHLY_VALUES[normalizedPlan] ?? PLAN_MONTHLY_VALUES[USER_PLAN_TYPES.NORMAL];
};

const getTrialEndDate = (user) => {
  const trialEnd = parseDateSafe(user?.trial_end_at || user?.plan_end_date);
  if (trialEnd) return trialEnd;
  const createdAt = parseDateSafe(user?.created_at);
  if (!createdAt) return null;
  const fallbackEnd = new Date(createdAt);
  fallbackEnd.setDate(fallbackEnd.getDate() + 30);
  return fallbackEnd;
};

const isTrialActive = (user, today = new Date()) => {
  const planType = String(user?.plan_type || "").toLowerCase();
  if (planType !== USER_PLAN_TYPES.TRIAL) return false;
  const trialEnd = getTrialEndDate(user);
  if (!trialEnd) return false;
  return today <= trialEnd;
};

const startOfCurrentMonth = (today = new Date()) =>
  new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);

const hasPaidCurrentMonth = (user, today = new Date()) => {
  const lastPayment = parseDateSafe(
    user?.last_paid_at || user?.billing_last_paid_at || user?.last_payment_at,
  );
  if (!lastPayment) return false;
  return lastPayment >= startOfCurrentMonth(today);
};

const normalizeDueDay = (user) => {
  const dueDay = Number(user?.billing_due_day || user?.due_day || BILLING_DEFAULT_DUE_DAY);
  if (!Number.isFinite(dueDay)) return BILLING_DEFAULT_DUE_DAY;
  return Math.min(28, Math.max(1, Math.trunc(dueDay)));
};

const computeNextDueDate = (dueDay = BILLING_DEFAULT_DUE_DAY, baseDate = new Date()) => {
  const normalizedDueDay = Math.min(28, Math.max(1, Number(dueDay) || BILLING_DEFAULT_DUE_DAY));
  const candidate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    normalizedDueDay,
    0,
    0,
    0,
    0,
  );
  if (candidate <= baseDate) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return formatDateOnly(candidate);
};

const isFinanceOperationalUser = (user) => {
  if (!user?.id) return false;
  if (isOwnerEmail(user?.email)) return false;
  if (String(user?.role || "").toLowerCase() === "admin") return false;
  return true;
};

const getFinanceStatus = (user, today = new Date()) => {
  if (isTrialActive(user, today)) return "trial";
  if (String(user?.subscription_status || "").toLowerCase() === "inactive") return "blocked";
  if (hasPaidCurrentMonth(user, today) || String(user?.billing_status || "").toLowerCase() === "paid") {
    return "paid";
  }
  const dueDay = normalizeDueDay(user);
  const currentDay = today.getDate();
  if (currentDay === dueDay) return "due_today";
  if (currentDay > BILLING_OVERDUE_DAY) return "overdue";
  return "pending";
};

const getOverdueDays = (user, today = new Date()) => {
  if (getFinanceStatus(user, today) !== "overdue") return 0;
  return Math.max(0, today.getDate() - BILLING_OVERDUE_DAY);
};

const AUTH_CACHE_TTL_MS = 60 * 1000;
const authCache = new Map();

const clearExpiredAuthCache = () => {
  const now = Date.now();
  for (const [token, cached] of authCache.entries()) {
    if (!cached?.expiresAt || cached.expiresAt <= now) {
      authCache.delete(token);
      logInfo("auth_cache_expired", { tokenSize: token.length });
    }
  }
};

const getAuthCache = (token) => {
  clearExpiredAuthCache();
  const cached = authCache.get(token);
  if (!cached) return null;

  if (!cached.expiresAt || cached.expiresAt <= Date.now()) {
    authCache.delete(token);
    logInfo("auth_cache_expired", { tokenSize: token.length });
    return null;
  }

  return cached;
};

const setAuthCache = (token, payload) => {
  authCache.set(token, payload);
  logInfo("auth_cache_set", { tokenSize: token.length, expiresAt: payload.expiresAt });
};

const invalidateAuthCache = (token) => {
  if (!token) return;
  authCache.delete(token);
};

const getBearerToken = (req) => {
  const authHeader = req.headers["authorization"] || "";
  return authHeader.startsWith("Bearer")
    ? authHeader.replace(/Bearer\s+/i, "").trim()
    : null;
};

const sendSupabaseUnavailable = (res) =>
  res
    .status(503)
    .json({ error: "Serviço temporariamente indisponível. Tente novamente em instantes." });

const computePlanDates = (planType) => {
  const today = new Date();
  const planStartDate = formatDateOnly(today);
  let planEndDate = null;

  if (planType === USER_PLAN_TYPES.TRIAL) {
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    planEndDate = formatDateOnly(end);
  }

  if (planType === USER_PLAN_TYPES.PROMO) {
    const end = new Date(today);
    end.setMonth(end.getMonth() + 4);
    planEndDate = formatDateOnly(end);
  }

  return { planStartDate, planEndDate };
};

const getFinancialStatus = (user) => {
  const today = new Date();

  if (user?.role === "admin") {
    return "PAID";
  }

  if (String(user?.plan_type || "").toLowerCase() === USER_PLAN_TYPES.TRIAL) {
    const trialEndDate = getTrialEndDate(user);
    if (trialEndDate && isTrialActive(user, today)) {
      return "TRIAL";
    }
    return "TRIAL_EXPIRED";
  }

  const dueDay = Number(user?.billing_due_day || user?.due_day || BILLING_DEFAULT_DUE_DAY);

  const lastPaymentRaw = user?.last_payment_date || user?.last_payment_at || user?.last_paid_at;
  const lastPayment = lastPaymentRaw ? new Date(lastPaymentRaw) : null;
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  if (lastPayment && !Number.isNaN(lastPayment.getTime()) && lastPayment >= firstDayOfMonth) {
    return "PAID";
  }

  if (today.getDate() === dueDay) {
    return "DUE_TODAY";
  }

  if (today.getDate() > dueDay) {
    return "OVERDUE";
  }

  return "PENDING";
};

const hasExercisesByGroupContent = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.some((key) => Array.isArray(value[key]) && value[key].length > 0);
};

const findMainAffiliateFallback = async () => {
  try {
    const ensuredOwner = await ensureOwnerAffiliateExists();
    if (ensuredOwner?.id && ensuredOwner.is_active === true) {
      return ensuredOwner;
    }
  } catch (err) {
    console.error("Erro ao garantir afiliado principal no fallback:", err);
  }

  const { data: byOwnerEmail, error: byOwnerEmailError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
    .eq("is_active", true)
    .eq("email", SUPER_ADMIN_EMAIL)
    .limit(1)
    .maybeSingle();

  if (byOwnerEmailError && byOwnerEmailError.code !== "PGRST116") {
    console.error("Erro ao buscar afiliado principal por email fixo:", byOwnerEmailError);
  }
  if (byOwnerEmail?.id) return byOwnerEmail;

  const { data: byFelipeName, error: byNameError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
    .eq("is_active", true)
    .ilike("name", "%felipe%")
    .limit(1)
    .maybeSingle();

  if (byNameError && byNameError.code !== "PGRST116") {
    console.error("Erro ao buscar afiliado principal por nome:", byNameError);
  }
  if (byFelipeName?.id) return byFelipeName;

  const { data: byFelipeEmail, error: byEmailError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
    .eq("is_active", true)
    .ilike("email", "%gestaopessoaloficial@gmail.com%")
    .limit(1)
    .maybeSingle();

  if (byEmailError && byEmailError.code !== "PGRST116") {
    console.error("Erro ao buscar afiliado principal por email:", byEmailError);
  }
  if (byFelipeEmail?.id) return byFelipeEmail;

  return null;
};

const ensureOwnerAffiliateExists = async () => {
  const { data: existingOwner, error: findError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
    .eq("email", SUPER_ADMIN_EMAIL)
    .limit(1)
    .maybeSingle();

  if (findError && findError.code !== "PGRST116") {
    console.error("Erro ao verificar afiliado principal:", findError);
    throw findError;
  }

  if (existingOwner?.id) {
    return existingOwner;
  }

  const { data: createdOwner, error: createError } = await supabase
    .from("affiliates")
    .insert(OWNER_AFFILIATE_SEED)
    .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
    .single();

  if (createError) {
    console.error("Erro ao criar afiliado principal:", createError);
    throw createError;
  }

  return createdOwner;
};

const resolveAffiliate = async (affiliateId) => {
  const normalizedId =
    typeof affiliateId === "string" && affiliateId.trim().length ? affiliateId.trim() : null;
  let finalAffiliateId = normalizedId;

  if (!finalAffiliateId) {
    try {
      const ownerAffiliate = await ensureOwnerAffiliateExists();
      finalAffiliateId = ownerAffiliate?.id || null;
    } catch (err) {
      console.error("Erro ao garantir afiliado principal padrão:", err);
    }

    if (!finalAffiliateId) {
      const mainAffiliate = await findMainAffiliateFallback();
      finalAffiliateId = mainAffiliate?.id || null;
    }

    if (!finalAffiliateId) {
      return { error: "Afiliado obrigatório. Não foi possível encontrar afiliado principal." };
    }
  }

  const { data: affiliate, error: affiliateError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, is_active")
    .eq("id", finalAffiliateId)
    .eq("is_active", true)
    .maybeSingle();

  if (affiliateError) {
    console.error("Erro ao buscar afiliado ativo:", affiliateError);
    return { error: affiliateError.message || "Erro ao validar afiliado." };
  }

  if (!affiliate?.id) {
    return { error: "Afiliado inválido ou inativo" };
  }

  return { affiliate };
};

const normalizeAffiliateCodeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .toUpperCase();

const generateAffiliateCode = (name = "") => {
  const base = normalizeAffiliateCodeText(name)
    .split(/\s+/)
    .filter(Boolean)
    .join("")
    .slice(0, 4)
    .padEnd(3, "AFI");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${base}${suffix}`;
};

const ENABLE_MORNING_AGENDA = process.env.ENABLE_MORNING_AGENDA === "true";
const ENABLE_DAILY_GOALS_REMINDER =
  process.env.ENABLE_DAILY_GOALS_REMINDER !== "false";

// Inicia os schedulers uma única vez
if (!schedulerStarted) {
  if (ENABLE_MORNING_AGENDA) startMorningAgendaScheduler();
  if (ENABLE_DAILY_GOALS_REMINDER) startDailyGoalsReminder();
  startWorkoutReminderScheduler();
  schedulerStarted = true;
}

app.get("/health", (req, res) => {
  return res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/supabase", async (req, res) => {
  clearExpiredAuthCache();
  const circuit = getCircuitBreakerState();
  const basePayload = {
    service: "supabase",
    circuit,
    cache: {
      authEntries: authCache.size,
    },
  };

  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      logWarn("supabase_healthcheck_failure", { message: error?.message, code: error?.code });
      return res.status(503).json({ ok: false, ...basePayload });
    }

    return res.status(200).json({ ok: true, ...basePayload });
  } catch (err) {
    logWarn("supabase_healthcheck_failure", { message: err?.message, code: err?.code });
    return res.status(503).json({ ok: false, ...basePayload });
  }
});

app.get("/debug/zapi-test", async (req, res) => {
  try {
    const phone = req.query.phone;
    const message = req.query.message || "Teste Z-API: chegou!";

    await sendWhatsAppMessage({ phone, message });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/debug/send-whatsapp", async (req, res) => {
  try {
    const phone = req.body?.phone;
    const message = req.body?.message || "Teste Z-API: chegou!";

    const result = await sendWhatsAppMessage({ phone, message });

    res.json({
      ok: true,
      status: result?.status ?? null,
      body: result?.body ?? null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");

const resolveDataPath = (fileName) => path.join(dataDir, fileName);

const loadJsonArray = async (fileName) => {
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = resolveDataPath(fileName);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
};

const saveJsonArray = async (fileName, data) => {
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = resolveDataPath(fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const scanFoodUpload = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "Imagem muito grande. Tamanho máximo 8MB." });
      }

      return res.status(400).json({ error: "Erro ao processar a imagem." });
    }

    if (err) {
      return res.status(400).json({ error: "Erro ao processar a imagem." });
    }

    return next();
  });
};

app.get("/stripe/checkout/validate", async (req, res) => {
  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      return res.status(400).json({
        valid: false,
        already_used: false,
        email: null,
        plan_type: null,
        customer_id: null,
        message: "session_id é obrigatório.",
      });
    }

    let { data: tokenRow, error: tokenError } = await supabase
      .from("payment_access_tokens")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (tokenError) {
      console.error("Erro ao buscar token de ativação:", tokenError);
      return res.status(500).json({
        valid: false,
        already_used: false,
        email: null,
        plan_type: null,
        customer_id: null,
        message: "Erro ao validar sessão de pagamento.",
      });
    }

    if (!tokenRow) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const paymentStatus = String(session?.payment_status || "").toLowerCase();
      const isPaid = paymentStatus === "paid";

      if (!isPaid) {
        console.log("[Stripe validate] Sessão não está paga:", sessionId);
        return res.json({
          valid: false,
          already_used: false,
          email: null,
          plan_type: null,
          customer_id: session?.customer || null,
          message: "Pagamento ainda não confirmado.",
        });
      }

      const priceId = await getStripeSessionPriceId(sessionId);
      const planType = normalizeStripePlanType({
        priceId,
        amountTotal: session?.amount_total,
      });

      const fallbackEmail = String(
        session?.customer_details?.email || session?.customer_email || ""
      ).trim().toLowerCase();

      if (!fallbackEmail) {
        return res.json({
          valid: false,
          already_used: false,
          email: null,
          plan_type: null,
          customer_id: session?.customer || null,
          message: "Não foi possível identificar o email deste pagamento.",
        });
      }

      await upsertPaymentAccessToken({
        session_id: sessionId,
        stripe_customer_id: session?.customer || null,
        stripe_subscription_id: session?.subscription || null,
        email: fallbackEmail,
        plan_type: planType,
        payment_status: "paid",
        used: false,
      });

      const { data: insertedToken } = await supabase
        .from("payment_access_tokens")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      tokenRow = insertedToken;
    }

    const isPaid = String(tokenRow?.payment_status || "").toLowerCase() === "paid";
    const alreadyUsed = tokenRow?.used === true;
    const valid = isPaid;

    console.log("[Stripe validate] Sessão validada:", {
      sessionId,
      valid,
      alreadyUsed,
    });

    return res.json({
      valid,
      already_used: alreadyUsed,
      email: tokenRow?.email || null,
      plan_type: tokenRow?.plan_type || null,
      customer_id: tokenRow?.stripe_customer_id || null,
      message: alreadyUsed
        ? "Este pagamento já foi utilizado para criar um acesso."
        : valid
        ? "Pagamento confirmado."
        : "Pagamento ainda não confirmado.",
    });
  } catch (error) {
    console.error("Erro ao validar checkout Stripe:", error);
    return res.status(500).json({
      valid: false,
      already_used: false,
      email: null,
      plan_type: null,
      customer_id: null,
      message: "Não foi possível validar o pagamento.",
    });
  }
});

app.get("/stripe/confirm", async (req, res) => {
  const sessionId = String(req.query?.session_id || "").trim();

  if (!sessionId) {
    return res.status(400).json({ success: false });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session?.payment_status === "paid") {
      return res.json({ success: true });
    }

    return res.json({ success: false });
  } catch (err) {
    console.error("Erro ao confirmar sessão Stripe:", err);
    return res.status(500).json({ success: false });
  }
});

app.post("/stripe/checkout/create-account", async (req, res) => {
  try {
    const sessionId = String(req.body?.session_id || "").trim();
    const name = String(req.body?.name || "").trim();
    const whatsapp = String(req.body?.whatsapp || "").trim();
    const password = String(req.body?.password || "");

    if (!sessionId || !name || !whatsapp || !password) {
      return res.status(400).json({ error: "session_id, name, whatsapp e password são obrigatórios." });
    }

    if (password.trim().length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    const { data: tokenRow, error: tokenError } = await supabase
      .from("payment_access_tokens")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (tokenError) {
      console.error("Erro ao buscar token de pagamento para criação de conta:", tokenError);
      return res.status(500).json({ error: "Erro ao validar pagamento." });
    }

    if (!tokenRow) {
      return res.status(404).json({ error: "Pagamento não encontrado." });
    }

    if (tokenRow.used === true) {
      console.log("[Stripe create-account] Tentativa duplicada:", sessionId);
      return res.status(409).json({ error: PAYMENT_ALREADY_USED_MESSAGE });
    }

    if (String(tokenRow.payment_status || "").toLowerCase() !== "paid") {
      return res.status(400).json({ error: "Pagamento ainda não confirmado." });
    }

    const { affiliate, error: affiliateResolveError } = await resolveAffiliate(null);
    if (affiliateResolveError || !affiliate?.id) {
      return res.status(400).json({ error: affiliateResolveError || "Afiliado padrão não encontrado." });
    }

    const email = String(tokenRow.email || "").trim().toLowerCase();
    const planType = String(tokenRow.plan_type || "normal").trim().toLowerCase();
    const now = new Date();
    const nowIso = now.toISOString();
    const { planStartDate, planEndDate } = computePlanDates(planType);

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: password.trim(),
      email_confirm: true,
    });

    if (authError) {
      console.error("Erro ao criar usuário no Auth por pagamento:", authError);
      if (isDuplicateEmailError(authError)) {
        return res.status(409).json({ error: "Este email já está cadastrado." });
      }
      return res.status(500).json({ error: buildApiErrorMessage(authError) });
    }

    const userId = authUser?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: "Erro ao criar usuário no Auth." });
    }

    const affiliateCode = "AFF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const profilePayload = {
      id: userId,
      name,
      username: email,
      email,
      whatsapp,
      role: "user",
      billing_status: "paid",
      billing_due_day: BILLING_DEFAULT_DUE_DAY,
      affiliate_id: affiliate.id,
      affiliate_code: affiliateCode,
      plan_type: planType,
      plan_start_date: planStartDate,
      plan_end_date: planEndDate,
      trial_start_at: null,
      trial_end_at: null,
      trial_status: null,
      trial_notified_at: null,
      stripe_customer_id: tokenRow.stripe_customer_id || null,
      subscription_status: "active",
      status_acesso: "ativo",
      last_paid_at: nowIso,
    };

    const { error: profileError } = await supabase.from("profiles").insert(profilePayload);
    if (profileError) {
      console.error("Erro ao criar profile por pagamento:", profileError);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: "Erro ao criar perfil do usuário." });
    }

    const { error: updateTokenError } = await supabase
      .from("payment_access_tokens")
      .update({
        used: true,
        used_at: nowIso,
        auth_user_id: userId,
        profile_id: userId,
      })
      .eq("session_id", sessionId)
      .eq("used", false);

    if (updateTokenError) {
      console.error("Erro ao marcar token como utilizado:", updateTokenError);
      return res.status(500).json({ error: "Conta criada, mas não foi possível concluir a ativação." });
    }

    console.log("[Stripe create-account] Conta criada com sucesso:", { sessionId, userId, email });
    return res.json({
      success: true,
      email,
      auto_login_email: email,
      message: "Conta criada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao criar conta por pagamento:", error);
    return res.status(500).json({ error: "Erro ao criar conta por pagamento." });
  }
});

app.post("/scan-food", scanFoodUpload, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Imagem não enviada" });
    }

    if (!req.file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ error: "Tipo de arquivo inválido." });
    }

    let imageBuffer = req.file.buffer;
    let mimeType = req.file.mimetype;
    const normalizedMimeType = mimeType?.toLowerCase() || "";

    if (normalizedMimeType === "image/heic" || normalizedMimeType === "image/heif") {
      imageBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
      mimeType = "image/jpeg";
    }

    const description = req.body?.description || "";

    const analysis = await analyzeFoodImage(imageBuffer, mimeType, description);

    return res.json(analysis);
  } catch (err) {
    console.error("Erro ao analisar imagem de comida:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Falha ao analisar imagem" });
  }
});

app.post("/create-user", async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const {
      name,
      email,
      username,
      password,
      whatsapp,
      role,
      affiliateCode,
      affiliate_id,
      plan_type,
      apply_trial: applyTrial,
    } = req.body;

    if (!name || !email || !whatsapp || !plan_type) {
      return res.status(400).json({
        error: "name, email, whatsapp e plan_type são obrigatórios.",
      });
    }

    const rawEmail = String(email || "").trim().toLowerCase();
    const rawUsername = String(username || rawEmail).trim();
    const normalizedRole = String(role || "user").trim().toLowerCase() || "user";

    const rawAffiliateId = typeof affiliate_id === "string" ? affiliate_id.trim() : "";
    const isAffiliateIdFilled = rawAffiliateId.length > 0;
    const isUuid =
      isAffiliateIdFilled &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        rawAffiliateId
      );

    if (isAffiliateIdFilled && !isUuid) {
      return res.status(400).json({
        error: "affiliate_id deve ser um UUID válido.",
      });
    }

    const normalizedPlanType = String(plan_type || "").trim().toLowerCase();
    const fallbackPlanType = applyTrial ? USER_PLAN_TYPES.TRIAL : "";
    const finalPlanType = normalizedPlanType || fallbackPlanType;

    if (!ALLOWED_USER_PLAN_TYPES.has(finalPlanType)) {
      return res.status(400).json({
        error: "plan_type obrigatório e deve ser trial, normal ou promo.",
      });
    }

    const trimmedAffiliateCode = (affiliateCode || "").trim();
    let incomingAffiliateId = isAffiliateIdFilled ? rawAffiliateId : null;

    if (!incomingAffiliateId && trimmedAffiliateCode) {
      const { data: affiliateByCode, error: affiliateByCodeError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", trimmedAffiliateCode)
        .eq("is_active", true)
        .maybeSingle();

      if (affiliateByCodeError) {
        console.error("Erro ao buscar afiliado por código:", affiliateByCodeError);
        return res.status(400).json({ error: affiliateByCodeError.message });
      }

      if (affiliateByCode?.id) {
        incomingAffiliateId = affiliateByCode.id;
      }
    }

    const { affiliate, error: affiliateResolveError } = await resolveAffiliate(incomingAffiliateId);
    if (affiliateResolveError) {
      return res.status(400).json({ error: affiliateResolveError });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const { planStartDate, planEndDate } = computePlanDates(finalPlanType);
    const trialStartIso = finalPlanType === USER_PLAN_TYPES.TRIAL ? nowIso : null;
    const trialEndIso =
      finalPlanType === USER_PLAN_TYPES.TRIAL && planEndDate
        ? `${planEndDate}T00:00:00.000Z`
        : null;

    if (!rawEmail.includes("@") || !rawEmail.includes(".")) {
      return res.status(400).json({ error: "email inválido." });
    }

    const generatedPassword =
      typeof password === "string" && password.trim().length >= 6 ? password.trim() : "123456";

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: rawEmail,
      password: generatedPassword,
      email_confirm: true,
    });

    if (authError) {
      console.error("Erro ao criar usuário no Auth:", authError);
      if (isDuplicateEmailError(authError)) {
        return res.status(400).json({ error: "Este email já está cadastrado" });
      }
      return res.status(500).json({ error: buildApiErrorMessage(authError) });
    }

    const userId = authUser?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: "Erro interno, tente novamente" });
    }

    const generateAffiliateCode = () => {
      return "AFF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const profileAffiliateCode = normalizedRole === "admin" ? "OWNER001" : generateAffiliateCode();

    const createUserPayload = {
      id: userId,
      name,
      username: rawUsername,
      email: rawEmail,
      whatsapp,
      role: normalizedRole,
      billing_status: "active",
      billing_due_day: BILLING_DEFAULT_DUE_DAY,
      affiliate_id: affiliate.id,
      affiliate_code: profileAffiliateCode,
      plan_type: finalPlanType,
      plan_start_date: planStartDate,
      plan_end_date: planEndDate,
      trial_start_at: trialStartIso,
      trial_end_at: trialEndIso,
      trial_status: finalPlanType === USER_PLAN_TYPES.TRIAL ? "active" : null,
      trial_notified_at: null,
      subscription_status: "active",
      status_acesso: "ativo",
    };

    const { error: profileError } = await supabase.from("profiles").insert(createUserPayload);

    if (profileError) {
      console.error("Erro ao gravar em profiles:", profileError);
      console.error("Payload enviado para profiles:", createUserPayload);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({
        error: profileError?.message || "Erro ao gravar perfil do usuário",
        details: profileError || null,
      });
    }

    return res.json({ success: true, id: userId });
  } catch (err) {
    console.error("Erro inesperado em /create-user:", err);
    return res.status(isPermissionError(err) ? 403 : 500).json({ error: buildApiErrorMessage(err) });
  }
});

const authenticateRequest = async (req, res, { requireAdmin = false } = {}) => {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Token de acesso obrigatório" });
    return null;
  }

  const cachedAuth = getAuthCache(token);
  if (cachedAuth?.user?.id) {
    logInfo("auth_cache_hit", { userId: cachedAuth.user.id, requireAdmin });

    const cachedRole = String(cachedAuth.profile?.role || "").toLowerCase();
    const cachedStatusAcesso = String(cachedAuth.profile?.status_acesso || "").toLowerCase();
    if (cachedRole !== "admin" && cachedStatusAcesso === "bloqueado") {
      res.status(403).json({ error: "Conta inativa" });
      return null;
    }

    if (requireAdmin && cachedAuth.profile?.role !== "admin") {
      res.status(403).json({ error: "Sem permissão" });
      return null;
    }

    return {
      userId: cachedAuth.user.id,
      profile: cachedAuth.profile || null,
      user: cachedAuth.user,
    };
  }

  logInfo("auth_cache_miss", { requireAdmin });

  let requesterData;
  let requesterError;
  try {
    const authResponse = await supabase.auth.getUser(token);
    requesterData = authResponse.data;
    requesterError = authResponse.error;
  } catch (err) {
    if (isSupabaseTemporaryFailure(err)) {
      logWarn("auth_profile_fetch_error", {
        stage: "auth.getUser",
        message: err?.message,
        code: err?.code,
      });
      sendSupabaseUnavailable(res);
      return null;
    }

    throw err;
  }

  if (isSupabaseTemporaryFailure(requesterError)) {
    logWarn("auth_profile_fetch_error", {
      stage: "auth.getUser",
      message: requesterError?.message,
      code: requesterError?.code,
    });
    sendSupabaseUnavailable(res);
    return null;
  }

  if (requesterError || !requesterData?.user?.id) {
    res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
    return null;
  }

  const requesterId = requesterData.user.id;
  try {
    const { data: requesterProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role, billing_status, affiliate_id, status_acesso")
      .eq("id", requesterId)
      .maybeSingle();

    if (isSupabaseTemporaryFailure(profileError)) {
      logWarn("auth_profile_fetch_error", {
        stage: "profiles.select",
        message: profileError?.message,
        code: profileError?.code,
      });
      sendSupabaseUnavailable(res);
      return null;
    }

    if (profileError && profileError.code !== "42P01") {
      throw profileError;
    }

    const requesterRole = String(requesterProfile?.role || "").toLowerCase();
    const requesterStatusAcesso = String(requesterProfile?.status_acesso || "").toLowerCase();
    if (requesterRole !== "admin" && requesterStatusAcesso === "bloqueado") {
      res.status(403).json({ error: "Conta inativa" });
      return null;
    }

    if (requireAdmin && requesterProfile?.role !== "admin") {
      res.status(403).json({ error: "Sem permissão" });
      return null;
    }

    setAuthCache(token, {
      user: requesterData.user,
      profile: requesterProfile || null,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });

    return { userId: requesterId, profile: requesterProfile || null, user: requesterData.user };
  } catch (err) {
    if (isSupabaseTemporaryFailure(err)) {
      logWarn("auth_profile_fetch_error", {
        stage: "profiles.select",
        message: err?.message,
        code: err?.code,
      });
      sendSupabaseUnavailable(res);
      return null;
    }

    logError("auth_profile_fetch_error", { message: err?.message, code: err?.code });
    res.status(500).json({ error: "Erro interno no servidor" });
    return null;
  }
};

app.post("/transactions", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res);
    if (!authData) return;

    const { type, amount, description, date } = req.body;

    let transactionDate;

    if (!date) {
      transactionDate = new Date();
    } else {
      const parsed = new Date(date);

      if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
        transactionDate = new Date();
      } else {
        transactionDate = parsed;
      }
    }

    const formattedDate = transactionDate.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: authData.userId,
          type,
          amount,
          description,
          date: formattedDate,
        },
      ])
      .select();

    if (error) {
      console.error("Erro ao salvar transação:", error);
      return res.status(500).json({ error: "Erro ao salvar transação" });
    }

    return res.json(data?.[0] || null);
  } catch (err) {
    console.error("Erro geral:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res);
    if (!authData) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", authData.userId)
      .order("date", { ascending: false });

    if (error) {
      console.error("Erro ao buscar transações:", error);
      return res.status(500).json({ error: "Erro ao buscar" });
    }

    return res.json(data || []);
  } catch (err) {
    console.error("Erro geral:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

const fetchProfileWithBilling = async (userId) => {
  const { data: profileAuth, error: profileAuthError } = await supabase
    .from("profiles")
    .select(
      "id, name, email, role, is_affiliate, affiliate_id, affiliate_code, billing_status, subscription_status, status_acesso, trial_end_at, trial_start_at, trial_status"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileAuthError && profileAuthError.code !== "PGRST116" && profileAuthError.code !== "42P01") {
    throw profileAuthError;
  }

  if (profileAuth) return profileAuth;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, name, email, role, is_affiliate, affiliate_id, affiliate_code, billing_status, subscription_status, status_acesso, trial_end_at, trial_start_at, trial_status"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116" && profileError.code !== "42P01") {
    throw profileError;
  }

  return profileData || null;
};

app.get("/auth/profile", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const profile = await fetchProfileWithBilling(authData.userId);

    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado" });
    }

    const extraTrialFields = {};
    if (profile?.trial_end_at !== undefined) extraTrialFields.trial_end_at = profile.trial_end_at;
    if (profile?.trial_start_at !== undefined) {
      extraTrialFields.trial_start_at = profile.trial_start_at;
    }
    if (profile?.trial_status !== undefined) extraTrialFields.trial_status = profile.trial_status;

    return res.json({ profile, ...extraTrialFields });
  } catch (err) {
    if (isSupabaseTemporaryFailure(err)) {
      return sendSupabaseUnavailable(res);
    }

    console.error("Erro inesperado em GET /auth/profile:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterId = authData.userId;
    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const appendBodyAndGoalsWithLatestWeight = async (baseUsers) => {
      const users = Array.isArray(baseUsers) ? baseUsers : [];
      if (!users.length) return [];

      const userIds = users
        .map((user) => user?.id)
        .filter(Boolean);

      if (!userIds.length) return users;

      const { data: diaryProfiles, error: diaryProfilesError } = await supabase
        .from("food_diary_profile")
        .select(
          "user_id, weight, goal_weight, height_cm, objective, calorie_goal, protein_goal, water_goal_l, age, sex"
        )
        .in("user_id", userIds);

      if (diaryProfilesError) throw diaryProfilesError;

      const diaryByUser = new Map(
        (diaryProfiles || [])
          .filter((row) => row?.user_id)
          .map((row) => [row.user_id, row])
      );

      const { data: weightRows, error: weightError } = await supabase
        .from("food_weight_history")
        .select("user_id, entry_date, weight_kg, recorded_at")
        .in("user_id", userIds)
        .order("recorded_at", { ascending: false })
        .order("entry_date", { ascending: false });

      if (weightError) throw weightError;

      const latestByUser = new Map();
      const previousByUser = new Map();

      for (const row of weightRows || []) {
        if (!row?.user_id) continue;
        if (!latestByUser.has(row.user_id)) {
          latestByUser.set(row.user_id, row);
          continue;
        }
        if (!previousByUser.has(row.user_id)) {
          previousByUser.set(row.user_id, row);
        }
      }

      return users.map((user) => {
        const diary = diaryByUser.get(user.id);
        const latest = latestByUser.get(user.id);
        const previous = previousByUser.get(user.id);
        const latestWeight =
          latest?.weight_kg != null
            ? Number(latest.weight_kg)
            : (diary?.weight != null
              ? Number(diary.weight)
              : (user?.weight != null ? Number(user.weight) : null));
        const previousWeight = previous?.weight_kg != null ? Number(previous.weight_kg) : null;
        const variationKg =
          Number.isFinite(latestWeight) && Number.isFinite(previousWeight)
            ? Number((latestWeight - previousWeight).toFixed(2))
            : null;

        return {
          ...user,
          weight: diary?.weight ?? null,
          goal_weight: diary?.goal_weight ?? user?.goal_weight ?? user?.weight_goal ?? null,
          height_cm: diary?.height_cm ?? null,
          objective: diary?.objective ?? user?.objective ?? null,
          age: diary?.age ?? null,
          sex: diary?.sex ?? null,
          calorie_goal: diary?.calorie_goal ?? user?.calorie_goal ?? null,
          protein_goal: diary?.protein_goal ?? user?.protein_goal ?? null,
          water_goal_l: diary?.water_goal_l ?? user?.water_goal_l ?? null,
          current_weight: latestWeight,
          latest_weight_kg: latestWeight,
          latest_weight_date: latest?.entry_date || null,
          weight_variation_kg: variationKg,
        };
      });
    };

    if (requesterRole === "admin") {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) throw error;
      const usersWithBodyAndGoals = await appendBodyAndGoalsWithLatestWeight(data || []);
      return res.json(usersWithBodyAndGoals);
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", requesterId);

    if (error) throw error;
    const usersWithBodyAndGoals = await appendBodyAndGoalsWithLatestWeight(data || []);
    return res.json(usersWithBodyAndGoals);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.put("/users/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterId = authData.userId;
    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const targetUserId = req.params.id;

    if (requesterRole !== "admin" && requesterId !== targetUserId) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const { name, whatsapp } = req.body || {};
    const updatePayload = {};
    if (typeof name === "string") updatePayload.name = name.trim();
    if (typeof whatsapp === "string") updatePayload.whatsapp = whatsapp.trim();

    if (!Object.keys(updatePayload).length) {
      return res.status(400).json({ error: "Nenhum campo válido para atualização." });
    }

    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", targetUserId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.put("/users/:id/password", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterId = authData.userId;
    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const targetUserId = req.params.id;
    const { password } = req.body || {};

    if (requesterRole !== "admin" && requesterId !== targetUserId) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    if (typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ error: "Senha inválida" });
    }

    const { error } = await supabase.auth.admin.updateUserById(
      targetUserId,
      { password: password.trim() },
    );

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar senha:", err);
    return res.status(500).json({ error: "Erro ao atualizar senha" });
  }
});

app.put("/users/:id/email", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterId = authData.userId;
    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const targetUserId = req.params.id;
    const { email } = req.body || {};

    if (requesterRole !== "admin" && requesterId !== targetUserId) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email inválido" });
    }

    const [authResult, profileResult] = await Promise.all([
      supabase.auth.admin.updateUserById(targetUserId, { email: normalizedEmail }),
      supabase
        .from("profiles")
        .update({ email: normalizedEmail, username: normalizedEmail })
        .eq("id", targetUserId),
    ]);

    if (authResult.error) throw authResult.error;
    if (profileResult.error) throw profileResult.error;

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar email:", err);
    return res.status(500).json({ error: "Erro ao atualizar email" });
  }
});

app.get("/admin/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    await enforceOwnerProtectionByEmail();

    let query = supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (req.query.affiliate_id) {
      query = query.eq("affiliate_id", req.query.affiliate_id);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error("Erro ao listar usuários em GET /admin/users:", error);
      return res.status(500).json({ error: buildApiErrorMessage(error) });
    }

    const normalizedUsers = (users || []).map((user) => {
      const normalizedUser = {
        ...user,
        subscription_status: isOwnerEmail(user.email) ? "active" : user.subscription_status,
        billing_status: isOwnerEmail(user.email) ? "paid" : user.billing_status,
        is_affiliate: isOwnerEmail(user.email) ? true : user.is_affiliate,
      };
      return {
        ...normalizedUser,
        financial_status: getFinancialStatus(normalizedUser),
      };
    });

    return res.json(normalizedUsers);
  } catch (err) {
    console.error("Erro inesperado em GET /admin/users:", err);
    return res.status(500).json({ error: "Erro interno ao listar usuários." });
  }
});

app.get("/supervisor/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const requesterId = authData?.userId;

    if (requesterRole !== "admin" && requesterRole !== "affiliate") {
      return res.status(403).json({ error: "Sem permissão" });
    }

    let query = supabase
      .from("profiles")
      .select("id, name, email, whatsapp, billing_status, subscription_status, plan_type, affiliate_id")
      .order("created_at", { ascending: false });

    if (requesterRole !== "admin") {
      query = query.eq("affiliate_id", requesterId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erro ao listar usuários em GET /supervisor/users:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error("Erro inesperado em GET /supervisor/users:", err);
    return res.status(500).json({ error: "Erro interno ao listar usuários do supervisor." });
  }
});

app.get("/supervisor/users/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const requesterId = authData?.userId;
    const { id: targetUserId } = req.params;

    if (!targetUserId) {
      return res.status(400).json({ error: "id é obrigatório" });
    }

    if (requesterRole !== "admin" && requesterRole !== "affiliate") {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, whatsapp, billing_status, subscription_status, plan_type, affiliate_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError) {
      console.error("Erro ao buscar perfil em GET /supervisor/users/:id:", profileError);
      return res.status(400).json({ error: profileError.message });
    }

    if (!profile) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (requesterRole !== "admin" && profile.affiliate_id !== requesterId) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const [
      workoutSessionsResult,
      workoutScheduleResult,
      workoutRoutinesResult,
      foodLogsResult,
      weightHistoryResult,
    ] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("workout_schedule")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("workout_routines")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("food_diary_entries")
        .select("*")
        .eq("user_id", targetUserId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("food_weight_history")
        .select("*")
        .eq("user_id", targetUserId)
        .order("entry_date", { ascending: false })
        .limit(60),
    ]);

    if (workoutSessionsResult.error) {
      console.error("Erro em workout_sessions do supervisor:", workoutSessionsResult.error);
    }
    if (workoutScheduleResult.error) {
      console.error("Erro em workout_schedule do supervisor:", workoutScheduleResult.error);
    }
    if (workoutRoutinesResult.error) {
      console.error("Erro em workout_routines do supervisor:", workoutRoutinesResult.error);
    }
    if (foodLogsResult.error) {
      console.error("Erro em food_diary_entries do supervisor:", foodLogsResult.error);
    }
    if (weightHistoryResult.error) {
      console.error("Erro em food_weight_history do supervisor:", weightHistoryResult.error);
    }

    return res.json({
      profile,
      workouts: workoutSessionsResult.data || [],
      workout_schedule: workoutScheduleResult.data || [],
      workout_routines: workoutRoutinesResult.data || [],
      food_logs: foodLogsResult.data || [],
      weight_history: weightHistoryResult.data || [],
    });
  } catch (err) {
    console.error("Erro inesperado em GET /supervisor/users/:id:", err);
    return res.status(500).json({ error: "Erro interno ao buscar detalhes do usuário." });
  }
});

app.get("/supervisor/user-details/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const requesterId = authData?.userId;
    const { id: targetUserId } = req.params;

    if (!targetUserId) {
      return res.status(400).json({ error: "id é obrigatório" });
    }

    if (requesterRole !== "admin" && requesterRole !== "affiliate") {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, affiliate_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError) {
      console.error("Erro ao validar perfil em GET /supervisor/user-details/:id:", profileError);
      return res.status(400).json({ error: profileError.message });
    }

    if (!profile) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (requesterRole !== "admin" && profile.affiliate_id !== requesterId) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const filter = getSupervisorFoodFilter(req.query?.filter);
    const { start, end } = getLocalDateRange(filter);

    console.log('Filtro:', filter);
    console.log('User ID:', targetUserId);
    console.log('Start:', start);
    console.log('End:', end);

    const [workoutsResult, foodLogsResult, weightHistoryResult, routinesResult] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("performed_at", { ascending: false }),
      supabase
        .from("food_diary_entries")
        .select("*")
        .eq("user_id", targetUserId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("food_weight_history")
        .select("*")
        .eq("user_id", targetUserId)
        .order("entry_date", { ascending: false })
        .order("recorded_at", { ascending: false })
        .limit(100),
      supabase
        .from("workout_routines")
        .select("id, name, muscle_groups, exercises_by_group, muscle_config")
        .eq("user_id", targetUserId),
    ]);

    if (workoutsResult.error) {
      console.error("Erro em workout_sessions do supervisor user-details:", workoutsResult.error);
    }
    console.log("SESSOES ENCONTRADAS:", workoutsResult.data);
    if (foodLogsResult.error) {
      console.error("Erro em food_diary_entries do supervisor user-details:", foodLogsResult.error);
    }
    if (weightHistoryResult.error) {
      console.error("Erro em food_weight_history do supervisor user-details:", weightHistoryResult.error);
    }
    if (routinesResult.error) {
      console.error("Erro em workout_routines do supervisor user-details:", routinesResult.error);
    }

    const routinesById = new Map(
      (routinesResult.data || []).map((routine) => [String(routine.id), routine])
    );

    const routinesByName = new Map(
      (routinesResult.data || []).map((routine) => [String(routine.name || "").trim().toLowerCase(), routine])
    );

    const treinosEnriquecidos = (workoutsResult.data || []).map((session) => {
      const directExercises =
        session?.exercises_by_group && typeof session.exercises_by_group === "object"
          ? session.exercises_by_group
          : {};

      const directConfig = Array.isArray(session?.muscle_config)
        ? session.muscle_config
        : [];

      const matchedRoutine =
        (session?.template_id && routinesById.get(String(session.template_id))) ||
        routinesByName.get(String(session?.workout_name || "").trim().toLowerCase()) ||
        null;

      const fallbackExercises =
        matchedRoutine?.exercises_by_group && typeof matchedRoutine.exercises_by_group === "object"
          ? matchedRoutine.exercises_by_group
          : {};

      const fallbackConfig = Array.isArray(matchedRoutine?.muscle_config)
        ? matchedRoutine.muscle_config
        : [];

      const resolvedExercises = hasExercisesByGroupContent(directExercises)
        ? directExercises
        : hasExercisesByGroupContent(fallbackExercises)
          ? fallbackExercises
          : {};

      return {
        ...session,
        name: session?.workout_name || "",
        muscle_group: session?.muscle_groups || "",
        groups_musculares: session?.muscle_groups || "",
        exercises_by_group: resolvedExercises,
        exercicios_por_grupo: resolvedExercises,
        muscle_config: directConfig.length > 0 ? directConfig : fallbackConfig,
      };
    });

    return res.json({
      treinos: treinosEnriquecidos,
      alimentacao: foodLogsResult.data || [],
      peso: weightHistoryResult.data || [],
    });
  } catch (err) {
    console.error("Erro inesperado em GET /supervisor/user-details/:id:", err);
    return res.status(500).json({
      treinos: [],
      alimentacao: [],
      peso: [],
    });
  }
});

const getSupervisorFoodFilter = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'today' || normalized === 'hoje') return 'today';
  if (normalized === 'week' || normalized === 'semana') return 'week';
  if (normalized === 'month' || normalized === 'mes' || normalized === 'mês') return 'month';
  return 'week';
};

const getLocalDateRange = (filter) => {
  const now = new Date();

  const start = new Date(now);
  const end = new Date(now);

  if (filter === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  if (filter === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day;
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);

    end.setHours(23, 59, 59, 999);
  }

  if (filter === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

const FINANCE_SELECT_COLUMNS = [
  "id",
  "name",
  "email",
  "username",
  "whatsapp",
  "role",
  "plan_type",
  "affiliate_id",
  "affiliate_code",
  "billing_status",
  "billing_due_day",
  "billing_last_paid_at",
  "billing_next_due",
  "subscription_status",
  "last_paid_at",
  "due_day",
  "trial_start_at",
  "trial_end_at",
  "trial_status",
  "created_at",
].join(", ");

const listFinanceUsersBase = async () => {
  const { data, error } = await supabase.from("profiles").select(FINANCE_SELECT_COLUMNS);
  if (error) throw error;
  return data || [];
};

const normalizeFinanceUser = (user, affiliateNameById, today = new Date()) => {
  const financeStatus = getFinanceStatus(user, today);
  const planMonthlyValue = getPlanMonthlyValue(user?.plan_type);
  const dueDay = normalizeDueDay(user);
  const nextDue = user?.billing_next_due || computeNextDueDate(dueDay, today);

  return {
    id: user.id,
    name: user.name || user.username || "Sem nome",
    email: user.email || user.username || "",
    whatsapp: user.whatsapp || "",
    plan_type: user.plan_type || USER_PLAN_TYPES.NORMAL,
    affiliate_id: user.affiliate_id || null,
    affiliate_code: user.affiliate_code || null,
    affiliate_name: affiliateNameById?.[user.affiliate_id] || null,
    billing_status: user.billing_status || "pending",
    billing_due_day: dueDay,
    billing_last_paid_at: user.billing_last_paid_at || user.last_paid_at || null,
    billing_next_date: nextDue,
    billing_next_due: nextDue,
    subscription_status: user.subscription_status || "active",
    access: user.subscription_status || "active",
    last_paid_at: user.last_paid_at || user.billing_last_paid_at || null,
    finance_status: financeStatus,
    status_financeiro: financeStatus,
    status_acesso: user.subscription_status || "active",
    plan_monthly_value: planMonthlyValue,
    estimated_monthly_value: planMonthlyValue,
    overdue_days: getOverdueDays(user, today),
    is_trial_active: isTrialActive(user, today),
    trial_status: user.trial_status || null,
  };
};

app.get("/admin/finance/summary", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const today = new Date();
    const monthStart = startOfCurrentMonth(today);
    const users = await listFinanceUsersBase();
    const operationalUsers = users.filter((user) => isFinanceOperationalUser(user));
    const billableUsers = operationalUsers.filter((user) => !isTrialActive(user, today));
    const normalized = billableUsers.map((user) => normalizeFinanceUser(user, {}, today));

    const totalReceivedMonth = normalized.reduce((sum, user) => {
      const lastPayment = parseDateSafe(user.last_paid_at);
      if (!lastPayment || lastPayment < monthStart) return sum;
      return sum + user.plan_monthly_value;
    }, 0);

    const totalPending = normalized
      .filter((user) => user.finance_status === "pending" || user.finance_status === "due_today")
      .reduce((sum, user) => sum + user.plan_monthly_value, 0);
    const totalOverdue = normalized
      .filter((user) => user.finance_status === "overdue")
      .reduce((sum, user) => sum + user.plan_monthly_value, 0);

    return res.json({
      totalReceivedMonth,
      totalPending,
      totalOverdue,
      paidUsers: normalized.filter((user) => user.finance_status === "paid").length,
      usersDueToday: normalized.filter((user) => user.finance_status === "due_today").length,
      usersOverdue: normalized.filter((user) => user.finance_status === "overdue").length,
      usersBlocked: normalized.filter((user) => user.status_acesso === "inactive").length,
      estimatedMonthlyRevenue: normalized.reduce((sum, user) => sum + user.plan_monthly_value, 0),
    });
  } catch (err) {
    console.error("Erro inesperado em GET /admin/finance/summary:", err);
    return res.status(500).json({ error: "Erro ao carregar resumo financeiro." });
  }
});

app.get("/admin/finance/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { search = "", status = "todos", plan = "", affiliateId = "", sort = "name" } = req.query || {};
    const today = new Date();
    const users = await listFinanceUsersBase();
    const { data: affiliates } = await supabase.from("affiliates").select("id,name,code");
    const affiliateNameById = (affiliates || []).reduce((acc, affiliate) => {
      acc[affiliate.id] = affiliate.name || affiliate.code || "Afiliado";
      return acc;
    }, {});

    let normalized = users
      .filter((user) => isFinanceOperationalUser(user))
      .map((user) => normalizeFinanceUser(user, affiliateNameById, today));

    const normalizedSearch = String(search || "").trim().toLowerCase();
    if (normalizedSearch) {
      normalized = normalized.filter((user) =>
        [user.name, user.email, user.whatsapp]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(normalizedSearch)),
      );
    }

    if (plan) {
      normalized = normalized.filter(
        (user) => String(user.plan_type || "").toLowerCase() === String(plan).toLowerCase(),
      );
    }

    if (affiliateId) {
      normalized = normalized.filter((user) => String(user.affiliate_id || "") === String(affiliateId));
    }

    const statusFilter = String(status || "todos").toLowerCase();
    if (statusFilter !== "todos") {
      normalized = normalized.filter((user) => {
        if (statusFilter === "pagos") return user.finance_status === "paid";
        if (statusFilter === "pendentes") return user.finance_status === "pending";
        if (statusFilter === "vencendo hoje") return user.finance_status === "due_today";
        if (statusFilter === "atrasados") return user.finance_status === "overdue";
        if (statusFilter === "bloqueados") return user.status_acesso === "inactive";
        if (statusFilter === "ativos") return user.status_acesso === "active";
        if (statusFilter === "inativos") return user.status_acesso === "inactive";
        return true;
      });
    }

    const sortBy = String(sort || "name").toLowerCase();
    normalized.sort((a, b) => {
      if (sortBy === "due_date") return String(a.billing_next_date).localeCompare(String(b.billing_next_date));
      if (sortBy === "overdue") return (b.overdue_days || 0) - (a.overdue_days || 0);
      if (sortBy === "last_payment")
        return String(b.last_paid_at || "").localeCompare(String(a.last_paid_at || ""));
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return res.json({ users: normalized });
  } catch (err) {
    console.error("Erro inesperado em GET /admin/finance/users:", err);
    return res.status(500).json({ error: "Erro ao carregar usuários do financeiro." });
  }
});

app.get("/admin/finance/reports", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { data: users, error } = await supabase
      .from("profiles")
      .select("affiliate_id, subscription_status, billing_next_due");

    if (error) {
      console.error("Erro ao carregar dados em GET /admin/finance/reports:", error);
      return res.status(500).json({ error: "Erro ao carregar relatórios financeiros." });
    }

    const safeUsers = (users || []).filter((user) => isFinanceOperationalUser(user));

    const revenueByAffiliateMap = safeUsers.reduce((acc, user) => {
      const affiliateId = user?.affiliate_id || null;
      const key = affiliateId || "__sem_afiliado__";
      if (!acc[key]) {
        acc[key] = {
          affiliate_id: affiliateId,
          total_users: 0,
          total_revenue: 0,
        };
      }
      acc[key].total_users += 1;
      if (String(user?.subscription_status || "").toLowerCase() === "active") {
        acc[key].total_revenue += getPlanMonthlyValue(user?.plan_type);
      }
      return acc;
    }, {});

    const usersStatus = safeUsers.reduce(
      (acc, user) => {
        if (String(user?.subscription_status || "").toLowerCase() === "active") {
          acc.paid += 1;
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      { paid: 0, pending: 0 },
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueCount = safeUsers.filter((user) => {
      if (String(user?.subscription_status || "").toLowerCase() === "active") return false;
      const nextBillingDate = parseDateSafe(user?.billing_next_due);
      if (!nextBillingDate) return false;
      nextBillingDate.setHours(0, 0, 0, 0);
      return nextBillingDate < today;
    }).length;

    const monthlyRevenueMap = safeUsers.reduce((acc, user) => {
      if (String(user?.subscription_status || "").toLowerCase() !== "active") return acc;
      const nextBillingDate = parseDateSafe(user?.billing_next_due);
      if (!nextBillingDate) return acc;
      const monthDate = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth(), 1);
      const monthKey = formatDateOnly(monthDate);
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthKey,
          revenue: 0,
        };
      }
      acc[monthKey].revenue += getPlanMonthlyValue(user?.plan_type);
      return acc;
    }, {});

    const monthlyRevenue = Object.values(monthlyRevenueMap).sort((a, b) =>
      String(a.month).localeCompare(String(b.month)),
    );

    return res.json({
      revenueByAffiliate: Object.values(revenueByAffiliateMap),
      usersStatus,
      overdueCount,
      monthlyRevenue,
    });
  } catch (err) {
    console.error("Erro inesperado em GET /admin/finance/reports:", err);
    return res.status(500).json({ error: "Erro ao carregar relatórios financeiros." });
  }
});

app.post("/admin/users/:id/promote-to-affiliate", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const userId = String(req.params?.id || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "ID do usuário é obrigatório." });
    }

    const { data: user, error: userError } = await supabase
      .from("profiles")
      .select("id, name, username, email, whatsapp, role, is_affiliate, affiliate_code")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error("Erro ao buscar usuário para promoção:", userError);
      return res.status(400).json({ error: userError.message || "Erro ao buscar usuário." });
    }
    if (!user?.id) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Usuário owner/admin não pode ser promovido para afiliado." });
    }
    if (user.is_affiliate === true || user.role === "affiliate") {
      return res.status(400).json({ error: "Usuário já é afiliado." });
    }

    const generateUniqueAffiliateCode = async () => {
      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = `AF${Math.floor(100000 + Math.random() * 900000)}`;

        const [{ data: codeInAffiliates, error: affiliatesCodeError }, { data: codeInProfiles, error: profilesCodeError }] = await Promise.all([
          supabase.from("affiliates").select("id").eq("code", code).maybeSingle(),
          supabase.from("profiles").select("id").eq("affiliate_code", code).maybeSingle(),
        ]);

        if (affiliatesCodeError && affiliatesCodeError.code !== "PGRST116") {
          throw new Error(affiliatesCodeError.message || "Erro ao validar código em afiliados.");
        }
        if (profilesCodeError && profilesCodeError.code !== "PGRST116") {
          throw new Error(profilesCodeError.message || "Erro ao validar código em usuários.");
        }

        if (!codeInAffiliates?.id && !codeInProfiles?.id) {
          return code;
        }
      }

      throw new Error("Não foi possível gerar um código de afiliado único.");
    };

    const affiliateCode = await generateUniqueAffiliateCode();

    const affiliatePayloadBase = {
      code: affiliateCode,
      name: user.name || user.username || user.email,
      email: user.email || user.username || null,
      whatsapp: user.whatsapp || null,
      is_active: true,
      status: "active",
    };

    let affiliateCreated = null;
    let affiliateInsertError = null;

    const insertWithStatus = await supabase
      .from("affiliates")
      .insert(affiliatePayloadBase)
      .select("id, code, name, email, whatsapp, is_active, created_at, status")
      .single();

    affiliateCreated = insertWithStatus.data;
    affiliateInsertError = insertWithStatus.error;

    if (affiliateInsertError && String(affiliateInsertError.message || "").toLowerCase().includes("status")) {
      const { status: ignoredStatus, ...affiliatePayloadWithoutStatus } = affiliatePayloadBase;
      const insertWithoutStatus = await supabase
        .from("affiliates")
        .insert(affiliatePayloadWithoutStatus)
        .select("id, code, name, email, whatsapp, is_active, created_at")
        .single();

      affiliateCreated = insertWithoutStatus.data
        ? { ...insertWithoutStatus.data, status: "active" }
        : null;
      affiliateInsertError = insertWithoutStatus.error;
    }

    if (affiliateInsertError) {
      console.error("Erro ao criar afiliado na tabela affiliates:", affiliateInsertError);
      return res.status(400).json({ error: affiliateInsertError.message || "Erro ao criar afiliado." });
    }

    const updatePayload = {
      is_affiliate: true,
      affiliate_code: affiliateCode,
      affiliate_id: affiliateCreated.id,
      role: "affiliate",
    };

    const { data: updatedProfile, error: updateProfileError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id)
      .select("id, role, is_affiliate, affiliate_code")
      .single();

    if (updateProfileError) {
      console.error("Erro ao atualizar profile após promoção:", updateProfileError);
      return res.status(400).json({ error: updateProfileError.message || "Erro ao atualizar usuário." });
    }
    return res.status(201).json({
      ok: true,
      affiliate: affiliateCreated,
      profile: updatedProfile,
    });
  } catch (err) {
    console.error("Erro inesperado em POST /admin/users/:id/promote-to-affiliate:", err);
    return res.status(500).json({ error: "Erro interno ao promover usuário para afiliado." });
  }
});

const deleteUserFlow = async (userIdToDelete, authUserId) => {
  const buildDeleteError = (status, message, cause) => {
    const error = new Error(message);
    error.status = status;
    if (cause) error.cause = cause;
    return error;
  };

  console.log("Iniciando exclusão do usuário:", userIdToDelete);

  const deleteByUserId = async (tableName) => {
    const { error } = await supabase.from(tableName).delete().eq("user_id", userIdToDelete);
    if (error) {
      console.error(`Erro ao limpar dados em ${tableName}:`, error);
      throw error;
    }
  };

  const { data: targetUser, error: targetUserError } = await supabase
    .from("profiles")
    .select("id, is_super_admin, name, username, role, email")
    .eq("id", userIdToDelete)
    .single();

  if (targetUserError) {
    console.error("Erro ao buscar usuário alvo para exclusão:", targetUserError);
    if (targetUserError.code === "PGRST116") {
      throw buildDeleteError(404, "Usuário não encontrado.", targetUserError);
    }
    throw buildDeleteError(500, "Falha ao buscar usuário para exclusão.", targetUserError);
  }

  if (!targetUser) {
    throw buildDeleteError(404, "Usuário não encontrado.");
  }

  if (isOwnerEmail(targetUser.email)) {
    throw buildDeleteError(403, "Usuário principal não pode ser removido");
  }

  console.log("Usuário encontrado para exclusão:", targetUser);

  const { data: currentUser, error: currentUserError } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", authUserId)
    .single();

  if (currentUserError) {
    console.error("Erro ao buscar solicitante da exclusão:", currentUserError);
    throw buildDeleteError(500, "Falha ao validar permissões para exclusão.", currentUserError);
  }

  if (targetUser.is_super_admin === true) {
    console.warn("Tentativa de excluir super admin bloqueada:", userIdToDelete);
    throw buildDeleteError(403, "Não é permitido excluir um super admin.");
  }

  if (targetUser?.role === "admin" && currentUser?.username !== SUPER_ADMIN_EMAIL) {
    throw buildDeleteError(403, "Não é permitido excluir usuário admin.");
  }

  // 1) Limpa dados relacionados antes de remover o usuário no Auth.
  await deleteByUserId("workout_routines");
  await deleteByUserId("workout_schedule");
  await deleteByUserId("workout_sessions");
  await deleteByUserId("workout_reminders");
  await deleteByUserId("workout_schedule_reminder_logs");
  await deleteByUserId("events");
  await deleteByUserId("food_diary_entries");
  await deleteByUserId("hydration_logs");
  await deleteByUserId("transactions");

  // 2) Remove afiliado relacionado pelo email (se existir).
  if (targetUser?.email) {
    const { error: affiliateError } = await supabase
      .from("affiliates")
      .delete()
      .eq("email", targetUser.email);

    if (affiliateError) {
      console.error("Erro ao deletar afiliado:", affiliateError);
    }
  }

  // 3) Remove profile (se existir).
  const { error: deleteProfileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userIdToDelete);
  if (deleteProfileError) {
    console.error("Erro ao excluir profile do usuário:", deleteProfileError);
    throw buildDeleteError(500, "Falha ao excluir profile do usuário.", deleteProfileError);
  }

  // 4) Por fim, remove no Auth.
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userIdToDelete);
  if (deleteAuthError) {
    console.error("Erro ao excluir usuário no auth:", deleteAuthError);
    throw buildDeleteError(500, "Falha ao excluir usuário no auth.", deleteAuthError);
  }

  console.log("Usuário excluído com sucesso:", userIdToDelete);

  return { success: true };
};

app.delete("/delete-user/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "id é obrigatório" });

    await deleteUserFlow(userId, authData.userId);

    return res.json({
      success: true,
      message: "Usuário excluído com sucesso.",
    });
  } catch (err) {
    console.error("Erro geral ao deletar usuário:", err);
    return res.status(err?.status || 500).json({
      error: err.message || "Erro ao deletar usuário.",
    });
  }
});

app.delete("/admin/users/:userId", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId é obrigatório" });

    await deleteUserFlow(userId, authData.userId);

    return res.json({
      success: true,
      message: "Usuário excluído com sucesso.",
    });
  } catch (err) {
    console.error("Erro geral ao deletar usuário:", err);
    return res.status(err?.status || 500).json({
      error: err.message || "Erro ao deletar usuário.",
    });
  }
});

app.post("/admin/update-user-password", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { userId, newPassword } = req.body || {};

    if (!userId || !newPassword) {
      return res.status(400).json({ error: "Dados obrigatórios" });
    }

    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword },
    );

    if (error) {
      console.error("Erro Supabase:", error);
      return res.status(500).json({ error: "Erro ao atualizar senha" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro interno:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.put("/admin/users/:userId", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const { error: protectedUserError, isOwner } = await enforceOwnerProtectionById(userId);
    if (protectedUserError) {
      return res.status(400).json({ error: protectedUserError.message || "Erro ao validar usuário." });
    }

    const { name, username, email, whatsapp, role, affiliate_id, plan_type, password } = req.body || {};

    const incomingEmail = typeof email === "string" ? email.trim() : "";
    const trimmedUsername = typeof username === "string" ? username.trim() : incomingEmail;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedPassword =
      typeof password === "string" && password.trim().length ? password.trim() : "";

    if (!trimmedUsername) {
      return res.status(400).json({ error: "username (e-mail) é obrigatório" });
    }

    try {
      const updateProfilePayload = {};
      if (typeof name === "string") updateProfilePayload.name = name;
      if (trimmedUsername) {
        updateProfilePayload.username = trimmedUsername;
        updateProfilePayload.email = trimmedUsername;
      }
      if (typeof whatsapp === "string") updateProfilePayload.whatsapp = whatsapp;
      if (typeof role === "string") updateProfilePayload.role = role;
      if (affiliate_id !== undefined) updateProfilePayload.affiliate_id = affiliate_id || null;
      if (plan_type !== undefined) updateProfilePayload.plan_type = plan_type || null;
      if (isOwner) Object.assign(updateProfilePayload, getOwnerProtectionUpdatePayload(), { is_affiliate: true });
      delete updateProfilePayload.affiliate_code;

      const { error: upProfileErr } = await supabase
        .from("profiles")
        .update(updateProfilePayload)
        .eq("id", userId);

      if (upProfileErr) {
        console.error("Erro ao atualizar profiles:", upProfileErr);
        return res.status(isPermissionError(upProfileErr) ? 403 : 500).json({
          error: buildApiErrorMessage(upProfileErr),
        });
      }
    } catch (tableError) {
      console.error("Erro inesperado ao atualizar profiles:", tableError);
      return res.status(isPermissionError(tableError) ? 403 : 500).json({
        error: buildApiErrorMessage(tableError),
      });
    }

    const authUpdatePayload = { email: trimmedUsername };

    if (trimmedName) {
      authUpdatePayload.user_metadata = {
        display_name: trimmedName,
        full_name: trimmedName,
      };
    }

    if (trimmedPassword) {
      authUpdatePayload.password = trimmedPassword;
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      userId,
      authUpdatePayload,
    );

    if (authUpdateError) {
      console.error("Erro ao atualizar usuário no Auth (ignorado):", authUpdateError);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro inesperado em PUT /admin/users/:userId:", err);
    return res.status(isPermissionError(err) ? 403 : 500).json({ error: buildApiErrorMessage(err) });
  }
});

app.patch("/admin/users/:userId", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const { error: protectedUserError, isOwner } = await enforceOwnerProtectionById(userId);
    if (protectedUserError) {
      return res.status(400).json({ error: protectedUserError.message || "Erro ao validar usuário." });
    }

    const { name, email, whatsapp, role, affiliate_id, plan_type } = req.body || {};
    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const affiliateId =
      typeof affiliate_id === "string" && affiliate_id.trim().length ? affiliate_id.trim() : null;
    const normalizedPlanType = String(plan_type || "").trim().toLowerCase();

    if (!trimmedName) {
      return res.status(400).json({ error: "name é obrigatório" });
    }

    if (!trimmedEmail) {
      return res.status(400).json({ error: "email é obrigatório" });
    }

    if (!ALLOWED_USER_PLAN_TYPES.has(normalizedPlanType)) {
      return res.status(400).json({
        error: "plan_type obrigatório e deve ser trial, normal ou promo.",
      });
    }

    const { affiliate, error: affiliateResolveError } = await resolveAffiliate(affiliateId);
    if (affiliateResolveError) {
      return res.status(400).json({ error: affiliateResolveError });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const { planStartDate, planEndDate } = computePlanDates(normalizedPlanType);
    const trialStartIso = normalizedPlanType === USER_PLAN_TYPES.TRIAL ? nowIso : null;
    const trialEndIso =
      normalizedPlanType === USER_PLAN_TYPES.TRIAL && planEndDate
        ? `${planEndDate}T00:00:00.000Z`
        : null;

    const updateData = {
      name: trimmedName,
      email: trimmedEmail,
      username: trimmedEmail,
      whatsapp: typeof whatsapp === "string" ? whatsapp : null,
      role: typeof role === "string" ? role : undefined,
      affiliate_id: affiliate.id,
      plan_type: normalizedPlanType,
      plan_start_date: planStartDate,
      plan_end_date: planEndDate,
      trial_start_at: trialStartIso,
      trial_end_at: trialEndIso,
      trial_status: normalizedPlanType === USER_PLAN_TYPES.TRIAL ? "active" : null,
      ...(isOwner ? getOwnerProtectionUpdatePayload() : {}),
      ...(isOwner ? { is_affiliate: true } : {}),
    };

    delete updateData.affiliate_code;

    const { error: upProfileErr } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (upProfileErr) {
      console.error("Erro ao atualizar profiles:", upProfileErr);
      const isDuplicateAffiliateCode =
        upProfileErr?.code === "23505"
        && String(upProfileErr?.message || "").includes("unique_affiliate_code");

      if (isDuplicateAffiliateCode) {
        return res.status(400).json({
          error: "Erro ao atualizar usuário. Código de afiliado duplicado.",
        });
      }

      return res.status(isPermissionError(upProfileErr) ? 403 : 500).json({
        error: buildApiErrorMessage(upProfileErr),
      });
    }

    const { data: existingUser, error: fetchError } =
      await supabase.auth.admin.getUserById(userId);

    if (fetchError) {
      console.warn("Erro ao buscar usuário no Auth:", fetchError.message);
    }

    const emailAtual = existingUser?.user?.email;

    if (trimmedEmail && trimmedEmail !== emailAtual) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        email: trimmedEmail,
      });

      if (authError) {
        console.warn("Erro no Auth ignorado:", authError.message);
      }
    }

    return res.json({
      success: true,
      message: "Usuário atualizado com sucesso",
    });
  } catch (err) {
    console.error("Erro inesperado em PATCH /admin/users/:userId:", err);
    return res.status(isPermissionError(err) ? 403 : 500).json({ error: buildApiErrorMessage(err) });
  }
});

app.patch("/admin/users/:authId/billing", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { authId } = req.params;
    if (!authId) {
      return res.status(400).json({ error: "authId é obrigatório" });
    }

    const { isOwner, error: protectedUserError } = await enforceOwnerProtectionById(authId);
    if (protectedUserError) {
      return res.status(400).json({ error: protectedUserError.message || "Erro ao validar usuário." });
    }

    const {
      billing_status,
      billing_last_paid_at,
      billing_next_due,
      trial_end_at,
      trial_start_at,
      trial_status,
    } = req.body || {};
    const allowedStatus = ["active", "pending", "inactive"];
    const updates = {};
    const authUpdates = {};

    if (billing_status !== undefined) {
      if (!allowedStatus.includes(billing_status)) {
        return res.status(400).json({ error: "billing_status inválido" });
      }
      updates.billing_status = billing_status;
      authUpdates.billing_status = billing_status;
    }

    if (isOwner) {
      updates.billing_status = "paid";
      authUpdates.billing_status = "paid";
      updates.subscription_status = "active";
      authUpdates.subscription_status = "active";
      updates.is_affiliate = true;
      authUpdates.is_affiliate = true;
    }

    if (billing_last_paid_at !== undefined) {
      updates.billing_last_paid_at = billing_last_paid_at || null;
      authUpdates.billing_last_paid_at = billing_last_paid_at || null;
    }

    if (billing_next_due !== undefined) {
      updates.billing_next_due = billing_next_due || null;
      authUpdates.billing_next_due = billing_next_due || null;
    }

    if (trial_end_at !== undefined) {
      authUpdates.trial_end_at = trial_end_at || null;
    }

    if (trial_start_at !== undefined) {
      authUpdates.trial_start_at = trial_start_at || null;
    }

    if (trial_status !== undefined) {
      authUpdates.trial_status = trial_status || null;
    }

    if (!Object.keys(authUpdates).length) {
      return res.status(400).json({ error: "Nenhuma atualização enviada" });
    }

    if (Object.keys(updates).length) {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", authId);

      if (profileErr && profileErr.code !== "PGRST116" && profileErr.code !== "42P01") {
        console.error("Erro ao atualizar billing em profiles:", profileErr);
        return res.status(400).json({ error: profileErr.message });
      }
    }

    const { error: authErr } = await supabase
      .from("profiles")
      .update(authUpdates)
      .eq("id", authId);

    if (authErr && authErr.code !== "42P01") {
      console.error("Erro ao atualizar billing em profiles:", authErr);
      return res.status(400).json({ error: authErr.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro inesperado em PATCH /admin/users/:authId/billing:", err);
    return res.status(500).json({ error: "Erro interno ao atualizar billing." });
  }
});

app.post("/admin/broadcast-whatsapp", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { message, audience = "active" } = req.body || {};

    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória (mínimo 2 caracteres).",
        details: null,
      });
    }

    const cleanMessage = String(message).trim();

    const isMissingColumnError = (error) =>
      error?.code === "42703" ||
      String(error?.message || "")
        .toLowerCase()
        .includes("column") &&
        String(error?.message || "").toLowerCase().includes("does not exist");

    const buildQuery = (columns) => {
      let query = supabase
        .from("profiles")
        .select(columns)
        .not("whatsapp", "is", null);

      if (columns.includes("role")) {
        query = query.neq("role", "admin");
      }

      if (audience === "active" && columns.includes("billing_status")) {
        query = query.eq("billing_status", "active");
      } else if (audience === "trial" && columns.includes("trial_status")) {
        query = query.in("trial_status", ["trial", "active"]);
      }

      return query;
    };

    const queryAttempts = [
      "id, whatsapp, role, billing_status, trial_status, trial_end_at",
      "id, whatsapp, role",
      "id, whatsapp",
    ];

    let data = null;
    let lastError = null;

    for (const columns of queryAttempts) {
      const { data: rows, error } = await buildQuery(columns);
      if (!error) {
        data = rows || [];
        lastError = null;
        break;
      }

      lastError = error;
      if (!isMissingColumnError(error)) {
        break;
      }
    }

    if (lastError) {
      console.error("Erro ao listar usuários para broadcast:", lastError);
      return res.status(400).json({
        ok: false,
        error: lastError.message,
        details: lastError,
      });
    }

    const users = data || [];

    if (users.length === 0) {
      return res.json({
        ok: true,
        totalTargets: 0,
        sent: 0,
        failed: 0,
        failures: [],
      });
    }

    let sent = 0;
    let failed = 0;
    const failures = [];

    for (const user of users) {
      try {
        await sendWhatsAppMessage({
          phone: user.whatsapp,
          message: cleanMessage,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        failures.push({
          id: user.id,
          whatsapp: user.whatsapp,
          error: err?.message || String(err),
        });
      }

      await sleep(350);
    }

    return res.json({
      ok: true,
      totalTargets: users.length,
      sent,
      failed,
      failures,
    });
  } catch (err) {
    console.error("Erro no broadcast:", err);
    return res.status(500).json({
      ok: false,
      error: "Erro interno no servidor",
      details: err?.message || String(err),
    });
  }
});

// =========================
// Afiliados (admin)
// =========================

app.get("/admin/affiliates", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    await ensureOwnerAffiliateExists();

    let { data: affiliates, error } = await supabase
      .from("affiliates")
      .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at, status")
      .order("created_at", { ascending: false });

    if (error && String(error.message || "").toLowerCase().includes("status")) {
      const fallback = await supabase
        .from("affiliates")
        .select("id, code, name, email, whatsapp, pix_key, commission_cents, is_active, created_at")
        .order("created_at", { ascending: false });

      affiliates = Array.isArray(fallback.data)
        ? fallback.data.map((item) => ({ ...item, status: "active" }))
        : [];
      error = fallback.error;
    }

    if (error) {
      if (error.code === "42P01") return res.json([]);
      console.error("Erro ao listar affiliates:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(Array.isArray(affiliates) ? affiliates : []);
  } catch (err) {
    console.error("Erro inesperado em GET /admin/affiliates:", err);
    return res.status(500).json({ error: "Erro interno ao listar afiliados." });
  }
});

app.post("/admin/affiliates", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { name, email, whatsapp, pix_key } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: "Nome e email são obrigatórios"
      });
    }

    const code = "AF" + Math.floor(1000 + Math.random() * 9000);

    const { data, error } = await supabase
      .from("affiliates")
      .insert([
        {
          name,
          email,
          whatsapp: whatsapp || null,
          pix_key: pix_key || null,
          code,
          is_active: true
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("❌ Erro ao criar afiliado:", error);
      return res.status(400).json({
        error: error.message || "Erro ao criar afiliado"
      });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("❌ Erro interno ao criar afiliado:", err);
    return res.status(500).json({
      error: err.message || "Erro interno do servidor"
    });
  }
});

app.put("/admin/affiliates/:id/toggle", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;

    const { data: affiliate, error: fetchError } = await supabase
      .from("affiliates")
      .select("id, is_active")
      .eq("id", id)
      .single();

    if (fetchError || !affiliate) {
      console.error("❌ Erro ao buscar afiliado para alternar status:", fetchError);
      return res.status(404).json({
        error: "Afiliado não encontrado"
      });
    }

    const { data, error: updateError } = await supabase
      .from("affiliates")
      .update({
        is_active: !affiliate.is_active
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Erro ao alternar status do afiliado:", updateError);
      return res.status(400).json({
        error: updateError.message || "Erro ao atualizar status do afiliado"
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Erro interno ao alternar status do afiliado:", err);
    return res.status(500).json({
      error: err.message || "Erro interno do servidor"
    });
  }
});

app.patch("/admin/affiliates/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id é obrigatório" });
    const { name, email, whatsapp, pix_key } = req.body || {};

    const { data, error } = await supabase
      .from("affiliates")
      .update({
        name,
        email,
        whatsapp,
        pix_key
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Erro ao atualizar affiliate:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error("Erro inesperado em PATCH /admin/affiliates/:id:", err);
    return res.status(500).json({ error: "Erro interno ao atualizar afiliado." });
  }
});

app.delete("/admin/affiliates/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id é obrigatório" });

    const { error } = await supabase
      .from("affiliates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir affiliate:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro inesperado em DELETE /admin/affiliates/:id:", err);
    return res.status(500).json({ error: "Erro interno ao excluir afiliado." });
  }
});

app.get("/admin/affiliates/:id/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id é obrigatório" });

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, name, username, email, whatsapp, subscription_status, billing_status, affiliate_id, affiliate_code, created_at"
      )
      .eq("affiliate_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao listar usuários do afiliado:", error);
      return res.status(400).json({ error: error.message });
    }

    const normalizedUsers = (data || []).map((user) => {
      const raw = (user.subscription_status || user.billing_status || "").toLowerCase();
      const normalizedStatus = raw === "inactive" ? "inactive" : "active";

      return {
        ...user,
        is_active: normalizedStatus === "active",
      };
    });

    return res.json({ users: normalizedUsers });
  } catch (err) {
    console.error("Erro inesperado em GET /admin/affiliates/:id/users:", err);
    return res.status(500).json({ error: "Erro interno ao listar usuários do afiliado." });
  }
});

// =========================
// Afiliados (público autenticado)
// =========================

app.post("/public/affiliate/apply", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const affiliate_code = req.body?.affiliate_code?.trim();

    if (!affiliate_code) {
      return res.status(400).json({ error: "affiliate_code é obrigatório" });
    }

    const { data: affiliate, error: affiliateError } = await supabase
      .from("affiliates")
      .select("id, code, is_active")
      .eq("code", affiliate_code)
      .eq("is_active", true)
      .maybeSingle();

    if (affiliateError) {
      console.error("Erro ao buscar affiliate:", affiliateError);
      return res.status(400).json({ error: affiliateError.message });
    }

    if (!affiliate || affiliate.is_active !== true) {
      return res.status(400).json({ error: "Código de afiliado inválido ou inativo." });
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id, affiliate_id")
      .eq("id", authData.userId)
      .maybeSingle();

    if (profileErr) {
      console.error("Erro ao verificar perfil para affiliate:", profileErr);
      return res.status(400).json({ error: profileErr.message });
    }

    if (profileRow?.affiliate_id) {
      return res.status(400).json({ error: "Usuário já possui afiliado vinculado." });
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ affiliate_id: affiliate.id, affiliate_code: affiliate.code })
      .eq("id", authData.userId);

    if (updateErr) {
      console.error("Erro ao vincular afiliado:", updateErr);
      return res.status(400).json({ error: updateErr.message });
    }

    invalidateAuthCache(getBearerToken(req));

    return res.json({ ok: true, affiliate_id: affiliate.id });
  } catch (err) {
    console.error("Erro inesperado em POST /public/affiliate/apply:", err);
    return res.status(500).json({ error: "Erro interno ao vincular afiliado." });
  }
});

// Helpers para novas rotas de Rotina de Treino
const getUserIdFromRequest = (req) =>
  req.body?.user_id ||
  req.body?.userId ||
  req.query?.user_id ||
  req.query?.userId ||
  req.headers["x-user-id"] ||
  req.headers["user-id"];

const parseList = (value) =>
  value
    ? String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const joinList = (value) =>
  Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).join(", ") : "";

const getLocalDateString = (now = new Date()) => {
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

const mapRoutineRow = (row = {}) => ({
  id: row.id,
  name: row.name,
  muscleGroups: parseList(row.muscle_groups || row.muscle_group),
  sportsActivities: parseList(row.sports_list || row.sports),
  muscleConfig: Array.isArray(row.muscle_config)
    ? row.muscle_config
    : row.muscle_config || [],
  exercisesByGroup:
    row.exercises_by_group && typeof row.exercises_by_group === "object"
      ? row.exercises_by_group
      : {},
  exercicios:
    row.exercises_by_group && typeof row.exercises_by_group === "object"
      ? row.exercises_by_group
      : {},
  createdAt: row.created_at,
});

const isAffiliateProfile = (profile = {}) => {
  const normalizedRole = String(profile?.role || "").toLowerCase();
  return normalizedRole === "affiliate" || profile?.is_affiliate === true;
};

const isAdminProfile = (profile = {}) => String(profile?.role || "").toLowerCase() === "admin";

const sanitizeWorkoutForClone = (workout = {}, targetUserId) => {
  const clone = { ...workout, user_id: targetUserId };
  delete clone.id;
  delete clone.created_at;
  delete clone.updated_at;
  return clone;
};

app.get("/affiliate/supervised-users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res);
    if (!authData) return;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, is_affiliate, affiliate_id")
      .eq("id", authData.userId)
      .maybeSingle();

    if (profileError) {
      return res.status(400).json({ error: profileError.message || "Erro ao buscar perfil do afiliado." });
    }

    if (!profile?.id || !isAffiliateProfile(profile)) {
      return res.status(403).json({ error: "Apenas afiliados podem acessar esta rota." });
    }

    if (!profile?.affiliate_id) {
      return res.json({ users: [] });
    }

    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, name, username, email, whatsapp, role, is_affiliate, affiliate_id, created_at")
      .eq("affiliate_id", profile.affiliate_id)
      .neq("id", profile.id)
      .neq("role", "admin")
      .neq("is_affiliate", true)
      .order("created_at", { ascending: true });

    if (usersError) {
      return res.status(400).json({ error: usersError.message || "Erro ao buscar usuários supervisionados." });
    }

    return res.json({ users: users || [] });
  } catch (err) {
    console.error("Erro inesperado em GET /affiliate/supervised-users:", err);
    return res.status(500).json({ error: "Erro interno ao buscar usuários supervisionados." });
  }
});

app.post("/workouts/:id/transfer", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res);
    if (!authData) return;

    const workoutId = req.params?.id;
    const targetUserId = req.body?.target_user_id;
    if (!workoutId || !targetUserId) {
      return res.status(400).json({ error: "id do treino e target_user_id são obrigatórios." });
    }

    const { data: loggedProfile, error: loggedProfileError } = await supabase
      .from("profiles")
      .select("id, role, is_affiliate, affiliate_id")
      .eq("id", authData.userId)
      .maybeSingle();

    if (loggedProfileError) {
      return res.status(400).json({ error: loggedProfileError.message || "Erro ao validar afiliado." });
    }

    if (!loggedProfile?.id || !isAffiliateProfile(loggedProfile)) {
      return res.status(403).json({ error: "Apenas afiliados podem transferir treino." });
    }

    if (!loggedProfile.affiliate_id) {
      return res.status(400).json({ error: "Afiliado sem vínculo válido para transferência." });
    }

    const { data: workout, error: workoutError } = await supabase
      .from("workout_routines")
      .select("*")
      .eq("id", workoutId)
      .eq("user_id", loggedProfile.id)
      .maybeSingle();

    if (workoutError) {
      return res.status(400).json({ error: workoutError.message || "Erro ao buscar treino de origem." });
    }

    if (!workout?.id) {
      return res.status(404).json({ error: "Treino não encontrado ou não pertence ao afiliado." });
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from("profiles")
      .select("id, name, username, email, whatsapp, role, is_affiliate, affiliate_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetUserError) {
      return res.status(400).json({ error: targetUserError.message || "Erro ao validar usuário destino." });
    }

    if (!targetUser?.id) {
      return res.status(404).json({ error: "Usuário destino não encontrado." });
    }

    if (isAdminProfile(targetUser) || isAffiliateProfile(targetUser)) {
      return res.status(403).json({ error: "Transferência permitida apenas para usuários supervisionados comuns." });
    }

    if (targetUser.affiliate_id !== loggedProfile.affiliate_id) {
      return res.status(403).json({ error: "Usuário destino não está vinculado a este afiliado." });
    }

    const clonedWorkout = sanitizeWorkoutForClone(workout, targetUser.id);
    const { data: createdWorkout, error: cloneError } = await supabase
      .from("workout_routines")
      .insert(clonedWorkout)
      .select("*")
      .single();

    if (cloneError) {
      return res.status(400).json({ error: cloneError.message || "Erro ao transferir treino." });
    }

    return res.status(201).json({
      ok: true,
      workout: mapRoutineRow(createdWorkout),
    });
  } catch (err) {
    console.error("Erro inesperado em POST /workouts/:id/transfer:", err);
    return res.status(500).json({ error: "Erro interno ao transferir treino." });
  }
});

const normalizeMuscleGroups = (muscleGroups) => {
  if (Array.isArray(muscleGroups)) return muscleGroups.join(",");
  if (typeof muscleGroups === "string") return muscleGroups;
  return "";
};

const normalizeSportsArray = (sports) => {
  // Se já for array, só devolve
  if (Array.isArray(sports)) return sports;

  if (typeof sports === "string") {
    const trimmed = sports.trim();

    // Se for JSON tipo '["boxing","running"]', tenta fazer parse
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((s) => String(s).trim())
            .filter(Boolean);
        }
      } catch (e) {
        // Se der erro, continua para o tratamento normal
      }
    }

    // Caso seja string separada por vírgula: "boxing,running"
    return trimmed
      .split(",")
      .map((s) =>
        String(s)
          .trim()
          .replace(/^\[|\]$/g, "")   // remove colchetes
          .replace(/^"|"$/g, "")     // remove aspas
      )
      .filter(Boolean);
  }

  return [];
};

const normalizeSportsString = (sports) => {
  if (Array.isArray(sports)) return sports.join(",");
  if (typeof sports === "string") return sports;
  return "";
};

// CRUD de rotinas de treino (tabela workout_routines)
app.get("/api/workout/routines", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const { data, error } = await supabase
      .from("workout_routines")
      .select("id, user_id, name, muscle_group, muscle_groups, sports, sports_list, muscle_config, exercises_by_group, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao buscar rotinas de treino:", error);
      return res.status(400).json({ error: error.message });
    }

    const routines = (data || []).map(mapRoutineRow);
    return res.json(routines);
  } catch (err) {
    console.error("Erro inesperado em GET /api/workout/routines:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.post("/api/workout/routines", async (req, res) => {
  try {
    const {
      userId,
      name,
      muscleGroups = [],
      sportsActivities = [],
      muscleConfig = [],
      exercisesByGroup = {},
      exercicios = {},
    } = req.body || {};
    if (!userId || !name) {
      return res.status(400).json({ error: "userId e name são obrigatórios" });
    }

    const normalizedExercisesByGroup =
      exercisesByGroup && typeof exercisesByGroup === "object" && !Array.isArray(exercisesByGroup)
        ? exercisesByGroup
        : exercicios && typeof exercicios === "object" && !Array.isArray(exercicios)
          ? exercicios
          : {};

    const insertPayload = {
      user_id: userId,
      name,
      muscle_group: joinList(muscleGroups),
      muscle_groups: joinList(muscleGroups),
      sports: joinList(sportsActivities),
      sports_list: joinList(sportsActivities),
      muscle_config: muscleConfig,
      exercises_by_group: normalizedExercisesByGroup,
    };

    const { data, error } = await supabase
      .from("workout_routines")
      .insert(insertPayload)
      .select("id, user_id, name, muscle_group, muscle_groups, sports, sports_list, muscle_config, exercises_by_group, created_at")
      .single();

    if (error) {
      console.error("Erro ao criar rotina de treino:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(mapRoutineRow(data));
  } catch (err) {
    console.error("Erro inesperado em POST /api/workout/routines:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.put("/api/workout/routines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      name,
      muscleGroups = [],
      sportsActivities = [],
      muscleConfig = [],
      exercisesByGroup = {},
      exercicios = {},
    } = req.body || {};

    if (!id || !userId || !name) {
      return res.status(400).json({ error: "id, userId e name são obrigatórios" });
    }

    const normalizedExercisesByGroup =
      exercisesByGroup && typeof exercisesByGroup === "object" && !Array.isArray(exercisesByGroup)
        ? exercisesByGroup
        : exercicios && typeof exercicios === "object" && !Array.isArray(exercicios)
          ? exercicios
          : {};

    const updatePayload = {
      name,
      muscle_group: joinList(muscleGroups),
      muscle_groups: joinList(muscleGroups),
      sports: joinList(sportsActivities),
      sports_list: joinList(sportsActivities),
      muscle_config: muscleConfig,
      exercises_by_group: normalizedExercisesByGroup,
    };

    const { data, error } = await supabase
      .from("workout_routines")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, user_id, name, muscle_group, muscle_groups, sports, sports_list, muscle_config, exercises_by_group, created_at")
      .single();

    if (error) {
      console.error("Erro ao atualizar rotina de treino:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(mapRoutineRow(data));
  } catch (err) {
    console.error("Erro inesperado em PUT /api/workout/routines/:id:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.delete("/api/workout/routines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserIdFromRequest(req);

    if (!id || !userId) {
      return res.status(400).json({ error: "id e userId são obrigatórios" });
    }

    const { error: scheduleError } = await supabase
      .from("workout_schedule")
      .delete()
      .eq("workout_id", id)
      .eq("user_id", userId);

    if (scheduleError) {
      throw scheduleError;
    }

    const { error } = await supabase
      .from("workout_routines")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Erro ao excluir rotina", err);
    return res
      .status(500)
      .json({ error: "Não foi possível excluir o treino." });
  }
});

const WEEKDAY_BY_NAME = {
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  domingo: 7,
};

const toWeekdayNumber = (value) => {
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= 7) {
    return asNumber;
  }

  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  return WEEKDAY_BY_NAME[normalized] || null;
};

// PATCH /weekly-plan/:day
app.patch('/weekly-plan/:day', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const dayParam = req.params?.day;
    const weekday = toWeekdayNumber(dayParam);

    if (!userId || !weekday) {
      return res.status(400).json({ error: 'userId e dia da semana válidos são obrigatórios.' });
    }

    const hasWorkoutId = req.body?.workoutId !== undefined || req.body?.workout_id !== undefined;
    const hasTime = req.body?.time !== undefined;
    const reminderRaw = req.body?.reminderEnabled ?? req.body?.reminder_enabled ?? req.body?.reminder;
    const reminderEnabled =
      reminderRaw !== undefined
        ? parseBoolean(
            req.body?.reminderEnabled ?? req.body?.reminder_enabled ?? req.body?.reminder
          )
        : undefined;

    console.log('Atualizando lembrete:', {
      day: weekday,
      reminderEnabled,
    });

    const workoutId = req.body?.workoutId ?? req.body?.workout_id;
    const time = req.body?.time;
    const updateData = {};

    if (hasWorkoutId) updateData.workout_id = workoutId ?? null;
    if (hasTime) updateData.time = time ?? null;
    if (reminderEnabled !== undefined) updateData.is_active = reminderEnabled;

    const { data: existingPlan, error: existingPlanError } = await supabase
      .from('workout_schedule')
      .select('id')
      .eq('user_id', userId)
      .eq('weekday', weekday)
      .maybeSingle();

    if (existingPlanError) {
      console.error('Erro ao buscar planejamento semanal automático:', existingPlanError);
      return res.status(400).json({ error: existingPlanError.message });
    }

    let saveError = null;

    if (existingPlan?.id) {
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('workout_schedule')
          .update(updateData)
          .eq('id', existingPlan.id);
        saveError = error;
      }
    } else {
      const insertData = {
        user_id: userId,
        weekday,
        ...updateData,
      };

      const { error } = await supabase.from('workout_schedule').insert(insertData);
      saveError = error;
    }

    if (saveError) {
      console.error('Erro ao salvar planejamento semanal automático:', saveError);
      return res.status(400).json({ error: saveError.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro inesperado em PATCH /weekly-plan/:day:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// GET /weekly-plan
app.get('/weekly-plan', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(400).json({ error: 'user_id é obrigatório.' });
    }

    const { data, error } = await supabase
      .from('workout_schedule')
      .select('id, user_id, weekday, workout_id, time, is_active')
      .eq('user_id', userId)
      .order('weekday', { ascending: true });

    if (error) {
      console.error('Erro ao buscar planejamento semanal:', error);
      return res.status(400).json({ error: error.message });
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      weekday: row.weekday,
      workout_id: row.workout_id,
      time: row.time,
      is_active: row.is_active,
      reminder: !!row.is_active,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error('Erro inesperado em GET /weekly-plan:', err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// GET /workout-schedule
app.get("/workout-schedule", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id é obrigatório." });
    }

    const { data, error } = await supabase
      .from("workout_schedule")
      .select("id, user_id, weekday, workout_id, time, is_active")
      .eq("user_id", userId)
      .order("weekday", { ascending: true });

    if (error) {
      console.error("Erro ao buscar semana de treino:", error);
      return res.status(400).json({ error: error.message });
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      weekday: row.weekday,
      workout_id: row.workout_id,
      time: row.time,
      is_active: row.is_active,
      reminder: !!row.is_active,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Erro inesperado em GET /workout-schedule:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// POST /workout-schedule
app.post("/workout-schedule", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const schedule = req.body?.schedule || [];

    if (!userId) {
      return res.status(400).json({ error: "user_id é obrigatório." });
    }

    const normalized = (Array.isArray(schedule) ? schedule : [])
      .map((item, index) => ({
        user_id: userId,
        weekday: Number(item.weekday || item.dayIndex || index + 1),
        workout_id: item.workout_id || item.workoutId || null,
        time: item.time || null,
        is_active:
          item.is_active !== undefined
            ? item.is_active
            : item.isActive !== undefined
            ? item.isActive
            : item.reminder !== undefined
            ? !!item.reminder
            : true,
      }))
      .filter((item) => item.weekday >= 1 && item.weekday <= 7);

    const { error: cleanupError } = await supabase
      .from("workout_schedule")
      .delete()
      .eq("user_id", userId);

      if (cleanupError) {
        console.error("Erro ao limpar agenda anterior:", cleanupError);
        return res.status(400).json({ error: cleanupError.message });
      }

      if (normalized.length) {
        const { error } = await supabase
        .from("workout_schedule")
        .insert(normalized);

        if (error) {
          console.error("Erro ao salvar semana de treino:", error);
        return res.status(400).json({ error: error.message });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro inesperado em POST /workout-schedule:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// ==== Rotas de Rotina de Treino / Histórico ====
// Todas agrupadas em /api/workouts para não conflitar com fluxos já existentes.
app.post("/api/workouts/templates", async (req, res) => {
  try {
    const {
      userId,
      name,
      muscleGroups = [],
      exercises = [],
      muscle_groups,
      sportsActivities = [],
      sports = [],
    } = req.body || {};
    const normalizedMuscleGroups = Array.isArray(muscleGroups)
      ? muscleGroups
      : typeof muscle_groups === "string"
      ? muscle_groups.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

    const normalizedSports = normalizeSportsArray(
      Array.isArray(sportsActivities) && sportsActivities.length ? sportsActivities : sports
    );

    if (!userId || !name || !normalizedMuscleGroups.length) {
      return res.status(400).json({
        error: "userId, name e muscleGroups são obrigatórios para salvar o template.",
      });
    }

    const templatePayload = {
      userId,
      name,
      muscleGroups: normalizedMuscleGroups,
      sportsActivities: normalizedSports,
      sports: normalizedSports,
      exercises: Array.isArray(exercises) ? exercises : [],
    };

    const saved = await upsertWorkoutTemplate(templatePayload);
    return res.json(saved);
  } catch (err) {
    console.error("Erro ao criar template de treino", err);
    return res.status(500).json({ error: "Erro interno ao salvar template" });
  }
});

app.put("/api/workouts/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      name,
      muscleGroups = [],
      exercises = [],
      muscle_groups,
      sportsActivities = [],
      sports = [],
    } = req.body || {};
    const normalizedMuscleGroups = Array.isArray(muscleGroups)
      ? muscleGroups
      : typeof muscle_groups === "string"
      ? muscle_groups.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

    const normalizedSports = normalizeSportsArray(
      Array.isArray(sportsActivities) && sportsActivities.length ? sportsActivities : sports
    );

    if (!id || !userId || !name || !normalizedMuscleGroups.length) {
      return res.status(400).json({
        error: "id, userId, name e muscleGroups são obrigatórios para atualizar o template.",
      });
    }

    const templatePayload = {
      id,
      userId,
      name,
      muscleGroups: normalizedMuscleGroups,
      sportsActivities: normalizedSports,
      sports: normalizedSports,
      exercises: Array.isArray(exercises) ? exercises : [],
    };

    const saved = await upsertWorkoutTemplate(templatePayload);
    return res.json(saved);
  } catch (err) {
    console.error("Erro ao atualizar template de treino", err);
    return res.status(500).json({ error: "Erro interno ao atualizar template" });
  }
});

  app.get("/api/workouts/templates", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req) || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const templates = await listWorkoutTemplates(userId);
    return res.json(templates);
  } catch (err) {
    console.error("Erro ao listar templates", err);
    return res.status(500).json({ error: "Erro interno ao listar templates" });
  }
});

app.delete("/api/workouts/templates/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Exclusão de template de treino
    if (supabase) {
      const { error } = await supabase
        .from("workout_templates")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Erro Supabase ao excluir template", error);
        // Fallback para JSON se houver erro
      } else {
        return res.status(204).send();
      }
    }

    const templates = await loadJsonArray("workout_templates.json");
    const updated = templates.filter((tpl) => tpl.id !== id);
    await saveJsonArray("workout_templates.json", updated);

    return res.status(204).send();
  } catch (err) {
    console.error("Erro ao excluir template", err);
    return res.status(500).json({ error: "Erro ao excluir template" });
  }
});

app.post("/api/workouts/sessions", async (req, res) => {
  const tableName = "workout_sessions";
  const session = req.body || {};
  try {
    if (!session.userId || !session.name) {
      return res.status(400).json({ error: "userId e name são obrigatórios." });
    }

    const saved = await createWorkoutSession(session);
    return res.json(saved);
  } catch (err) {
    console.error("Erro ao registrar sessão no Supabase", {
      table: tableName,
      fields: Object.keys(session || {}),
      template_id: session?.templateId || null,
      referenced_table: "workout_templates",
      template_id_source: session?.templateIdSource || "unknown",
      routine_id_source: session?.routineId || null,
      code: err?.code,
      message: err?.message,
      details: err?.details,
      hint: err?.hint,
      error: err,
    });
    return res.status(500).json({ error: "Erro interno ao salvar sessão" });
  }
});

app.get("/api/workouts/sessions", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req) || req.query.userId;
    const { from, to } = req.query || {};

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const sessions = await listWorkoutSessions(userId, { from, to });
    return res.json(sessions);
  } catch (err) {
    console.error("Erro ao listar sessões", err);
    return res.status(500).json({ error: "Erro interno ao listar sessões" });
  }
});

app.delete("/api/workouts/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserIdFromRequest(req) || req.query.userId;

    if (!id) return res.status(400).json({ error: "id é obrigatório" });
    if (!userId) return res.status(400).json({ error: "userId é obrigatório" });

    const ok = await deleteWorkoutSession(id, userId);

    if (!ok) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Erro ao excluir sessão", err);
    return res.status(500).json({ error: "Erro interno ao excluir sessão" });
  }
});

app.get("/api/workouts/progress", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req) || req.query.userId;
    const { period = "month" } = req.query || {};

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const summary = await summarizeProgress(userId, period);
    return res.json(summary);
  } catch (err) {
    console.error("Erro ao gerar progresso", err);
    return res.status(500).json({ error: "Erro interno ao gerar progresso" });
  }
});

app.post("/api/workouts/reminders", async (req, res) => {
  try {
    const reminder = req.body || {};
    if (!reminder.workoutName || !reminder.date) {
      return res.status(400).json({ error: "workoutName e date são obrigatórios" });
    }

    // Apenas registrar por enquanto; integração real pode ser adicionada depois
    console.log("Novo lembrete de treino", reminder);
    const saved = await saveWorkoutReminder(reminder);
    return res.json(saved);
  } catch (err) {
    console.error("Erro ao salvar lembrete de treino", err);
    return res.status(500).json({ error: "Erro interno ao salvar lembrete" });
  }
});

/*
SQL para criação das tabelas no Supabase (schema public):

CREATE TABLE IF NOT EXISTS public.workout_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  muscle_groups text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workout_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  workout_id uuid REFERENCES public.workout_routines(id),
  time time without time zone,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
*/

app.get("/api/food-diary/state", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const userId = authData.userId;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId é obrigatório para carregar o diário alimentar" });
    }

    const state = await getFoodDiaryState(userId);
    return res.json(state);
  } catch (err) {
    console.error("Erro ao buscar diário alimentar", err);
    return res
      .status(500)
      .json({ error: "Erro interno ao buscar diário alimentar" });
  }
});

const hydrationStatePayload = (state) => ({
  ok: true,
  hydrationTotalMl: state?.hydrationTotalMl ?? 0,
  hydrationGoalMl: state?.hydrationGoalMl ?? 0,
  hydrationLastEntryId: state?.hydrationLastEntryId ?? null,
});

const waterStatePayload = (summary) => ({
  total_ml: summary?.totalMl ?? 0,
  total_l: summary?.totalL ?? 0,
  goal_l: summary?.goalL ?? 0,
  last_entry_id: summary?.lastEntryId ?? null,
});

const handleHydrationState = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const dayDate = req.query?.dayDate || req.query?.date || getLocalDateString();
    const state = await getFoodDiaryState(authData.userId, { dayDate });
    return res.json(hydrationStatePayload(state));
  } catch (err) {
    console.error("Erro ao buscar hidratação", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao buscar hidratação" });
  }
};

const handleHydrationAdd = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const amountMl = Number(req.body?.amountMl ?? req.body?.amount_ml);
    const dayDate = req.body?.dayDate || req.body?.date || getLocalDateString();

    if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
      return res.status(400).json({
        ok: false,
        error: "amountMl precisa ser um número entre 1 e 5000.",
      });
    }

    const result = await addHydration({
      supabase,
      userId: authData.userId,
      dayDate,
      amountMl,
    });

    if (!result.ok) {
      console.error("Erro ao inserir hidratação:", result.error);
      return res.status(500).json({
        ok: false,
        error: result.error?.message || "Não foi possível salvar a hidratação.",
      });
    }

    const state = await getFoodDiaryState(authData.userId, { dayDate });
    return res.json(hydrationStatePayload(state));
  } catch (err) {
    console.error("Erro ao salvar hidratação", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao salvar hidratação" });
  }
};

const handleHydrationUndo = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const dayDate = req.body?.dayDate || req.body?.date || getLocalDateString();
    const result = await undoLastHydration({
      supabase,
      userId: authData.userId,
      dayDate,
    });

    if (!result.ok) {
      if (result.reason === "no_hydration") {
        const state = await getFoodDiaryState(authData.userId, { dayDate });
        return res.json({
          ok: false,
          reason: "no_hydration",
          hydrationTotalMl: state?.hydrationTotalMl ?? 0,
          hydrationLastEntryId: state?.hydrationLastEntryId ?? null,
        });
      }

      console.error("Erro ao desfazer hidratação:", result.error);
      return res.status(500).json({
        ok: false,
        error: result.error?.message || "Não foi possível desfazer a hidratação.",
      });
    }

    const state = await getFoodDiaryState(authData.userId, { dayDate });
    return res.json({
      ok: true,
      hydrationTotalMl: state?.hydrationTotalMl ?? 0,
      hydrationLastEntryId: state?.hydrationLastEntryId ?? null,
    });
  } catch (err) {
    console.error("Erro ao desfazer hidratação", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao desfazer hidratação" });
  }
};

const handleWaterState = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const dayDate = req.query?.date || req.query?.dayDate || getLocalDateString();
    const summary = await getWaterSummary({
      supabase,
      userId: authData.userId,
      dayDate,
    });

    return res.json({ ok: true, ...waterStatePayload(summary) });
  } catch (err) {
    console.error("Erro ao buscar água", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao buscar água" });
  }
};

const handleWaterAdd = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const amountMl = Number(req.body?.amount_ml ?? req.body?.amountMl);
    const dayDate = req.body?.date || req.body?.dayDate || getLocalDateString();

    if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
      return res.status(400).json({
        ok: false,
        error: "amount_ml precisa ser um número entre 1 e 5000.",
      });
    }

    const result = await addHydration({
      supabase,
      userId: authData.userId,
      dayDate,
      amountMl,
    });

    if (!result.ok) {
      console.error("Erro ao inserir água:", result.error);
      return res.status(500).json({
        ok: false,
        error: result.error?.message || "Não foi possível salvar a água.",
      });
    }

    const summary = await getWaterSummary({
      supabase,
      userId: authData.userId,
      dayDate,
    });

    return res.json({ ok: true, ...waterStatePayload(summary) });
  } catch (err) {
    console.error("Erro ao salvar água", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao salvar água" });
  }
};

const handleWaterUndo = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const dayDate = req.body?.date || req.body?.dayDate || getLocalDateString();
    const result = await undoLastHydration({
      supabase,
      userId: authData.userId,
      dayDate,
    });

    if (!result.ok) {
      if (result.reason === "no_hydration") {
        const summary = await getWaterSummary({
          supabase,
          userId: authData.userId,
          dayDate,
        });

        return res.json({
          ok: false,
          reason: "no_hydration",
          ...waterStatePayload(summary),
        });
      }

      console.error("Erro ao desfazer água:", result.error);
      return res.status(500).json({
        ok: false,
        error: result.error?.message || "Não foi possível desfazer a água.",
      });
    }

    const summary = await getWaterSummary({
      supabase,
      userId: authData.userId,
      dayDate,
    });

    return res.json({ ok: true, ...waterStatePayload(summary) });
  } catch (err) {
    console.error("Erro ao desfazer água", err);
    return res.status(500).json({ ok: false, error: "Erro interno ao desfazer água" });
  }
};

const handleWaterGoalUpdate = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const goalL = req.body?.goal_l ?? req.body?.goalL;
    const result = await updateWaterGoal({
      supabase,
      userId: authData.userId,
      goalLiters: goalL,
    });

    if (!result.ok) {
      console.error("Erro ao salvar meta de água:", result.error);
      return res.status(400).json({
        ok: false,
        error: result.error?.message || "Não foi possível salvar a meta de água.",
      });
    }

    return res.json({ ok: true, goal_l: result.goalL });
  } catch (err) {
    console.error("Erro ao salvar meta de água", err);
    return res
      .status(500)
      .json({ ok: false, error: "Erro interno ao salvar meta de água" });
  }
};

app.get("/api/food-diary/hydration/state", handleHydrationState);
app.post("/api/food-diary/hydration/add", handleHydrationAdd);
app.post("/api/food-diary/hydration/undo", handleHydrationUndo);

app.get("/api/water", handleWaterState);
app.post("/api/water/add", handleWaterAdd);
app.post("/api/water/undo", handleWaterUndo);
app.put("/api/water/goal", handleWaterGoalUpdate);

app.post("/api/hydration/add", handleHydrationAdd);
app.post("/api/hydration/undo", handleHydrationUndo);
app.get("/api/hydration/state", handleHydrationState);
app.get("/api/hydration", handleWaterState);

const normalizeSex = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "male" || normalized === "female") return normalized;
  if (normalized === "masculino" || normalized === "masc") return "male";
  if (normalized === "feminino" || normalized === "fem") return "female";
  return null;
};

const buildAutomaticGoalsFromWeight = (weight) => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
    return null;
  }

  return {
    calories: Math.round(numericWeight * 20),
    protein: Math.round(numericWeight * 2),
    water: Number((numericWeight * 0.035).toFixed(2)),
  };
};

const handleBodyUpdate = async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const {
      user_id,
      userId: userIdFromBody,
      weight,
      height,
      height_cm,
      goal_weight,
      objective,
      sex,
      age,
      calorie_goal,
      protein_goal,
      water_goal_l,
    } = req.body || {};
    const requestedUserId = user_id || userIdFromBody || null;
    const requesterRole = String(authData?.profile?.role || "").toLowerCase();
    const userId = requestedUserId || authData.userId;
    const isAdminRequest = requesterRole === "admin";
    if (!isAdminRequest && userId !== authData.userId) {
      return res.status(403).json({ error: "Sem permissão para atualizar outro usuário." });
    }
    const resolvedWeight = weight;
    const resolvedGoalWeight = goal_weight;

    console.log("BODY RECEBIDO:", req.body);
    console.log("USER ID:", userId);

    if (!userId || !Number.isFinite(Number(resolvedWeight))) {
      return res.status(400).json({ error: "user_id e weight são obrigatórios." });
    }
    const normalizedWeight = Number(resolvedWeight);
    const resolvedHeight = height_cm ?? height;
    const normalizedHeight = Number.isFinite(Number(resolvedHeight)) ? Number(resolvedHeight) : null;
    const normalizedGoalWeight = Number.isFinite(Number(resolvedGoalWeight))
      ? Number(resolvedGoalWeight)
      : null;
    const normalizedObjective = ["perder_peso", "manter_peso", "ganhar_massa"].includes(objective)
      ? objective
      : "manter_peso";
    const normalizedSex = normalizeSex(sex);
    const normalizedAge = Number.isFinite(Number(age)) ? Number(age) : null;

    let calorieGoal = Number.isFinite(Number(calorie_goal)) ? Number(calorie_goal) : null;
    let proteinGoal = Number.isFinite(Number(protein_goal)) ? Number(protein_goal) : null;
    let waterGoalL = Number.isFinite(Number(water_goal_l)) ? Number(water_goal_l) : null;

    if (calorieGoal == null || proteinGoal == null || waterGoalL == null) {
      const canCalculateByBodyMetrics =
        Number.isFinite(normalizedWeight) &&
        Number.isFinite(normalizedHeight) &&
        Number.isFinite(normalizedAge) &&
        (normalizedSex === "male" || normalizedSex === "female");

      if (canCalculateByBodyMetrics) {
        let tmb;
        if (normalizedSex === "male") {
          tmb = 10 * normalizedWeight + 6.25 * normalizedHeight - 5 * normalizedAge + 5;
        } else {
          tmb = 10 * normalizedWeight + 6.25 * normalizedHeight - 5 * normalizedAge - 161;
        }
        const tdee = tmb * 1.55;
        calorieGoal = normalizedObjective === "perder_peso" ? tdee - 500 : normalizedObjective === "ganhar_massa" ? tdee + 400 : tdee;
        proteinGoal = normalizedObjective === "perder_peso" ? normalizedWeight * 2 : normalizedObjective === "ganhar_massa" ? normalizedWeight * 2.2 : normalizedWeight * 1.6;
        waterGoalL = normalizedWeight * 0.035;
      } else {
        const automaticGoals = buildAutomaticGoalsFromWeight(normalizedWeight);
        calorieGoal = automaticGoals?.calories ?? null;
        proteinGoal = automaticGoals?.protein ?? null;
        waterGoalL = automaticGoals?.water ?? null;
      }
    }

    const bodyProfilePayload = {
      user_id: userId,
      weight: normalizedWeight,
      goal_weight: normalizedGoalWeight,
      height_cm: normalizedHeight,
      objective: normalizedObjective,
      sex: normalizedSex,
      age: normalizedAge,
      calorie_goal: calorieGoal != null ? Math.round(calorieGoal) : null,
      protein_goal: proteinGoal != null ? Math.round(proteinGoal) : null,
      water_goal_l: waterGoalL != null ? Number(Number(waterGoalL).toFixed(2)) : null,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from("food_diary_profile")
      .upsert(bodyProfilePayload, { onConflict: "user_id" });

    if (profileError) {
      console.error("Erro ao salvar food_diary_profile:", profileError);
      return res.status(500).json({ error: profileError.message });
    }

    return res.json({
      success: true,
      user: {
        id: userId,
        height_cm: normalizedHeight,
        weight: normalizedWeight,
        current_weight: normalizedWeight,
        latest_weight_kg: normalizedWeight,
        goal_weight: normalizedGoalWeight,
        objective: normalizedObjective,
        sex: normalizedSex,
        age: normalizedAge,
        calorie_goal: bodyProfilePayload.calorie_goal,
        protein_goal: bodyProfilePayload.protein_goal,
        water_goal_l: bodyProfilePayload.water_goal_l,
      },
      goals: {
        objective: normalizedObjective,
        weight_goal: normalizedGoalWeight,
        calorie_goal: bodyProfilePayload.calorie_goal,
        protein_goal: bodyProfilePayload.protein_goal,
        water_goal_l: bodyProfilePayload.water_goal_l,
      },
    });
  } catch (error) {
    console.error("Erro geral:", error);
    return res.status(500).json({ error: error.message });
  }
};

app.post("/body", handleBodyUpdate);
app.post("/api/body", handleBodyUpdate);

app.put("/goals/manual", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const userId = authData.userId;
    const { calories, protein, water } = req.body || {};
    const parsedCalories = Number(calories);
    const parsedProtein = Number(protein);
    const parsedWater = Number(water);

    if (
      !Number.isFinite(parsedCalories) ||
      !Number.isFinite(parsedProtein) ||
      !Number.isFinite(parsedWater)
    ) {
      return res.status(400).json({ error: "calories, protein e water são obrigatórios." });
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        calorie_goal: parsedCalories,
        protein_goal: parsedProtein,
        water_goal_l: parsedWater,
        goal_mode: "manual",
      })
      .eq("id", userId);

    if (error) throw error;

    const { error: diaryError } = await supabase
      .from("food_diary_profile")
      .upsert(
        {
          user_id: userId,
          calorie_goal: parsedCalories,
          protein_goal: parsedProtein,
          water_goal_l: parsedWater,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (diaryError) throw diaryError;

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar metas manuais:", err);
    return res.status(500).json({ error: "Erro ao atualizar metas" });
  }
});

app.put("/goals/auto", async (req, res) => {
  return res.status(403).json({
    message: "Função desativada",
  });
});

app.put("/api/food-diary/state", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: false });
    if (!authData) return;

    const userId = authData.userId;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId é obrigatório para salvar o diário alimentar" });
    }

    const {
      entriesByDate = {},
      goals = {},
      body = {},
      weightHistory = [],
    } = req.body || {};

    const {
      heightCm = "",
      weightKg = "",
      goalWeightKg = "",
      age = "",
      sex = null,
      objective = null,
    } = body || {};

    const saved = await saveFoodDiaryState(userId, {
      entriesByDate,
      goals,
      body: {
        heightCm,
        weightKg,
        goalWeightKg,
        age,
        sex,
        objective,
      },
      weightHistory,
    });

    return res.json(saved);
  } catch (err) {
    console.error("Erro ao salvar diário alimentar", err);
    return res
      .status(500)
      .json({ error: "Erro interno ao salvar diário alimentar" });
  }
});

/**
 * MARCAR COMO PAGO
 */
const registerFinanceHistory = async ({
  userId,
  action,
  oldValue = null,
  newValue = null,
  notes = null,
  createdBy = null,
}) => {
  const payload = {
    user_id: userId,
    action,
    old_value: oldValue,
    new_value: newValue,
    notes,
    created_by: createdBy,
  };

  const { error } = await supabase.from("finance_history").insert(payload);
  if (error) {
    console.warn("Falha ao registrar histórico financeiro:", error.message);
  }
};

const getProfileById = async (id) => {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, role, plan_type, billing_due_day, due_day, billing_status, subscription_status, last_paid_at, billing_last_paid_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const markUserAsPaid = async (id, actorUserId) => {
  const user = await getProfileById(id);
  if (!user?.id) {
    return { status: 404, body: { error: "Usuário não encontrado." } };
  }
  if (isOwnerEmail(user?.email)) {
    await enforceOwnerProtectionById(id);
    return { status: 200, body: { success: true } };
  }

  const now = new Date();
  const currentIso = now.toISOString();
  const dueDay = normalizeDueDay(user);
  const nextDue = computeNextDueDate(dueDay, now);
  const updatePayload = {
    last_paid_at: currentIso,
    billing_last_paid_at: currentIso,
    billing_status: "paid",
    subscription_status: "active",
    billing_next_due: nextDue,
  };

  const { error } = await supabase.from("profiles").update(updatePayload).eq("id", id);
  if (error) throw error;

  await registerFinanceHistory({
    userId: id,
    action: "mark_paid",
    oldValue: {
      billing_status: user.billing_status,
      subscription_status: user.subscription_status,
      last_paid_at: user.last_paid_at || user.billing_last_paid_at || null,
    },
    newValue: updatePayload,
    createdBy: actorUserId,
  });

  return { status: 200, body: { success: true } };
};

const updateSubscriptionStatus = async (id, subscriptionStatus, actorUserId) => {
  const user = await getProfileById(id);
  if (!user?.id) {
    return { status: 404, body: { error: "Usuário não encontrado." } };
  }
  if (isOwnerEmail(user?.email)) {
    await enforceOwnerProtectionById(id);
    return { status: 200, body: { success: true } };
  }

  const updatePayload = { subscription_status: subscriptionStatus };
  if (subscriptionStatus === "active") {
    updatePayload.trial_status = null;
    updatePayload.trial_notified_at = null;
    updatePayload.trial_start_at = null;
    updatePayload.trial_end_at = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", id);
  if (error) throw error;

  await registerFinanceHistory({
    userId: id,
    action: subscriptionStatus === "inactive" ? "block" : "unblock",
    oldValue: { subscription_status: user.subscription_status },
    newValue: updatePayload,
    createdBy: actorUserId,
  });

  return { status: 200, body: { success: true } };
};

app.post("/admin/users/:id/mark-paid", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const { id } = req.params;
    const result = await markUserAsPaid(id, authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro ao marcar como pago:", err);
    return res.status(500).json({ error: "Erro ao marcar pagamento" });
  }
});

/**
 * ATIVAR USUÁRIO
 */
app.post("/admin/users/:id/activate", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const { id } = req.params;
    const result = await updateSubscriptionStatus(id, "active", authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro ao ativar usuário:", err);
    return res.status(500).json({ error: "Erro ao ativar usuário" });
  }
});

/**
 * DESATIVAR USUÁRIO
 */
app.post("/admin/users/:id/deactivate", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const { id } = req.params;
    const result = await updateSubscriptionStatus(id, "inactive", authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro ao desativar usuário:", err);
    return res.status(500).json({ error: "Erro ao desativar usuário" });
  }
});

app.post("/admin/finance/users/:id/mark-paid", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const result = await markUserAsPaid(req.params.id, authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro em POST /admin/finance/users/:id/mark-paid:", err);
    return res.status(500).json({ error: "Erro ao marcar usuário como pago." });
  }
});

app.post("/admin/finance/users/:id/block", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const result = await updateSubscriptionStatus(req.params.id, "inactive", authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro em POST /admin/finance/users/:id/block:", err);
    return res.status(500).json({ error: "Erro ao bloquear usuário." });
  }
});

app.post("/admin/finance/users/:id/unblock", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;
    const result = await updateSubscriptionStatus(req.params.id, "active", authData.userId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erro em POST /admin/finance/users/:id/unblock:", err);
    return res.status(500).json({ error: "Erro ao desbloquear usuário." });
  }
});

app.get("/admin/finance/users/:id/history", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { data, error } = await supabase
      .from("finance_history")
      .select("*")
      .eq("user_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message || "Erro ao carregar histórico financeiro." });
    }

    return res.json({ history: data || [] });
  } catch (err) {
    console.error("Erro em GET /admin/finance/users/:id/history:", err);
    return res.status(500).json({ error: "Erro ao carregar histórico financeiro." });
  }
});

app.use((err, req, res, next) => {
  console.error("ERRO GLOBAL:", err);
  res.status(500).json({ error: "Erro interno" });
});

app.listen(3001, () => {
  console.log("Backend rodando na porta 3001");
});
