import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import multer from "multer";
import { supabase } from "./supabase.js";
import foodsRouter from "./routes/foods.js";
import {
  sendWhatsAppMessage,
  startMorningAgendaScheduler,
} from "./reminders.js";
import { startDailyGoalsReminder } from "./jobs/dailyGoalsReminder.js";
import { startDailyRemindersScheduler } from "./jobs/dailyRemindersScheduler.js";
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

const BILLING_DEFAULT_DUE_DAY = 20;
const AFFILIATE_COMMISSION_CENTS = 2000;

const getCurrentPeriodMonth = (today = new Date()) =>
  new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Inicia o job de lembretes (agenda)
startMorningAgendaScheduler();
startDailyRemindersScheduler();
startDailyGoalsReminder();

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
    const {
      name,
      username,
      password,
      whatsapp,
      role,
      affiliateCode,
      apply_trial: applyTrial,
    } = req.body;

    if (!name || !username || !password) {
      return res
        .status(400)
        .json({ error: "Nome, usuário e senha são obrigatórios." });
    }

    const rawUsername = username.trim();

    const trimmedAffiliateCode = (affiliateCode || "").trim();
    let affiliate = null;

    if (trimmedAffiliateCode) {
      const { data: affiliateRow, error: affiliateError } = await supabase
        .from("affiliates")
        .select("id, code, is_active")
        .eq("code", trimmedAffiliateCode)
        .eq("is_active", true)
        .maybeSingle();

      if (affiliateError) {
        console.error("Erro ao buscar afiliado:", affiliateError);
        return res.status(400).json({ error: affiliateError.message });
      }

      if (!affiliateRow) {
        return res.status(400).json({ error: "Código de afiliado inválido" });
      }

      affiliate = affiliateRow;
    }

    // Se o "username" já for um e-mail válido, usa ele direto.
    // Senão, gera um e-mail fake tipo fulano@example.com
    let email;
    if (rawUsername.includes("@") && rawUsername.includes(".")) {
      email = rawUsername.toLowerCase();
    } else {
      const cleanUsername = rawUsername
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      if (!cleanUsername) {
        return res.status(400).json({ error: "Usuário inválido." });
      }

      email = `${cleanUsername}@example.com`;
    }

    // 1) Cria usuário no Auth (Supabase)
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, role }
      });

    if (authError) {
      console.error("Erro ao criar usuário no Auth:", authError);
      return res.status(400).json({ error: authError.message });
    }

    const userId = authUser.user.id;

    // 2) Grava em profiles
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        name,
        username: rawUsername,
        whatsapp,
        role,
        billing_status: "active",
        billing_due_day: BILLING_DEFAULT_DUE_DAY,
      });

    if (profileError) {
      console.error("Erro ao gravar em profiles:", profileError);
      return res.status(400).json({ error: profileError.message });
    }

    // 3) Grava em profiles_auth
    const nowIso = new Date().toISOString();
    const trialEndIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: authTableError } = await supabase
      .from("profiles_auth")
      .insert({
        auth_id: userId,
        name,
        role,
        email,
        username: rawUsername,
        whatsapp,
        billing_status: "active",
        billing_due_day: BILLING_DEFAULT_DUE_DAY,
        affiliate_id: affiliate?.id || null,
        affiliate_code: affiliate?.code || null,
        ...(applyTrial
          ? {
              trial_start_at: nowIso,
              trial_end_at: trialEndIso,
              trial_status: "trial",
              trial_notified_at: null,
              subscription_status: "active",
            }
          : {}),
      });

    if (authTableError) {
      console.error("Erro ao gravar em profiles_auth:", authTableError);
      return res.status(400).json({ error: authTableError.message });
    }

    return res.json({ success: true, id: userId });
  } catch (err) {
    console.error("Erro inesperado em /create-user:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
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

  if (!requesterProfile) {
    try {
      const { data: profileAuth, error: profileAuthError } = await supabase
        .from("profiles_auth")
        .select("role, billing_status")
        .or(`auth_id.eq.${requesterId},id.eq.${requesterId}`)
        .maybeSingle();

      if (profileAuthError && profileAuthError.code !== "42P01") {
        throw profileAuthError;
      }

      requesterProfile = profileAuth || null;
    } catch (err) {
      console.error("Erro ao validar perfil do solicitante (profiles_auth):", err);
    }
  }

  if (requesterProfile?.billing_status === "inactive") {
    res.status(403).json({ error: "Conta inativa" });
    return null;
  }

  if (requireAdmin && requesterProfile?.role !== "admin") {
    res.status(403).json({ error: "Apenas admins podem acessar." });
    return null;
  }

  return { userId: requesterId, profile: requesterProfile };
};

const fetchProfileWithBilling = async (userId) => {
  const { data: profileAuth, error: profileAuthError } = await supabase
    .from("profiles_auth")
    .select("*")
    .or(`auth_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  if (profileAuthError && profileAuthError.code !== "PGRST116" && profileAuthError.code !== "42P01") {
    throw profileAuthError;
  }

  if (profileAuth) return profileAuth;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("*")
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

app.delete("/admin/users/:userId", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    try {
      const { error: deleteProfileAuthError } = await supabase
        .from("profiles_auth")
        .delete()
        .or(`auth_id.eq.${userId},id.eq.${userId}`);

      if (deleteProfileAuthError && deleteProfileAuthError.code !== "42P01") {
        console.error("Erro ao remover profiles_auth:", deleteProfileAuthError);
        return res.status(500).json({ error: "Falha ao excluir usuário." });
      }
    } catch (profileAuthTableError) {
      if (profileAuthTableError?.code !== "42P01") {
        console.error("Erro inesperado em profiles_auth:", profileAuthTableError);
        return res.status(500).json({ error: "Falha ao excluir usuário." });
      }
    }

    const { error: deleteProfileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (deleteProfileError && deleteProfileError.code !== "PGRST116") {
      console.error("Erro ao remover profiles:", deleteProfileError);
      return res.status(500).json({ error: "Falha ao excluir usuário." });
    }

    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (adminError) {
      console.warn("Não foi possível remover usuário do Supabase Auth:", adminError);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro inesperado em /admin/users/:userId:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
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

    const { name, username, whatsapp, role, password } = req.body || {};

    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedPassword =
      typeof password === "string" && password.trim().length ? password.trim() : "";

    if (!trimmedUsername) {
      return res.status(400).json({ error: "username (e-mail) é obrigatório" });
    }

    try {
      const updateAuthPayload = {};

      if (typeof name === "string") updateAuthPayload.name = name;
      if (trimmedUsername) {
        updateAuthPayload.username = trimmedUsername;
        updateAuthPayload.email = trimmedUsername;
      }
      if (typeof whatsapp === "string") updateAuthPayload.whatsapp = whatsapp;
      if (typeof role === "string") updateAuthPayload.role = role;

      if (Object.keys(updateAuthPayload).length) {
        const { error: upAuthErr } = await supabase
          .from("profiles_auth")
          .update(updateAuthPayload)
          .or(`auth_id.eq.${userId},id.eq.${userId}`);

        if (upAuthErr && upAuthErr.code !== "42P01") {
          console.error("Erro ao atualizar profiles_auth:", upAuthErr);
          return res.status(400).json({ error: upAuthErr.message });
        }
      }
    } catch (tableError) {
      if (tableError?.code !== "42P01") {
        console.error("Erro inesperado ao atualizar profiles_auth:", tableError);
        return res.status(400).json({ error: tableError.message });
      }
    }

    const updateProfilePayload = {};
    if (typeof name === "string") updateProfilePayload.name = name;
    if (trimmedUsername) updateProfilePayload.username = trimmedUsername;
    if (typeof whatsapp === "string") updateProfilePayload.whatsapp = whatsapp;
    if (typeof role === "string") updateProfilePayload.role = role;

    const { error: upProfileErr } = await supabase
      .from("profiles")
      .update(updateProfilePayload)
      .eq("id", userId);

    if (upProfileErr) {
      console.error("Erro ao atualizar profiles:", upProfileErr);
      return res.status(400).json({ error: upProfileErr.message });
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
      console.error("Erro ao atualizar usuário no Auth:", authUpdateError);
      return res.status(400).json({ error: authUpdateError.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro inesperado em PUT /admin/users/:userId:", err);
    return res.status(500).json({ error: "Erro interno ao editar usuário." });
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
      .from("profiles_auth")
      .update(authUpdates)
      .or(`auth_id.eq.${authId},id.eq.${authId}`);

    if (authErr && authErr.code !== "42P01") {
      console.error("Erro ao atualizar billing em profiles_auth:", authErr);
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
        .from("profiles_auth")
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
      "auth_id, whatsapp, role, billing_status, trial_status, trial_end_at",
      "auth_id, whatsapp, role",
      "auth_id, whatsapp",
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
          auth_id: user.auth_id,
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

    const { data: affiliates, error: affiliatesError } = await supabase
      .from("affiliates")
      .select("*")
      .order("created_at", { ascending: false });

    if (affiliatesError) {
      if (affiliatesError.code === "42P01") return res.json([]);
      console.error("Erro ao listar affiliates:", affiliatesError);
      return res.status(400).json({ error: affiliatesError.message });
    }

    const currentPeriodMonth = getCurrentPeriodMonth();
    let payoutMap = new Map();
    try {
      const { data: payoutRows, error: payoutErr } = await supabase
        .from("affiliate_payouts")
        .select("affiliate_id, period_month, paid_at, amount_cents")
        .eq("period_month", currentPeriodMonth);

      if (payoutErr && payoutErr.code !== "42P01") {
        throw payoutErr;
      }

      payoutMap = new Map((payoutRows || []).map((row) => [row.affiliate_id, row]));
    } catch (err) {
      console.error("Erro ao buscar pagamentos de afiliados:", err);
    }

    let profiles = [];
    try {
      const { data: profileRows, error: profileErr } = await supabase
        .from("profiles_auth")
        .select("affiliate_id, subscription_status, billing_status")
        .not("affiliate_id", "is", null);

      if (profileErr && profileErr.code !== "42P01") {
        throw profileErr;
      }

      profiles = profileRows || [];
    } catch (err) {
      console.error("Erro ao buscar perfis de afiliados:", err);
    }

    const counts = profiles.reduce((acc, row) => {
      if (!row.affiliate_id) return acc;

      const sub = (row.subscription_status || "").toLowerCase();
      const bill = (row.billing_status || "").toLowerCase();
      const status = sub || bill;
      const isActive = status !== "inactive";

      const current = acc.get(row.affiliate_id) || {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
      };

      current.totalClients += 1;
      if (isActive) {
        current.activeClients += 1;
      } else {
        current.inactiveClients += 1;
      }

      acc.set(row.affiliate_id, current);
      return acc;
    }, new Map());

    const response = (affiliates || []).map((affiliate) => {
      const stat =
        counts.get(affiliate.id) ||
        { totalClients: 0, activeClients: 0, inactiveClients: 0 };

      const activeClients = stat.activeClients || 0;
      const inactiveClients = stat.inactiveClients || 0;
      const totalClients = stat.totalClients || 0;

      const commissionMonthCents = activeClients * AFFILIATE_COMMISSION_CENTS;
      const payoutRow = payoutMap.get(affiliate.id) || null;
      const payoutStatus = payoutRow?.paid_at ? "PAGO" : "PENDENTE";
      const currentPayoutStatus = payoutRow?.paid_at ? "paid" : "pending";
      const payoutPeriod = payoutRow?.period_month || currentPeriodMonth;

      return {
        ...affiliate,
        total_users: totalClients,
        active_users: activeClients,
        inactive_users: inactiveClients,
        active_clients_count: activeClients,
        inactive_clients_count: inactiveClients,
        active_paid_clients_count: activeClients,
        pending_users: inactiveClients,
        commission_month_cents: commissionMonthCents,
        current_payout_status: currentPayoutStatus,
        current_payout_period: payoutPeriod,
        current_payout_paid_at: payoutRow?.paid_at || null,
        payout_status_month_current: currentPayoutStatus,
        payout_ref: payoutPeriod.slice(0, 7),
        payout_status: payoutStatus,
      };
    });

    return res.json(response);
  } catch (err) {
    console.error("Erro inesperado em GET /admin/affiliates:", err);
    return res.status(500).json({ error: "Erro interno ao listar afiliados." });
  }
});

app.post("/admin/affiliates", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { code, name, whatsapp, email, pix_key, commission_cents } = req.body || {};

    if (!code || !name) {
      return res.status(400).json({ error: "code e name são obrigatórios" });
    }

    const payload = {
      code: String(code).trim(),
      name: String(name).trim(),
      whatsapp: whatsapp || null,
      email: email || null,
      pix_key: pix_key || null,
    };

    if (commission_cents !== undefined && commission_cents !== null && commission_cents !== "") {
      payload.commission_cents = Number(commission_cents);
    } else {
      payload.commission_cents = 2000;
    }

    const { data, error } = await supabase
      .from("affiliates")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erro ao criar affiliate:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error("Erro inesperado em POST /admin/affiliates:", err);
    return res.status(500).json({ error: "Erro interno ao criar afiliado." });
  }
});

app.patch("/admin/affiliates/:id", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id é obrigatório" });

    const allowedFields = [
      "code",
      "name",
      "whatsapp",
      "email",
      "pix_key",
      "commission_cents",
      "is_active",
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body?.[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "Nenhuma atualização enviada" });
    }

    const { data, error } = await supabase
      .from("affiliates")
      .update(updates)
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

app.get("/admin/affiliates/:id/users", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id é obrigatório" });

    const { data, error } = await supabase
      .from("profiles_auth")
      .select(
        "id, auth_id, name, username, email, whatsapp, subscription_status, billing_status, affiliate_id, affiliate_code, created_at"
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
        billing_status: normalizedStatus,
        status: normalizedStatus,
        is_active: normalizedStatus === "active",
      };
    });

    const totalCommissionCents = normalizedUsers.filter((user) => user.is_active).length * AFFILIATE_COMMISSION_CENTS;

    return res.json({ users: normalizedUsers, total_commission_cents: totalCommissionCents });
  } catch (err) {
    console.error("Erro inesperado em GET /admin/affiliates/:id/users:", err);
    return res.status(500).json({ error: "Erro interno ao listar usuários do afiliado." });
  }
});

app.post("/admin/affiliates/:id/payouts/mark-paid", async (req, res) => {
  try {
    const authData = await authenticateRequest(req, res, { requireAdmin: true });
    if (!authData) return;

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "id é obrigatório" });
    }

    const monthStart = getCurrentPeriodMonth();

    const { data: affiliate, error: affiliateError } = await supabase
      .from("affiliates")
      .select("id, commission_cents")
      .eq("id", id)
      .maybeSingle();

    if (affiliateError) {
      console.error("Erro ao buscar afiliado:", affiliateError);
      return res.status(400).json({ error: affiliateError.message });
    }

    if (!affiliate) {
      return res.status(404).json({ error: "Afiliado não encontrado" });
    }

    const { data: affiliateUsers, error: usersError } = await supabase
      .from("profiles_auth")
      .select("billing_status")
      .eq("affiliate_id", id);

    if (usersError && usersError.code !== "42P01") {
      console.error("Erro ao contar usuários do afiliado:", usersError);
      return res.status(400).json({ error: usersError.message });
    }

    const activeUsers = (affiliateUsers || []).filter(
      (user) => (user.billing_status || "").toLowerCase() !== "inactive"
    ).length;

    const amountCents = activeUsers * AFFILIATE_COMMISSION_CENTS;
    const paidAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("affiliate_payouts")
      .upsert(
        {
          affiliate_id: id,
          period_month: monthStart,
          amount_cents: amountCents,
          paid_at: paidAt,
        },
        { onConflict: "affiliate_id,period_month" }
      )
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Erro ao registrar pagamento de afiliado:", error);
      return res.status(400).json({ error: error.message });
    }

    const payoutRef = (data?.period_month || monthStart).slice(0, 7);

    return res.json({
      ok: true,
      payout: data,
      payout_status: "PAGO",
      payout_ref: payoutRef,
      payout_status_month_current: "paid",
      current_period_month: monthStart,
    });
  } catch (err) {
    console.error("Erro inesperado em POST /admin/affiliates/:id/payouts/mark-paid:", err);
    return res.status(500).json({ error: "Erro interno ao registrar pagamento." });
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
      .maybeSingle();

    if (affiliateError) {
      console.error("Erro ao buscar affiliate:", affiliateError);
      return res.status(400).json({ error: affiliateError.message });
    }

    if (!affiliate || affiliate.is_active === false) {
      return res.status(400).json({ error: "Código de afiliado inválido ou inativo." });
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles_auth")
      .select("id, auth_id, affiliate_id")
      .or(`auth_id.eq.${authData.userId},id.eq.${authData.userId}`)
      .maybeSingle();

    if (profileErr) {
      console.error("Erro ao verificar perfil para affiliate:", profileErr);
      return res.status(400).json({ error: profileErr.message });
    }

    if (profileRow?.affiliate_id) {
      return res.status(400).json({ error: "Usuário já possui afiliado vinculado." });
    }

    const { error: updateErr } = await supabase
      .from("profiles_auth")
      .update({ affiliate_id: affiliate.id, affiliate_code: affiliate.code })
      .or(`auth_id.eq.${authData.userId},id.eq.${authData.userId}`);

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

app.listen(3001, () => {
  console.log("Backend rodando na porta 3001");
});
