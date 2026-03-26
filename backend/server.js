import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import multer from "multer";
import foodsRouter from "./routes/foods.js";
import eventsRoutes from "./routes/events.js";
import treinosRoutes from "./routes/treinos.js";
import { supabase } from "./supabase.js";
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

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/foods", foodsRouter);
app.use("/api/events", eventsRoutes);
app.use("/events", eventsRoutes);
app.use("/treinos", treinosRoutes);

const BILLING_DEFAULT_DUE_DAY = 20;
const USER_PLAN_TYPES = Object.freeze({
  TRIAL: "trial",
  NORMAL: "normal",
  PROMO: "promo",
});
const ALLOWED_USER_PLAN_TYPES = new Set(Object.values(USER_PLAN_TYPES));
const SUPER_ADMIN_EMAIL = "gestaopessoaloficial@gmail.com";
let schedulerStarted = false;

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

const formatDateOnly = (date) => date.toISOString().split("T")[0];

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

const findMainAffiliateFallback = async () => {
  const { data: byFelipeName, error: byNameError } = await supabase
    .from("affiliates")
    .select("id, code, name, email, is_active")
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
    .select("id, code, name, email, is_active")
    .eq("is_active", true)
    .ilike("email", "%felipe%")
    .limit(1)
    .maybeSingle();

  if (byEmailError && byEmailError.code !== "PGRST116") {
    console.error("Erro ao buscar afiliado principal por email:", byEmailError);
  }
  if (byFelipeEmail?.id) return byFelipeEmail;

  return null;
};

const resolveAffiliate = async (affiliateId) => {
  const normalizedId =
    typeof affiliateId === "string" && affiliateId.trim().length ? affiliateId.trim() : null;
  let finalAffiliateId = normalizedId;

  if (!finalAffiliateId) {
    const mainAffiliate = await findMainAffiliateFallback();
    if (!mainAffiliate?.id) {
      return {
        error:
          "Afiliado obrigatório. Não foi possível encontrar afiliado principal de fallback.",
      };
    }
    finalAffiliateId = mainAffiliate.id;
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

    if (!name || !email || !whatsapp || !affiliate_id || !plan_type) {
      return res.status(400).json({
        error: "name, email, whatsapp, affiliate_id e plan_type são obrigatórios.",
      });
    }

    const rawEmail = String(email || "").trim().toLowerCase();
    const rawUsername = String(username || rawEmail).trim();
    const normalizedRole = String(role || "user").trim().toLowerCase() || "user";

    const isUuid =
      typeof affiliate_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        affiliate_id.trim()
      );

    if (!isUuid) {
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
    let incomingAffiliateId =
      typeof affiliate_id === "string" && affiliate_id.trim().length ? affiliate_id.trim() : null;

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

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      name,
      username: rawUsername,
      email: rawEmail,
      whatsapp,
      role: normalizedRole,
      billing_status: "active",
      billing_due_day: BILLING_DEFAULT_DUE_DAY,
      affiliate_id: affiliate.id,
      affiliate_code: affiliate.code || null,
      plan_type: finalPlanType,
      plan_start_date: planStartDate,
      plan_end_date: planEndDate,
      trial_start_at: trialStartIso,
      trial_end_at: trialEndIso,
      trial_status: finalPlanType === USER_PLAN_TYPES.TRIAL ? "trial" : null,
      trial_notified_at: null,
      subscription_status: "active",
    });

    if (profileError) {
      console.error("Erro ao gravar em profiles:", profileError);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: buildApiErrorMessage(profileError) });
    }

    return res.json({ success: true, id: userId });
  } catch (err) {
    console.error("Erro inesperado em /create-user:", err);
    return res.status(isPermissionError(err) ? 403 : 500).json({ error: buildApiErrorMessage(err) });
  }
});

const authenticateRequest = async (req, res, { requireAdmin = false } = {}) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer")
    ? authHeader.replace(/Bearer\s+/i, "").trim()
    : null;

  if (!token) {
    res.status(401).json({ error: "Token de acesso obrigatório" });
    return null;
  }

  const { data: requesterData, error: requesterError } =
    await supabase.auth.getUser(token);

  if (requesterError || !requesterData?.user?.id) {
    res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
    return null;
  }

  const requesterId = requesterData.user.id;

  let requesterProfile = null;
  try {
    const { data: profileAuth, error: profileAuthError } = await supabase
      .from("profiles")
      .select("role, billing_status")
      .eq("id", requesterId)
      .maybeSingle();

    if (profileAuthError && profileAuthError.code !== "42P01") {
      throw profileAuthError;
    }

    requesterProfile = profileAuth || null;
  } catch (err) {
    console.error("Erro ao validar perfil do solicitante (profiles):", err);
  }

  if (!requesterProfile) {
    try {
      const { data: profileData, error: roleError } = await supabase
        .from("profiles")
        .select("role, billing_status")
        .eq("id", requesterId)
        .maybeSingle();

      if (roleError && roleError.code !== "42P01") {
        throw roleError;
      }

      requesterProfile = profileData || null;
    } catch (err) {
      console.error("Erro ao validar perfil do solicitante:", err);
    }
  }

  if (requesterProfile?.billing_status === "inactive") {
    res.status(403).json({ error: "Conta inativa" });
    return null;
  }

  if (requireAdmin && requesterProfile?.role !== "admin") {
    res.status(403).json({ error: "Sem permissão" });
    return null;
  }

  return { userId: requesterId, profile: requesterProfile, user: requesterData.user };
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
      "id, name, email, role, billing_status, subscription_status, trial_end_at, trial_start_at, trial_status"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileAuthError && profileAuthError.code !== "PGRST116" && profileAuthError.code !== "42P01") {
    throw profileAuthError;
  }

  if (profileAuth) return profileAuth;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, email, role, billing_status, subscription_status, trial_end_at, trial_start_at, trial_status")
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

    const billingStatus = profile?.billing_status ?? null;
    const subscriptionStatus = profile?.subscription_status ?? null;
    const trialEnd = profile?.trial_end_at || profile?.trialEndAt;
    const trialActive = Boolean(trialEnd) && Date.now() < new Date(trialEnd).getTime();

    if (billingStatus === "inactive" && !trialActive) {
      return res.status(403).json({ error: "Conta inativa" });
    }

    if ((billingStatus === null || billingStatus === "pending") && !trialActive) {
      if (subscriptionStatus !== "active") {
        return res.status(403).json({ error: "Conta inativa" });
      }
    }

    const extraTrialFields = {};
    if (profile?.trial_end_at !== undefined) extraTrialFields.trial_end_at = profile.trial_end_at;
    if (profile?.trial_start_at !== undefined) {
      extraTrialFields.trial_start_at = profile.trial_start_at;
    }
    if (profile?.trial_status !== undefined) extraTrialFields.trial_status = profile.trial_status;

    return res.json({ profile, ...extraTrialFields });
  } catch (err) {
    console.error("Erro inesperado em GET /auth/profile:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.get("/admin/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao listar usuários em GET /admin/users:", error);
      return res.status(500).json({ error: buildApiErrorMessage(error) });
    }

    return res.json(users || []);
  } catch (err) {
    console.error("Erro inesperado em GET /admin/users:", err);
    return res.status(500).json({ error: "Erro interno ao listar usuários." });
  }
});

const deleteUserFlow = async (userId, authUserId) => {
  const deleteByUserId = async (tableName) => {
    const { error } = await supabase.from(tableName).delete().eq("user_id", userId);
    if (error) {
      console.error(`Erro ao limpar dados em ${tableName}:`, error);
      throw error;
    }
  };

  const { data: targetUser, error: targetUserError } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", userId)
    .single();

  if (targetUserError) {
    console.error("Erro ao buscar usuário alvo para exclusão:", targetUserError);
    throw targetUserError;
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", authUserId)
    .single();

  if (currentUserError) {
    console.error("Erro ao buscar solicitante da exclusão:", currentUserError);
    throw currentUserError;
  }

  if (targetUser?.role === "admin" && currentUser?.username !== SUPER_ADMIN_EMAIL) {
    throw new Error("ADMIN_DELETE_BLOCKED: Não é permitido excluir usuário admin");
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

  // 2) Remove profile (se existir).
  const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);
  if (profileError) {
    console.error("Erro ao deletar profile do usuário:", profileError);
    throw profileError;
  }

  // 3) Por fim, remove no Auth.
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Erro ao deletar usuário no Auth:", authError);
    throw authError;
  }

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
      message: "Usuário deletado com sucesso",
    });
  } catch (err) {
    console.error("Erro geral ao deletar usuário:", err);
    return res.status(500).json({
      error: err.message || "Erro ao deletar usuário",
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
      message: "Usuário deletado com sucesso",
    });
  } catch (err) {
    console.error("Erro geral ao deletar usuário:", err);
    return res.status(500).json({
      error: err.message || "Erro ao deletar usuário",
    });
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

    const { error: upProfileErr } = await supabase
      .from("profiles")
      .update({
        name: trimmedName,
        email: trimmedEmail,
        username: trimmedEmail,
        whatsapp: typeof whatsapp === "string" ? whatsapp : null,
        role: typeof role === "string" ? role : undefined,
        affiliate_id: affiliate.id,
        affiliate_code: affiliate.code || null,
        plan_type: normalizedPlanType,
        plan_start_date: planStartDate,
        plan_end_date: planEndDate,
        trial_start_at: trialStartIso,
        trial_end_at: trialEndIso,
        trial_status: normalizedPlanType === USER_PLAN_TYPES.TRIAL ? "trial" : null,
      })
      .eq("id", userId);

    if (upProfileErr) {
      console.error("Erro ao atualizar profiles:", upProfileErr);
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
        query = query.eq("trial_status", "trial");
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

    const { data: affiliates, error } = await supabase
      .from("affiliates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") return res.json([]);
      console.error("Erro ao listar affiliates:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(affiliates || []);
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
  createdAt: row.created_at,
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
      .select("id, user_id, name, muscle_group, sports, sports_list, created_at")
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
    const { userId, name, muscleGroups = [], sportsActivities = [] } = req.body || {};
    if (!userId || !name) {
      return res.status(400).json({ error: "userId e name são obrigatórios" });
    }

    const insertPayload = {
      user_id: userId,
      name,
      muscle_group: joinList(muscleGroups),
      muscle_groups: joinList(muscleGroups),
      sports: joinList(sportsActivities),
      sports_list: joinList(sportsActivities),
    };

    const { data, error } = await supabase
      .from("workout_routines")
      .insert(insertPayload)
      .select("id, user_id, name, muscle_group, sports, sports_list, created_at")
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
    const { userId, name, muscleGroups = [], sportsActivities = [] } = req.body || {};

    if (!id || !userId || !name) {
      return res.status(400).json({ error: "id, userId e name são obrigatórios" });
    }

    const updatePayload = {
      name,
      muscle_group: joinList(muscleGroups),
      muscle_groups: joinList(muscleGroups),
      sports: joinList(sportsActivities),
      sports_list: joinList(sportsActivities),
    };

    const { data, error } = await supabase
      .from("workout_routines")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, user_id, name, muscle_group, sports, sports_list, created_at")
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
  try {
    const session = req.body || {};
    if (!session.userId || !session.date || !session.name) {
      return res.status(400).json({ error: "userId, date e name são obrigatórios." });
    }

    const saved = await createWorkoutSession(session);
    return res.json(saved);
  } catch (err) {
    console.error("Erro ao registrar sessão", err);
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
    const userId = getUserIdFromRequest(req);

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

const handleBodyUpdate = async (req, res) => {
  try {
    const { user_id, weight_kg, height_cm, weight_goal, goal_type } = req.body || {};

    console.log("BODY RECEBIDO:", req.body);

    if (!user_id || !Number.isFinite(Number(weight_kg))) {
      return res.status(400).json({ error: "user_id e weight_kg são obrigatórios." });
    }

    const now = new Date();
    const brasilDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const { error: historyError } = await supabase
      .from("food_weight_history")
      .insert({
        user_id,
        weight_kg: Number(weight_kg),
        height_cm: Number.isFinite(Number(height_cm)) ? Number(height_cm) : null,
        entry_date: brasilDate.toISOString().split("T")[0],
      });

    if (historyError) {
      console.error("Erro histórico:", historyError);
      return res.status(500).json({ error: historyError.message });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        weight_goal: Number.isFinite(Number(weight_goal)) ? Number(weight_goal) : null,
        goal_type: goal_type || "maintain",
      })
      .eq("id", user_id);

    if (profileError) {
      console.error("Erro profile:", profileError);
      return res.status(500).json({ error: profileError.message });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Erro geral:", error);
    return res.status(500).json({ error: error.message });
  }
};

app.post("/body", handleBodyUpdate);
app.post("/api/body", handleBodyUpdate);

app.put("/api/food-diary/state", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req) || req.body?.userId;

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

    const saved = await saveFoodDiaryState(userId, {
      entriesByDate,
      goals,
      body,
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

app.use((err, req, res, next) => {
  console.error("ERRO GLOBAL:", err);
  res.status(500).json({ error: "Erro interno" });
});

app.listen(3001, () => {
  console.log("Backend rodando na porta 3001");
});
