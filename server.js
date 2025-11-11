// server.js
// API Gestão Pessoal - servidor HTTP nativo com armazenamento em arquivo JSON
// Tabelas: transactions (ganhos/gastos) e events (agenda)

const http = require('http');
const path = require('path');
const fs = require('fs');

// Carrega variáveis de ambiente simples de um arquivo .env, caso exista
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const value = line.slice(idx + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const appName = 'gestao-pessoal';
const appVersion = '1.0.0';

// === DB SETUP ===
const dbPath = path.join(__dirname, 'db', 'data.json');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const createEmptyState = () => ({ transactions: [], events: [] });
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

loadDatabase();

const isValidTransactionType = (type) => type === 'income' || type === 'expense';
const normalizeString = (value) => (value ?? '').toString().toLowerCase();

const filterTransactions = ({ from, to, type, q } = {}) => {
  const normalizedType = isValidTransactionType(type) ? type : null;
  const query = q ? q.toString().toLowerCase() : null;

  return state.transactions
    .filter((tx) => {
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

const filterEvents = ({ from, to, q } = {}) => {
  const query = q ? q.toString().toLowerCase() : null;

  return state.events
    .filter((event) => {
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
    await handleTransactionsRoutes(req, res, segments.slice(2), searchParams);
    return;
  }

  if (resource === 'events') {
    await handleEventsRoutes(req, res, segments.slice(2), searchParams);
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

const handleTransactionsRoutes = async (req, res, subSegments, searchParams) => {
  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const rows = filterTransactions(buildQueryObject(searchParams));
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

        const transaction = { id: uid(), type, amount, description, category, date };
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
    const filtered = filterTransactions({ from, to });
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
      const row = state.transactions.find((tx) => tx.id === id);
      if (!row) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === 'PATCH') {
      const index = state.transactions.findIndex((tx) => tx.id === id);
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
      const index = state.transactions.findIndex((tx) => tx.id === id);
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

const handleEventsRoutes = async (req, res, subSegments, searchParams) => {
  if (subSegments.length === 0) {
    if (req.method === 'GET') {
      try {
        const rows = filterEvents(buildQueryObject(searchParams));
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

        const event = { id: uid(), title, date, start_time, end_time, notes };
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
      const row = state.events.find((event) => event.id === id);
      if (!row) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === 'PATCH') {
      const index = state.events.findIndex((event) => event.id === id);
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
      const index = state.events.findIndex((event) => event.id === id);
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

const PORT = Number(process.env.PORT) || 3333;
server.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});
