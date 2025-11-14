// server.js
// API Gestão Pessoal - servidor HTTP nativo com armazenamento em arquivo JSON
// Tabelas: transactions (ganhos/gastos) e events (agenda)

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os'); // (apenas para log do IP LAN)
const crypto = require('crypto');

const { loadEnv } = require('./lib/env');
const { createNotificationsManager } = require('./lib/notifications');

// Carrega variáveis de ambiente simples de um arquivo .env, caso exista
loadEnv(__dirname);

const appName = 'gestao-pessoal';
const appVersion = '1.0.0';

// === DB SETUP ===
const dbPath = path.join(__dirname, 'db', 'data.json');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const DEFAULT_ADMIN = {
  id: 'admin-felipe',
  username: 'felipeadm',
  password: '1234',
  name: 'Administrador'
};

const createEmptyState = () => ({ users: [], transactions: [], events: [] });
let state = createEmptyState();

const saveDatabase = () => {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2), 'utf-8');
};

const loadDatabase = () => {
  if (!fs.existsSync(dbPath)) {
    state = createEmptyState();
    saveDatabase();
    return;
  }

  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    if (!raw.trim()) {
      state = createEmptyState();
    } else {
      const parsed = JSON.parse(raw);
      state = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        events: Array.isArray(parsed.events) ? parsed.events : []
      };
    }
  } catch (err) {
    console.error('Erro ao carregar banco de dados, recriando arquivo.', err);
    state = createEmptyState();
  }

  saveDatabase();
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

const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
};

const RESERVED_USER_FIELDS = new Set(['id', 'username', 'role', 'name', 'createdAt', 'updatedAt', 'salt', 'passwordHash']);

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.toString().trim();
  return normalized ? normalized : null;
};

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

const ensureDefaultAdmin = () => {
  let needsSave = false;
  if (!Array.isArray(state.users)) {
    state.users = [];
    needsSave = true;
  }

  let admin = state.users.find((user) => user.username === DEFAULT_ADMIN.username);
  if (!admin) {
    const { salt, passwordHash } = hashPassword(DEFAULT_ADMIN.password);
    admin = {
      id: DEFAULT_ADMIN.id,
      username: DEFAULT_ADMIN.username,
      role: 'admin',
      name: DEFAULT_ADMIN.name,
      createdAt: new Date().toISOString(),
      salt,
      passwordHash
    };
    state.users.push(admin);
    needsSave = true;
  }

  const assignOwner = (record) => {
    if (!record.ownerId) {
      record.ownerId = admin.id;
      needsSave = true;
    }
  };

  state.transactions.forEach(assignOwner);
  state.events.forEach(assignOwner);

  if (needsSave) saveDatabase();
  return admin;
};

const createUser = ({ username, password, role = 'user', name = null, ...extra }) => {
  if (!username || typeof username !== 'string') {
    throw new Error('username obrigatório');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('password obrigatório');
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    throw new Error('username obrigatório');
  }

  const exists = state.users.some((user) => user.username.toLowerCase() === normalizedUsername);
  if (exists) {
    throw new Error('Usuário já existe');
  }

  const { salt, passwordHash } = hashPassword(password);
  const normalizedName = normalizeOptionalString(name);
  const user = {
    id: uid(),
    username: username.trim(),
    role,
    name: normalizedName ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    salt,
    passwordHash
  };
  applyUserExtras(user, extra);
  state.users.push(user);
  saveDatabase();
  return user;
};

loadDatabase();
ensureDefaultAdmin();

const findUserById = (id) => state.users.find((user) => user.id === id);

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

const notificationsManager = createNotificationsManager({
  getEvents: () => state.events || [],
  getUserById: findUserById,
  logger: notificationsLogger,
  config: notificationsConfig
});

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
    notificationsLogger.info(`Próxima avaliação automática programada para ${nextRun.toISOString()}.`);

    const timer = setTimeout(async () => {
      try {
        const result = await notificationsManager.sendNotifications({ reason: 'scheduled-daily' });
        if (result.error) {
          notificationsLogger.error('Falha ao enviar notificações agendadas:', result.error);
        } else if (result.sent) {
          notificationsLogger.info(
            `Notificações enviadas para ${Array.isArray(result.recipients) ? result.recipients.join(', ') : 'destinatários não informados'}.`
          );
        } else {
          notificationsLogger.info(
            `Execução diária concluída sem envio. ${result.warning ? `Motivo: ${result.warning}` : ''}`.trim()
          );
        }
      } catch (err) {
        notificationsLogger.error('Erro inesperado durante tarefa agendada de notificações:', err);
      }

      scheduleNext();
    }, delay);

    if (typeof timer.unref === 'function') timer.unref();
  };

  scheduleNext();
};

const notificationsScheduleExpression = process.env.NOTIFICATIONS_CRON_EXPRESSION || '0 8 * * *';
const scheduleConfig = parseDailySchedule(notificationsScheduleExpression);
const timezoneLabel = notificationsManager.getTimezone();

notificationsLogger.info(
  `Agendador diário configurado para ${String(scheduleConfig.hour).padStart(2, '0')}:${String(scheduleConfig.minute).padStart(2, '0')} (${notificationsScheduleExpression}).${
    timezoneLabel ? ` Timezone informado: ${timezoneLabel}.` : ''
  }`
);

scheduleDailyNotifications(scheduleConfig);

const isValidTransactionType = (type) => type === 'income' || type === 'expense';
const normalizeString = (value) => (value ?? '').toString().toLowerCase();

const filterTransactions = ({ from, to, type, q, ownerId } = {}) => {
  const normalizedType = isValidTransactionType(type) ? type : null;
  const query = q ? q.toString().toLowerCase() : null;

  return state.transactions
    .filter((tx) => {
      if (ownerId && tx.ownerId !== ownerId) return false;
      if (from && tx.date < from) return false;
      if (to && tx.date > to) return false;
      if (normalizedType && tx.type !== normalizedType) return false;
      if (query) {
        const desc = normalizeString(tx.description);
        const cat = normalizeString(tx.category);
        if (!desc.includes(query) && !cat.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
    });
};

const eventTimeSortValue = (value) => (value ?? '').toString();

const filterEvents = ({ from, to, q, ownerId } = {}) => {
  const query = q ? q.toString().toLowerCase() : null;

  return state.events
    .filter((event) => {
      if (ownerId && event.ownerId !== ownerId) return false;
      if (from && event.date < from) return false;
      if (to && event.date > to) return false;
      if (query) {
        const title = normalizeString(event.title);
        const notes = normalizeString(event.notes);
        if (!title.includes(query) && !notes.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      const startA = eventTimeSortValue(a.start_time);
      const startB = eventTimeSortValue(b.start_time);
      return startA.localeCompare(startB);
    });
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

const getUserFromAuthHeader = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (!token) return null;
  const session = activeTokens.get(token);
  if (!session) return null;
  const user = state.users.find((item) => item.id === session.userId);
  if (!user) {
    activeTokens.delete(token);
    return null;
  }
  return { user, token };
};

const ensureAuthenticated = (req, res) => {
  const auth = getUserFromAuthHeader(req);
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
    const auth = ensureAuthenticated(req, res);
    if (!auth) return;
    await handleTransactionsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'events') {
    const auth = ensureAuthenticated(req, res);
    if (!auth) return;
    await handleEventsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'notifications') {
    const auth = ensureAuthenticated(req, res);
    if (!auth) return;
    await handleNotificationsRoutes(req, res, segments.slice(2), searchParams, auth.user);
    return;
  }

  if (resource === 'users') {
    const auth = ensureAuthenticated(req, res);
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
    sendJson(res, 200, { ok: true, totals: { transactions: state.transactions.length } });
    return;
  }

  sendNotFound(res);
};

const handleTransactionsRoutes = async (req, res, subSegments, searchParams, user) => {
  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const rows = filterTransactions({ ...buildQueryObject(searchParams), ownerId: user.id });
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
        const { type, amount, description = null, category = null, date } = body.value;
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

        const transaction = { id: uid(), type, amount, description, category, date, ownerId: user.id };
        state.transactions.push(transaction);
        saveDatabase();
        sendJson(res, 201, transaction);
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

    const { from, to } = buildQueryObject(searchParams);
    const filtered = filterTransactions({ from, to, ownerId: user.id });
    const income = filtered
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expense = filtered
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    sendJson(res, 200, { income, expense, balance: income - expense });
    return;
  }

  if (subSegments.length === 1) {
    const id = decodeURIComponent(subSegments[0]);

    if (req.method === 'GET') {
      const row = state.transactions.find((tx) => tx.id === id && tx.ownerId === user.id);
      if (!row) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === 'PATCH') {
      const index = state.transactions.findIndex((tx) => tx.id === id && tx.ownerId === user.id);
      if (index === -1) {
        sendNotFound(res);
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      const current = state.transactions[index];
      const next = {
        ...current,
        type: body.value.type ?? current.type,
        amount:
          typeof body.value.amount === 'number' && !Number.isNaN(body.value.amount)
            ? body.value.amount
            : current.amount,
        description:
          body.value.description !== undefined ? body.value.description : current.description,
        category:
          body.value.category !== undefined ? body.value.category : current.category,
        date: body.value.date ?? current.date
      };

      if (!isValidTransactionType(next.type)) {
        sendJson(res, 400, { error: 'type inválido' });
        return;
      }
      if (typeof next.amount !== 'number' || next.amount < 0) {
        sendJson(res, 400, { error: 'amount inválido' });
        return;
      }
      if (!next.date) {
        sendJson(res, 400, { error: 'date obrigatório' });
        return;
      }

      state.transactions[index] = next;
      saveDatabase();
      sendJson(res, 200, next);
      return;
    }

    if (req.method === 'DELETE') {
      const index = state.transactions.findIndex((tx) => tx.id === id && tx.ownerId === user.id);
      if (index === -1) {
        sendNotFound(res);
        return;
      }

      state.transactions.splice(index, 1);
      saveDatabase();
      sendNoContent(res);
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
        const rows = filterEvents({ ...buildQueryObject(searchParams), ownerId: user.id });
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
        const { title, date, start_time = null, end_time = null, notes = null } = body.value;
        if (!title) {
          sendJson(res, 400, { error: 'title obrigatório' });
          return;
        }
        if (!date) {
          sendJson(res, 400, { error: 'date obrigatório (yyyy-mm-dd)' });
          return;
        }

        const event = { id: uid(), title, date, start_time, end_time, notes, ownerId: user.id };
        state.events.push(event);
        saveDatabase();
        sendJson(res, 201, event);
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
      const row = state.events.find((event) => event.id === id && event.ownerId === user.id);
      if (!row) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === 'PATCH') {
      const index = state.events.findIndex((event) => event.id === id && event.ownerId === user.id);
      if (index === -1) {
        sendNotFound(res);
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      const current = state.events[index];
      const next = {
        ...current,
        title: body.value.title !== undefined ? body.value.title : current.title,
        date: body.value.date !== undefined ? body.value.date : current.date,
        start_time:
          body.value.start_time !== undefined ? body.value.start_time : current.start_time,
        end_time: body.value.end_time !== undefined ? body.value.end_time : current.end_time,
        notes: body.value.notes !== undefined ? body.value.notes : current.notes
      };

      if (!next.title) {
        sendJson(res, 400, { error: 'title obrigatório' });
        return;
      }
      if (!next.date) {
        sendJson(res, 400, { error: 'date obrigatório' });
        return;
      }

      state.events[index] = next;
      saveDatabase();
      sendJson(res, 200, next);
      return;
    }

    if (req.method === 'DELETE') {
      const index = state.events.findIndex((event) => event.id === id && event.ownerId === user.id);
      if (index === -1) {
        sendNotFound(res);
        return;
      }

      state.events.splice(index, 1);
      saveDatabase();
      sendNoContent(res);
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
      const evaluation = notificationsManager.evaluate(referenceDate);
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
        `Envio manual solicitado por ${user.username} (${dryRun ? 'modo simulação' : 'envio real'}).`
      );
      const result = await notificationsManager.sendNotifications({
        referenceDate,
        recipients,
        dryRun,
        reason: 'manual-api'
      });
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
      const users = state.users.map(sanitizeUser).sort((a, b) => a.username.localeCompare(b.username));
      sendJson(res, 200, users);
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, 400, { error: body.error });
        return;
      }

      try {
        const { username, password, name = null, role = 'user', ...extra } = body.value;
        if (role !== 'user') {
          sendJson(res, 400, { error: 'Somente usuários comuns podem ser criados.' });
          return;
        }
        const created = createUser({ username, password, name, role, ...extra });
        sendJson(res, 201, sanitizeUser(created));
      } catch (err) {
        if (err.message === 'Usuário já existe') {
          sendJson(res, 409, { error: err.message });
        } else if (err.message === 'username obrigatório' || err.message === 'password obrigatório') {
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
    const index = state.users.findIndex((item) => item.id === id);
    if (index === -1) {
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

      const current = state.users[index];
      const next = { ...current };
      const { username, password, name, role, ...extra } = body.value;
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
        const conflict = state.users.some(
          (user) => user.id !== current.id && user.username.toLowerCase() === normalized
        );
        if (conflict) {
          sendJson(res, 409, { error: 'Usuário já existe' });
          return;
        }
        if (trimmed !== current.username) changed = true;
        next.username = trimmed;
      }

      if (name !== undefined) {
        const normalizedName = normalizeOptionalString(name);
        if (normalizedName !== current.name) changed = true;
        next.name = normalizedName ?? null;
      }

      if (role !== undefined) {
        if (role !== 'admin' && role !== 'user') {
          sendJson(res, 400, { error: 'role inválido' });
          return;
        }
        if (role !== current.role) changed = true;
        next.role = role;
      }

      if (password !== undefined) {
        if (password === null || password === '') {
          sendJson(res, 400, { error: 'password inválido' });
          return;
        }
        if (typeof password !== 'string' || password.length < 4) {
          sendJson(res, 400, { error: 'password deve ter pelo menos 4 caracteres' });
          return;
        }
        const { salt, passwordHash } = hashPassword(password);
        next.salt = salt;
        next.passwordHash = passwordHash;
        changed = true;
      }

      if (extra && Object.keys(extra).length > 0) {
        applyUserExtras(next, extra);
        changed = true;
      }

      if (changed) {
        next.updatedAt = new Date().toISOString();
        state.users[index] = next;
        saveDatabase();
        sendJson(res, 200, sanitizeUser(next));
        return;
      }

      sendJson(res, 200, sanitizeUser(current));
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, sanitizeUser(state.users[index]));
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

      const normalized = username.toString().trim().toLowerCase();
      const user = state.users.find((item) => item.username.toLowerCase() === normalized);
      if (!user || !verifyPassword(password.toString(), user)) {
        sendJson(res, 401, { error: 'Credenciais inválidas' });
        return;
      }

      const token = issueToken(user.id);
      sendJson(res, 200, { token, user: sanitizeUser(user) });
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

    const auth = getUserFromAuthHeader(req);
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

// >>> ÚNICA MUDANÇA FUNCIONAL: escutar em 0.0.0.0 para aceitar conexões do simulador/lan
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);

  // Log extra com IP da rede (só para facilitar abrir no simulador)
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
