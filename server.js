// server.js
// API Gestão Pessoal - servidor HTTP nativo com armazenamento via PostgreSQL
// Tabelas: users, transactions (ganhos/gastos), events (agenda) e logs de notificações

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os'); // (apenas para log do IP LAN)
const crypto = require('crypto');

const { loadEnv } = require('./lib/env');
const { createNotificationsManager } = require('./lib/notifications');
const { prisma, connectPrisma, disconnectPrisma } = require('./db/client');

// Carrega variáveis de ambiente simples de um arquivo .env, caso exista
loadEnv(__dirname);

const appName = 'gestao-pessoal';
const appVersion = '1.0.0';

const DEFAULT_ADMIN = {
  id: 'admin-felipe',
  username: 'felipeadm',
  password: '1234',
  name: 'Administrador',
  whatsapp: '+5500000000000'
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return { salt, passwordHash: hash };
};

const verifyPassword = (password, user) => {
  if (!user?.passwordHash || !user?.salt) return false;
  const candidate = crypto
    .createHash('sha256')
    .update(`${user.salt}:${password}`)
    .digest('hex');
  if (candidate.length !== user.passwordHash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'));
  } catch {
    return false;
  }
};

// Campos reservados que não podem ser sobrescritos via "extras"
const RESERVED_USER_FIELDS = new Set([
  'id',
  'username',
  'role',
  'name',
  'createdAt',
  'updatedAt',
  'salt',
  'passwordHash'
]);

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.toString().trim();
  return normalized ? normalized : null;
};

// Aplica campos extras ao usuário, ignorando os reservados
const applyUserExtras = (target, extra) => {
  if (!extra || typeof extra !== 'object') return;
  Object.entries(extra).forEach(([key, value]) => {
    if (!key || RESERVED_USER_FIELDS.has(key)) return;
    if (value === undefined) return;
    const prepared = typeof value === 'string' ? normalizeOptionalString(value) : value;
    if (prepared === undefined) return;
    if (prepared === null) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        delete target[key];
      }
      return;
    }
    target[key] = prepared;
  });
};

const buildExtrasPayload = (extra) => {
  const payload = {};
  applyUserExtras(payload, extra);
  return payload;
};

const toISOStringOrNull = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, salt, extra, createdAt, updatedAt, ...rest } = user;
  const safe = { ...rest };
  safe.createdAt = toISOStringOrNull(createdAt);
  safe.updatedAt = toISOStringOrNull(updatedAt);
  if (typeof safe.whatsapp === 'string') {
    const trimmed = safe.whatsapp.trim();
    safe.whatsapp = trimmed || null;
  } else {
    safe.whatsapp = null;
  }

  if (extra && typeof extra === 'object') {
    Object.entries(extra).forEach(([key, value]) => {
      if (value === undefined) return;
      if (value === null) {
        if (Object.prototype.hasOwnProperty.call(safe, key)) delete safe[key];
      } else {
        safe[key] = value;
      }
    });
  }

  return safe;
};

const ensureDefaultAdmin = async () => {
  const existing = await prisma.user.findUnique({
    where: { username: DEFAULT_ADMIN.username }
  });

  if (!existing) {
    const { salt, passwordHash } = hashPassword(DEFAULT_ADMIN.password);
    return prisma.user.create({
      data: {
        id: DEFAULT_ADMIN.id,
        username: DEFAULT_ADMIN.username,
        role: 'admin',
        name: DEFAULT_ADMIN.name,
        whatsapp: DEFAULT_ADMIN.whatsapp,
        salt,
        passwordHash,
        extra: {}
      }
    });
  }

  const updates = {};
  if (!existing.whatsapp) updates.whatsapp = DEFAULT_ADMIN.whatsapp;
  if (!existing.name) updates.name = DEFAULT_ADMIN.name;
  if (existing.role !== 'admin') updates.role = 'admin';

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  updates.updatedAt = new Date();
  return prisma.user.update({ where: { id: existing.id }, data: updates });
};

const isValidWhatsapp = (value) =>
  typeof value === 'string' && /^\+\d{6,15}$/.test(value);

// Criação de usuário com validação de WhatsApp + campos extras
const createUser = async ({ username, password, role = 'user', name = null, whatsapp, ...extra }) => {
  if (!username || typeof username !== 'string') {
    throw new Error('username obrigatório');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('password obrigatório');
  }
  if (!whatsapp || typeof whatsapp !== 'string') {
    throw new Error('whatsapp obrigatório');
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    throw new Error('username obrigatório');
  }

  const trimmedWhatsapp = whatsapp.trim();
  if (!isValidWhatsapp(trimmedWhatsapp)) {
    throw new Error('whatsapp inválido');
  }

  const existing = await prisma.user.findFirst({
    where: {
      username: {
        equals: normalizedUsername,
        mode: 'insensitive'
      }
    }
  });

  if (existing) {
    throw new Error('Usuário já existe');
  }

  const { salt, passwordHash } = hashPassword(password);
  const normalizedName = normalizeOptionalString(name);
  const extras = buildExtrasPayload(extra);

  return prisma.user.create({
    data: {
      id: uid(),
      username: username.trim(),
      role,
      name: normalizedName ?? null,
      whatsapp: trimmedWhatsapp,
      salt,
      passwordHash,
      extra: extras
    }
  });
};

const createPrefixedLogger = (prefix) => ({
  info: (...args) => console.log(new Date().toISOString(), `[${prefix}]`, ...args),
  warn: (...args) => console.warn(new Date().toISOString(), `[${prefix}]`, ...args),
  error: (...args) => console.error(new Date().toISOString(), `[${prefix}]`, ...args)
});

const notificationsLogger = createPrefixedLogger('notifications');

const notificationsConfig = {
  enabled: process.env.WHATSAPP_NOTIFICATIONS_ENABLED !== 'false',
  accountSid: process.env.TWILIO_ACCOUNT_SID || null,
  authToken: process.env.TWILIO_AUTH_TOKEN || null,
  from: process.env.TWILIO_WHATSAPP_FROM || null,
  recipients: (process.env.TWILIO_WHATSAPP_TO || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  timezone: process.env.NOTIFICATIONS_TIMEZONE || 'UTC'
};

const notificationsCache = {
  users: new Map()
};

const notificationsManager = createNotificationsManager({
  getEvents: async () => {
    const events = await prisma.event.findMany({
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            name: true
          }
        }
      }
    });

    notificationsCache.users.clear();
    events.forEach((event) => {
      if (event.owner) {
        notificationsCache.users.set(event.owner.id, {
          id: event.owner.id,
          username: event.owner.username,
          name: event.owner.name
        });
      }
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      notes: event.notes,
      ownerId: event.ownerId,
      ownerName: event.owner
        ? event.owner.name || event.owner.username || event.owner.id
        : null
    }));
  },
  getUserById: (id) => notificationsCache.users.get(id),
  logger: notificationsLogger,
  config: notificationsConfig
});

const recordNotificationAttempt = async (result) => {
  try {
    await prisma.notificationLog.create({
      data: {
        reason: result.reason || 'unknown',
        referenceDate: new Date(result.referenceDate || new Date().toISOString()),
        todayDate: result.todayDate || null,
        upcomingDate: result.upcomingDate || null,
        todayCount: result.counts?.today ?? 0,
        upcomingCount: result.counts?.upcoming ?? 0,
        dryRun: Boolean(result.dryRun),
        providerReady: Boolean(result.providerReady),
        sent: Boolean(result.sent),
        status: result.error
          ? 'error'
          : result.sent
          ? 'sent'
          : result.warning
          ? 'warning'
          : 'skipped',
        warning: result.warning || null,
        error: result.error || null,
        recipients: Array.isArray(result.recipients) ? result.recipients : null,
        message: result.message || null
      }
    });
  } catch (err) {
    notificationsLogger.error('Falha ao registrar log de notificação:', err);
  }
};

const parseDailySchedule = (expression) => {
  const fallback = { hour: 8, minute: 0, raw: '0 8 * * *' };
  if (!expression || typeof expression !== 'string') return fallback;

  const trimmed = expression.trim();
  if (!trimmed) return fallback;

  const cronParts = trimmed.split(/\s+/);
  if (cronParts.length >= 2 && /^\d+$/.test(cronParts[0]) && /^\d+$/.test(cronParts[1])) {
    const minute = Math.max(0, Math.min(59, parseInt(cronParts[0], 10)));
    const hour = Math.max(0, Math.min(23, parseInt(cronParts[1], 10)));
    return { hour, minute, raw: trimmed };
  }

  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (timeMatch) {
    const hour = Math.max(0, Math.min(23, parseInt(timeMatch[1], 10)));
    const minute = Math.max(0, Math.min(59, parseInt(timeMatch[2], 10)));
    return { hour, minute, raw: trimmed };
  }

  notificationsLogger.warn(
    `Expressão de agendamento inválida (${trimmed}). Utilizando padrão diário às 08:00.`
  );
  return fallback;
};

const scheduleDailyNotifications = ({ hour, minute }) => {
  const computeDelay = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    const delay = computeDelay();
    const nextRun = new Date(Date.now() + delay);
    notificationsLogger.info(
      `Próxima avaliação automática programada para ${nextRun.toISOString()}.`
    );

    const timer = setTimeout(async () => {
      try {
        const result = await notificationsManager.sendNotifications({ reason: 'scheduled-daily' });
        await recordNotificationAttempt(result);
        if (result.error) {
          notificationsLogger.error('Falha ao enviar notificações agendadas:', result.error);
        } else if (result.sent) {
          notificationsLogger.info(
            `Notificações enviadas para ${
              Array.isArray(result.recipients) ? result.recipients.join(', ') : 'destinatários não informados'
            }.`
          );
        } else {
          notificationsLogger.info(
            `Execução diária concluída sem envio. ${
              result.warning ? `Motivo: ${result.warning}` : ''
            }`.trim()
          );
        }
      } catch (err) {
        notificationsLogger.error(
          'Erro inesperado durante tarefa agendada de notificações:',
          err
        );
      }

      scheduleNext();
    }, delay);

    if (typeof timer.unref === 'function') timer.unref();
  };

  scheduleNext();
};

const notificationsScheduleExpression =
  process.env.NOTIFICATIONS_CRON_EXPRESSION || '0 8 * * *';
const scheduleConfig = parseDailySchedule(notificationsScheduleExpression);
const timezoneLabel = notificationsManager.getTimezone();

notificationsLogger.info(
  `Agendador diário configurado para ${String(scheduleConfig.hour).padStart(2, '0')}:${String(
    scheduleConfig.minute
  ).padStart(2, '0')} (${notificationsScheduleExpression}).${
    timezoneLabel ? ` Timezone informado: ${timezoneLabel}.` : ''
  }`
);

const isValidTransactionType = (type) => type === 'income' || type === 'expense';

const mapTransactionRecord = (record) => ({
  id: record.id,
  type: record.type,
  amount: typeof record.amount === 'number' ? record.amount : Number(record.amount),
  description: record.description ?? null,
  category: record.category ?? null,
  date: record.date,
  ownerId: record.ownerId
});

const mapEventRecord = (record) => ({
  id: record.id,
  title: record.title,
  date: record.date,
  start_time: record.start_time ?? null,
  end_time: record.end_time ?? null,
  notes: record.notes ?? null,
  ownerId: record.ownerId
});

const filterTransactions = async ({ from, to, type, q, ownerId } = {}) => {
  const normalizedType = isValidTransactionType(type) ? type : null;
  const query = q ? q.toString() : null;

  const where = { ownerId };

  if (normalizedType) where.type = normalizedType;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }
  if (query) {
    where.OR = [
      { description: { contains: query, mode: 'insensitive' } },
      { category: { contains: query, mode: 'insensitive' } }
    ];
  }

  const records = await prisma.transaction.findMany({
    where,
    orderBy: [
      { date: 'desc' },
      { id: 'desc' }
    ]
  });

  return records.map(mapTransactionRecord);
};

const filterEvents = async ({ from, to, q, ownerId } = {}) => {
  const query = q ? q.toString() : null;

  const where = { ownerId };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }
  if (query) {
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { notes: { contains: query, mode: 'insensitive' } }
    ];
  }

  const records = await prisma.event.findMany({
    where,
    orderBy: [
      { date: 'desc' },
      { start_time: 'asc' },
      { id: 'asc' }
    ]
  });

  return records.map(mapEventRecord);
};

// uid simples estilo nanoid
function cryptoRandomId(len = 21) {
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  let id = '';
  for (let i = 0; i < len; i++)
    id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
const uid = () => cryptoRandomId();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

const publicDir = path.join(__dirname, 'public');

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
};

const sendNoContent = (res) => {
  res.writeHead(204);
  res.end();
};

const sendNotFound = (res) => sendJson(res, 404, { error: 'Não encontrado' });

const sendMethodNotAllowed = (res, allowed) => {
  res.writeHead(405, {
    'Content-Type': 'application/json; charset=utf-8',
    Allow: allowed.join(', ')
  });
  res.end(JSON.stringify({ error: 'Método não permitido' }));
};

const readJsonBody = (req) =>
  new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (value) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        safeResolve({ ok: false, error: 'Payload muito grande' });
        req.destroy();
      }
    });
    req.on('end', () => {
      if (resolved) return;
      if (!body) {
        safeResolve({ ok: true, value: {} });
        return;
      }
      try {
        safeResolve({ ok: true, value: JSON.parse(body) });
      } catch {
        safeResolve({ ok: false, error: 'JSON inválido' });
      }
    });
    req.on('error', () => {
      safeResolve({ ok: false, error: 'Erro ao ler corpo da requisição' });
    });
  });

const serveStatic = (req, res, pathname) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let relativePath = pathname;
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

  try {
    const decodedPath = decodeURIComponent(relativePath);
    const resolvedPath = path.resolve(publicDir, '.' + decodedPath);
    if (!resolvedPath.startsWith(publicDir)) return false;
    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) return false;

    const ext = path.extname(resolvedPath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    const stat = fs.statSync(resolvedPath);
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);

    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    fs.createReadStream(resolvedPath).pipe(res);
    return true;
  } catch (err) {
    console.error('Erro ao servir arquivo estático:', err);
    return false;
  }
};

const buildQueryObject = (searchParams) => {
  const result = {};
  for (const [key, value] of searchParams.entries()) {
    if (result[key] === undefined) result[key] = value;
  }
  return result;
};

const activeTokens = new Map();

const issueToken = (userId) => {
  const token = uid();
  activeTokens.set(token, { userId, issuedAt: Date.now() });
  return token;
};

const revokeToken = (token) => {
  if (token) activeTokens.delete(token);
};

const getUserFromAuthHeader = async (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (!token) return null;
  const session = activeTokens.get(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    activeTokens.delete(token);
    return null;
  }
  return { user: sanitizeUser(user), token };
};

const ensureAuthenticated = async (req, res) => {
  const auth = await getUserFromAuthHeader(req);
  if (!auth) {
    sendJson(res, 401, { error: 'Não autorizado' });
    return null;
  }
  return auth;
};

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (err) {
    console.error('URL inválida recebida:', req.url, err);
    sendJson(res, 400, { error: 'URL inválida' });
    return;
  }

  const pathname = parsedUrl.pathname;
  const segments = pathname.split('/').filter(Boolean);

  try {
    if (segments[0] === 'api') {
      await handleApiRequest(req, res, segments, parsedUrl.searchParams);
      return;
    }

    const served = serveStatic(req, res, pathname);
    if (served) return;

    if (pathname === '/' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, name: appName, version: appVersion });
      return;
    }

    sendNotFound(res);
  } catch (err) {
    console.error('Erro inesperado:', err);
    sendJson(res, 500, { error: 'Erro interno do servidor' });
  }
});

const handleApiRequest = async (req, res, segments, searchParams) => {
  const resource = segments[1];

  if (resource === 'transactions') {
    const auth = await ensureAuthenticated(req, res);
    if (!auth) return;
    await handleTransactionsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'events') {
    const auth = await ensureAuthenticated(req, res);
    if (!auth) return;
    await handleEventsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'notifications') {
    const auth = await ensureAuthenticated(req, res);
    if (!auth) return;
    await handleNotificationsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'users') {
    const auth = await ensureAuthenticated(req, res);
    if (!auth) return;
    await handleUsersRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'auth') {
    await handleAuthRoutes(req, res, segments.slice(2));
    return;
  }

  if (resource === 'health' && segments.length === 2) {
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res, ['GET']);
      return;
    }
    const transactionsCount = await prisma.transaction.count();
    sendJson(res, 200, { ok: true, totals: { transactions: transactionsCount } });
    return;
  }

  sendNotFound(res);
};

const handleTransactionsRoutes = async (req, res, subSegments, searchParams, user) => {
  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const rows = await filterTransactions({
          ...buildQueryObject(searchParams),
          ownerId: user.id
        });
        sendJson(res, 200, rows);
      } catch (err) {
        console.error('Erro ao listar transações:', err);
        sendJson(res, 500, { error: 'Erro ao listar transações' });
      }
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      try {
        const { type, amount, description = null, category = null, date } = body.value || {};
        if (!type || !isValidTransactionType(type)) {
          sendJson(res, 400, { error: 'type inválido' });
          return;
        }
        if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
          sendJson(res, 400, { error: 'amount inválido' });
          return;
        }
        if (!date) {
          sendJson(res, 400, { error: 'date obrigatório (yyyy-mm-dd)' });
          return;
        }

        const created = await prisma.transaction.create({
          data: {
            id: uid(),
            type,
            amount,
            description,
            category,
            date,
            ownerId: user.id
          }
        });

        sendJson(res, 201, mapTransactionRecord(created));
      } catch (err) {
        console.error('Erro ao criar transação:', err);
        sendJson(res, 500, { error: 'Erro ao criar transação' });
      }
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (subSegments.length === 1 && subSegments[0] === 'summary') {
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res, ['GET']);
      return;
    }

    try {
      const { from, to } = buildQueryObject(searchParams);
      const filtered = await filterTransactions({ from, to, ownerId: user.id });
      const income = filtered
        .filter((tx) => tx.type === 'income')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const expense = filtered
        .filter((tx) => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0);

      sendJson(res, 200, { income, expense, balance: income - expense });
    } catch (err) {
      console.error('Erro ao calcular resumo de transações:', err);
      sendJson(res, 500, { error: 'Erro ao calcular resumo' });
    }
    return;
  }

  if (subSegments.length === 1) {
    const id = decodeURIComponent(subSegments[0]);

    if (req.method === 'GET') {
      const record = await prisma.transaction.findUnique({ where: { id } });
      if (!record || record.ownerId !== user.id) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, mapTransactionRecord(record));
      return;
    }

    if (req.method === 'PATCH') {
      const record = await prisma.transaction.findUnique({ where: { id } });
      if (!record || record.ownerId !== user.id) {
        sendNotFound(res);
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      const payload = body.value || {};
      const nextType = payload.type !== undefined ? payload.type : record.type;
      if (!isValidTransactionType(nextType)) {
        sendJson(res, 400, { error: 'type inválido' });
        return;
      }

      const nextAmount =
        payload.amount !== undefined ? Number(payload.amount) : record.amount;
      if (Number.isNaN(nextAmount) || nextAmount < 0) {
        sendJson(res, 400, { error: 'amount inválido' });
        return;
      }

      const nextDate = payload.date !== undefined ? payload.date : record.date;
      if (!nextDate) {
        sendJson(res, 400, { error: 'date obrigatório' });
        return;
      }

      try {
        const updated = await prisma.transaction.update({
          where: { id },
          data: {
            type: nextType,
            amount: nextAmount,
            description:
              payload.description !== undefined ? payload.description : record.description,
            category:
              payload.category !== undefined ? payload.category : record.category,
            date: nextDate
          }
        });

        sendJson(res, 200, mapTransactionRecord(updated));
      } catch (err) {
        console.error('Erro ao atualizar transação:', err);
        sendJson(res, 500, { error: 'Erro ao atualizar transação' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      try {
        const result = await prisma.transaction.deleteMany({
          where: {
            id,
            ownerId: user.id
          }
        });

        if (result.count === 0) {
          sendNotFound(res);
          return;
        }

        sendNoContent(res);
      } catch (err) {
        console.error('Erro ao remover transação:', err);
        sendJson(res, 500, { error: 'Erro ao remover transação' });
      }
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
    return;
  }

  sendNotFound(res);
};

const handleEventsRoutes = async (req, res, subSegments, searchParams, user) => {
  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const rows = await filterEvents({
          ...buildQueryObject(searchParams),
          ownerId: user.id
        });
        sendJson(res, 200, rows);
      } catch (err) {
        console.error('Erro ao listar eventos:', err);
        sendJson(res, 500, { error: 'Erro ao listar eventos' });
      }
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      try {
        const { title, date, start_time = null, end_time = null, notes = null } = body.value || {};
        if (!title) {
          sendJson(res, 400, { error: 'title obrigatório' });
          return;
        }
        if (!date) {
          sendJson(res, 400, { error: 'date obrigatório (yyyy-mm-dd)' });
          return;
        }

        const created = await prisma.event.create({
          data: {
            id: uid(),
            title,
            date,
            start_time,
            end_time,
            notes,
            ownerId: user.id
          }
        });

        sendJson(res, 201, mapEventRecord(created));
      } catch (err) {
        console.error('Erro ao criar evento:', err);
        sendJson(res, 500, { error: 'Erro ao criar evento' });
      }
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (subSegments.length === 1) {
    const id = decodeURIComponent(subSegments[0]);

    if (req.method === 'GET') {
      const record = await prisma.event.findUnique({ where: { id } });
      if (!record || record.ownerId !== user.id) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, mapEventRecord(record));
      return;
    }

    if (req.method === 'PATCH') {
      const record = await prisma.event.findUnique({ where: { id } });
      if (!record || record.ownerId !== user.id) {
        sendNotFound(res);
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      const payload = body.value || {};
      const nextTitle = payload.title !== undefined ? payload.title : record.title;
      const nextDate = payload.date !== undefined ? payload.date : record.date;

      if (!nextTitle) {
        sendJson(res, 400, { error: 'title obrigatório' });
        return;
      }
      if (!nextDate) {
        sendJson(res, 400, { error: 'date obrigatório' });
        return;
      }

      try {
        const updated = await prisma.event.update({
          where: { id },
          data: {
            title: nextTitle,
            date: nextDate,
            start_time:
              payload.start_time !== undefined ? payload.start_time : record.start_time,
            end_time: payload.end_time !== undefined ? payload.end_time : record.end_time,
            notes: payload.notes !== undefined ? payload.notes : record.notes
          }
        });

        sendJson(res, 200, mapEventRecord(updated));
      } catch (err) {
        console.error('Erro ao atualizar evento:', err);
        sendJson(res, 500, { error: 'Erro ao atualizar evento' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      try {
        const result = await prisma.event.deleteMany({
          where: {
            id,
            ownerId: user.id
          }
        });

        if (result.count === 0) {
          sendNotFound(res);
          return;
        }

        sendNoContent(res);
      } catch (err) {
        console.error('Erro ao remover evento:', err);
        sendJson(res, 500, { error: 'Erro ao remover evento' });
      }
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
    return;
  }

  sendNotFound(res);
};

const parseReferenceDateInput = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const handleNotificationsRoutes = async (req, res, subSegments, _searchParams, user) => {
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Proibido' });
    return;
  }

  if (subSegments.length === 1 && subSegments[0] === 'check') {
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, ['POST']);
      return;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { error: body.error });
      return;
    }

    const parsedReference = parseReferenceDateInput(body.value.referenceDate);
    if (body.value.referenceDate && !parsedReference) {
      sendJson(res, 400, { error: 'referenceDate inválido' });
      return;
    }

    try {
      const referenceDate = parsedReference || new Date();
      notificationsLogger.info(
        `Avaliação manual solicitada por ${user.username} para ${referenceDate.toISOString()}.`
      );
      const evaluation = await notificationsManager.evaluate(referenceDate);
      sendJson(res, 200, evaluation);
    } catch (err) {
      notificationsLogger.error('Erro ao avaliar notificações manualmente:', err);
      sendJson(res, 500, { error: 'Erro ao avaliar notificações' });
    }
    return;
  }

  if (subSegments.length === 1 && subSegments[0] === 'send') {
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, ['POST']);
      return;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { error: body.error });
      return;
    }

    const parsedReference = parseReferenceDateInput(body.value.referenceDate);
    if (body.value.referenceDate && !parsedReference) {
      sendJson(res, 400, { error: 'referenceDate inválido' });
      return;
    }

    const dryRun = Boolean(body.value.dryRun);
    const recipients = body.value.recipients;

    try {
      const referenceDate = parsedReference || new Date();
      notificationsLogger.info(
        `Envio manual solicitado por ${user.username} (${ 
          dryRun ? 'modo simulação' : 'envio real'
        }).`
      );
      const result = await notificationsManager.sendNotifications({
        referenceDate,
        recipients,
        dryRun,
        reason: 'manual-api'
      });
      await recordNotificationAttempt(result);
      sendJson(res, 200, result);
    } catch (err) {
      notificationsLogger.error('Erro ao processar envio manual de notificações:', err);
      sendJson(res, 500, { error: 'Erro ao enviar notificações' });
    }
    return;
  }

  sendNotFound(res);
};

const handleUsersRoutes = async (req, res, subSegments, _searchParams, user) => {
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Proibido' });
    return;
  }

  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const users = await prisma.user.findMany();
        const payload = users
          .map(sanitizeUser)
          .sort((a, b) => a.username.localeCompare(b.username));
        sendJson(res, 200, payload);
      } catch (err) {
        console.error('Erro ao listar usuários:', err);
        sendJson(res, 500, { error: 'Erro ao listar usuários' });
      }
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      try {
        const { username, password, name = null, role = 'user', whatsapp, ...extra } =
          body.value || {};

        if (role !== 'user') {
          sendJson(res, 400, { error: 'Somente usuários comuns podem ser criados.' });
          return;
        }

        const created = await createUser({ username, password, name, role, whatsapp, ...extra });
        sendJson(res, 201, sanitizeUser(created));
      } catch (err) {
        if (err.message === 'Usuário já existe') {
          sendJson(res, 409, { error: err.message });
        } else if (
          err.message === 'username obrigatório' ||
          err.message === 'password obrigatório' ||
          err.message === 'whatsapp obrigatório' ||
          err.message === 'whatsapp inválido'
        ) {
          sendJson(res, 400, { error: err.message });
        } else {
          console.error('Erro ao criar usuário:', err);
          sendJson(res, 500, { error: 'Erro ao criar usuário' });
        }
      }
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (subSegments.length === 1) {
    const id = decodeURIComponent(subSegments[0]);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res);
      return;
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }
      if (!body.value || typeof body.value !== 'object') {
        sendJson(res, 400, { error: 'Dados inválidos' });
        return;
      }

      const { username, password, name, role, ...extra } = body.value;
      const data = {};
      let changed = false;

      if (username !== undefined) {
        if (typeof username !== 'string') {
          sendJson(res, 400, { error: 'username inválido' });
          return;
        }
        const trimmed = username.trim();
        if (!trimmed) {
          sendJson(res, 400, { error: 'username obrigatório' });
          return;
        }
        const normalized = trimmed.toLowerCase();
        const conflict = await prisma.user.findFirst({
          where: {
            id: { not: id },
            username: {
              equals: normalized,
              mode: 'insensitive'
            }
          }
        });
        if (conflict) {
          sendJson(res, 409, { error: 'Usuário já existe' });
          return;
        }
        if (trimmed !== existing.username) {
          data.username = trimmed;
          changed = true;
        }
      }

      if (name !== undefined) {
        const normalizedName = normalizeOptionalString(name);
        if ((normalizedName ?? null) !== (existing.name ?? null)) {
          data.name = normalizedName ?? null;
          changed = true;
        }
      }

      if (role !== undefined) {
        if (role !== 'admin' && role !== 'user') {
          sendJson(res, 400, { error: 'role inválido' });
          return;
        }
        if (role !== existing.role) {
          data.role = role;
          changed = true;
        }
      }

      if (password !== undefined) {
        if (password === null || password === '') {
          sendJson(res, 400, { error: 'password inválido' });
          return;
        }
        if (typeof password !== 'string' || password.length < 4) {
          sendJson(res, 400, {
            error: 'password deve ter pelo menos 4 caracteres'
          });
          return;
        }
        const { salt, passwordHash } = hashPassword(password);
        data.salt = salt;
        data.passwordHash = passwordHash;
        changed = true;
      }

      if (extra && Object.keys(extra).length > 0) {
        const currentExtras =
          existing.extra && typeof existing.extra === 'object' ? { ...existing.extra } : {};
        const before = JSON.stringify(currentExtras);
        applyUserExtras(currentExtras, extra);
        if (JSON.stringify(currentExtras) !== before) {
          data.extra = currentExtras;
          changed = true;
        }
      }

      if (!changed) {
        sendJson(res, 200, sanitizeUser(existing));
        return;
      }

      try {
        data.updatedAt = new Date();
        const updated = await prisma.user.update({
          where: { id },
          data
        });
        sendJson(res, 200, sanitizeUser(updated));
      } catch (err) {
        console.error('Erro ao atualizar usuário:', err);
        sendJson(res, 500, { error: 'Erro ao atualizar usuário' });
      }
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, sanitizeUser(existing));
      return;
    }

    sendMethodNotAllowed(res, ['GET', 'PATCH']);
    return;
  }

  sendNotFound(res);
};
const handleAuthRoutes = async (req, res, subSegments) => {
  if (subSegments.length === 1 && subSegments[0] === 'login') {
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, ['POST']);
      return;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { error: body.error });
      return;
    }

    try {
      const { username, password } = body.value;
      if (!username || !password) {
        sendJson(res, 400, { error: 'Credenciais obrigatórias' });
        return;
      }

      const normalized = username.toString().trim();
      const userRecord = await prisma.user.findFirst({
        where: {
          username: {
            equals: normalized.toLowerCase(),
            mode: 'insensitive'
          }
        }
      });

      if (!userRecord || !verifyPassword(password.toString(), userRecord)) {
        sendJson(res, 401, { error: 'Credenciais inválidas' });
        return;
      }

      const token = issueToken(userRecord.id);
      sendJson(res, 200, { token, user: sanitizeUser(userRecord) });
    } catch (err) {
      console.error('Erro ao autenticar usuário:', err);
      sendJson(res, 500, { error: 'Erro ao autenticar' });
    }
    return;
  }

  if (subSegments.length === 1 && subSegments[0] === 'logout') {
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, ['POST']);
      return;
    }

    const auth = await getUserFromAuthHeader(req);
    if (!auth) {
      sendNoContent(res);
      return;
    }
    revokeToken(auth.token);
    sendNoContent(res);
    return;
  }

  sendNotFound(res);
};

const PORT = Number(process.env.PORT) || 3333;

const startServer = async () => {
  try {
    await connectPrisma();
    await ensureDefaultAdmin();
    scheduleDailyNotifications(scheduleConfig);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ API rodando em http://localhost:${PORT}`);

      try {
        const ifaces = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(ifaces)) {
          for (const info of ifaces[name] || []) {
            if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
          }
        }
        if (ips.length) {
          console.log(`🌐 Acesse via LAN: http://${ips[0]}:${PORT}`);
          console.log(`📄 Páginas: /public/index.html e /public/login.html`);
        }
      } catch {}
    });
  } catch (err) {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  try {
    if (signal) {
      console.log(`Recebido sinal ${signal}. Finalizando...`);
    }
    if (server.listening) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('Servidor HTTP encerrado.');
          resolve();
        });
      });
    }
    await disconnectPrisma();
  } catch (err) {
    console.error('Erro ao finalizar servidor:', err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
