// server.js
// API Gestão Pessoal – Express + armazenamento SQLite ou JSON
// Quando o módulo sqlite3 estiver disponível (ex.: ambiente local com build nativo),
// usamos o banco tradicional. Caso contrário, caímos para um arquivo JSON simples
// para garantir que a API continue funcionando mesmo sem dependências nativas.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

let sqlite3 = null;
try {
  // sqlite3 é opcional; pode falhar em ambientes sem binários pré-compilados.
  // Caso ocorra erro (ex.: "invalid ELF header"), seguimos com fallback em JSON.
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  const reason = err?.message ? err.message.replace(/\s+/g, ' ').trim() : 'motivo desconhecido';
  console.warn(`⚠️ sqlite3 indisponível, usando armazenamento em JSON. (${reason})`);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const sqlitePath = path.join(dbDir, 'data.db');
const jsonPath = path.join(dbDir, 'data.json');

function cryptoRandomId(len = 21) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
const uid = () => cryptoRandomId();

class SqliteStorage {
  constructor(filePath) {
    this.db = new sqlite3.Database(filePath);
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db.exec(
        `
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('income','expense')),
          amount REAL NOT NULL CHECK (amount >= 0),
          description TEXT,
          category TEXT,
          date TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT,
          end_time TEXT,
          notes TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
      `,
        err => (err ? reject(err) : resolve())
      );
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  listTransactions({ from, to, type, q }) {
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params = [];
    if (from) {
      sql += ` AND date >= ?`;
      params.push(from);
    }
    if (to) {
      sql += ` AND date <= ?`;
      params.push(to);
    }
    if (type && (type === 'income' || type === 'expense')) {
      sql += ` AND type = ?`;
      params.push(type);
    }
    if (q) {
      sql += ` AND (description LIKE ? OR category LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ` ORDER BY date DESC`;
    return this.all(sql, params);
  }

  async createTransaction(record) {
    await this.run(
      `INSERT INTO transactions (id, type, amount, description, category, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.id, record.type, record.amount, record.description, record.category, record.date]
    );
    return this.getTransaction(record.id);
  }

  getTransaction(id) {
    return this.get(`SELECT * FROM transactions WHERE id = ?`, [id]);
  }

  async updateTransaction(id, next) {
    await this.run(
      `UPDATE transactions
         SET type = ?, amount = ?, description = ?, category = ?, date = ?
       WHERE id = ?`,
      [next.type, next.amount, next.description, next.category, next.date, id]
    );
    return this.getTransaction(id);
  }

  async deleteTransaction(id) {
    const info = await this.run(`DELETE FROM transactions WHERE id = ?`, [id]);
    return info.changes > 0;
  }

  async summary({ from, to }) {
    let base = `FROM transactions WHERE 1=1`;
    const params = [];
    if (from) {
      base += ` AND date >= ?`;
      params.push(from);
    }
    if (to) {
      base += ` AND date <= ?`;
      params.push(to);
    }
    const inc = (await this.get(`SELECT COALESCE(SUM(amount),0) as total ${base} AND type='income'`, params)).total;
    const exp = (await this.get(`SELECT COALESCE(SUM(amount),0) as total ${base} AND type='expense'`, params)).total;
    return { income: inc, expense: exp, balance: inc - exp };
  }

  listEvents({ from, to, q }) {
    let sql = `SELECT * FROM events WHERE 1=1`;
    const params = [];
    if (from) {
      sql += ` AND date >= ?`;
      params.push(from);
    }
    if (to) {
      sql += ` AND date <= ?`;
      params.push(to);
    }
    if (q) {
      sql += ` AND (title LIKE ? OR notes LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ` ORDER BY date DESC, start_time ASC`;
    return this.all(sql, params);
  }

  async createEvent(record) {
    await this.run(
      `INSERT INTO events (id, title, date, start_time, end_time, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.id, record.title, record.date, record.start_time, record.end_time, record.notes]
    );
    return this.getEvent(record.id);
  }

  getEvent(id) {
    return this.get(`SELECT * FROM events WHERE id = ?`, [id]);
  }

  async updateEvent(id, next) {
    await this.run(
      `UPDATE events
         SET title = ?, date = ?, start_time = ?, end_time = ?, notes = ?
       WHERE id = ?`,
      [next.title, next.date, next.start_time, next.end_time, next.notes, id]
    );
    return this.getEvent(id);
  }

  async deleteEvent(id) {
    const info = await this.run(`DELETE FROM events WHERE id = ?`, [id]);
    return info.changes > 0;
  }

  async countTransactions() {
    const row = await this.get(`SELECT COUNT(*) as total FROM transactions`);
    return row?.total ?? 0;
  }
}

class JsonStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async init() {
    const data = await this.#read();
    await this.#write(data);
  }

  async #read() {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        events: Array.isArray(parsed.events) ? parsed.events : []
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { transactions: [], events: [] };
      }
      throw err;
    }
  }

  async #write(data) {
    await fsp.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async listTransactions({ from, to, type, q }) {
    const data = await this.#read();
    let rows = [...data.transactions];
    if (from) rows = rows.filter(r => r.date >= from);
    if (to) rows = rows.filter(r => r.date <= to);
    if (type && (type === 'income' || type === 'expense')) rows = rows.filter(r => r.type === type);
    if (q) {
      const term = q.toLowerCase();
      rows = rows.filter(r =>
        (r.description || '').toLowerCase().includes(term) ||
        (r.category || '').toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }

  async createTransaction(record) {
    const data = await this.#read();
    data.transactions.push(record);
    await this.#write(data);
    return record;
  }

  async getTransaction(id) {
    const data = await this.#read();
    return data.transactions.find(r => r.id === id) || null;
  }

  async updateTransaction(id, next) {
    const data = await this.#read();
    const idx = data.transactions.findIndex(r => r.id === id);
    if (idx === -1) return null;
    data.transactions[idx] = { ...data.transactions[idx], ...next };
    await this.#write(data);
    return data.transactions[idx];
  }

  async deleteTransaction(id) {
    const data = await this.#read();
    const initial = data.transactions.length;
    data.transactions = data.transactions.filter(r => r.id !== id);
    const removed = data.transactions.length !== initial;
    if (removed) await this.#write(data);
    return removed;
  }

  async summary({ from, to }) {
    const rows = await this.listTransactions({ from, to });
    const income = rows.filter(r => r.type === 'income').reduce((acc, cur) => acc + (cur.amount || 0), 0);
    const expense = rows.filter(r => r.type === 'expense').reduce((acc, cur) => acc + (cur.amount || 0), 0);
    return { income, expense, balance: income - expense };
  }

  async listEvents({ from, to, q }) {
    const data = await this.#read();
    let rows = [...data.events];
    if (from) rows = rows.filter(r => r.date >= from);
    if (to) rows = rows.filter(r => r.date <= to);
    if (q) {
      const term = q.toLowerCase();
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(term) ||
        (r.notes || '').toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      const startA = (a.start_time || '').padEnd(5, '\uFFFF');
      const startB = (b.start_time || '').padEnd(5, '\uFFFF');
      return startA.localeCompare(startB);
    });
    return rows;
  }

  async createEvent(record) {
    const data = await this.#read();
    data.events.push(record);
    await this.#write(data);
    return record;
  }

  async getEvent(id) {
    const data = await this.#read();
    return data.events.find(r => r.id === id) || null;
  }

  async updateEvent(id, next) {
    const data = await this.#read();
    const idx = data.events.findIndex(r => r.id === id);
    if (idx === -1) return null;
    data.events[idx] = { ...data.events[idx], ...next };
    await this.#write(data);
    return data.events[idx];
  }

  async deleteEvent(id) {
    const data = await this.#read();
    const initial = data.events.length;
    data.events = data.events.filter(r => r.id !== id);
    const removed = data.events.length !== initial;
    if (removed) await this.#write(data);
    return removed;
  }

  async countTransactions() {
    const data = await this.#read();
    return data.transactions.length;
  }
}

const storage = sqlite3 ? new SqliteStorage(sqlitePath) : new JsonStorage(jsonPath);
const ready = storage.init().catch(err => {
  console.error('Erro ao inicializar o armazenamento:', err);
  process.exit(1);
});

// ====== TRANSAÇÕES ======
app.get('/api/transactions', async (req, res) => {
  try {
    await ready;
    const rows = await storage.listTransactions({
      from: req.query.from,
      to: req.query.to,
      type: req.query.type,
      q: req.query.q
    });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar transações' });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    await ready;
    const { type, amount, description = null, category = null, date } = req.body;
    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    if (!date) {
      return res.status(400).json({ error: 'date obrigatório (yyyy-mm-dd)' });
    }

    const record = { id: uid(), type, amount, description, category, date };
    const created = await storage.createTransaction(record);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

app.get('/api/transactions/:id', async (req, res) => {
  await ready;
  const row = await storage.getTransaction(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  res.json(row);
});

app.patch('/api/transactions/:id', async (req, res) => {
  await ready;
  const current = await storage.getTransaction(req.params.id);
  if (!current) return res.status(404).json({ error: 'Não encontrado' });

  const next = {
    type: req.body.type ?? current.type,
    amount: typeof req.body.amount === 'number' ? req.body.amount : current.amount,
    description: req.body.description !== undefined ? req.body.description : current.description,
    category: req.body.category !== undefined ? req.body.category : current.category,
    date: req.body.date ?? current.date
  };
  if (!['income', 'expense'].includes(next.type)) {
    return res.status(400).json({ error: 'type inválido' });
  }
  if (next.amount < 0 || Number.isNaN(next.amount)) {
    return res.status(400).json({ error: 'amount inválido' });
  }
  if (!next.date) {
    return res.status(400).json({ error: 'date obrigatório' });
  }

  const updated = await storage.updateTransaction(req.params.id, next);
  res.json(updated);
});

app.delete('/api/transactions/:id', async (req, res) => {
  await ready;
  const removed = await storage.deleteTransaction(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Não encontrado' });
  res.status(204).send();
});

app.get('/api/transactions/summary', async (req, res) => {
  await ready;
  const summary = await storage.summary({ from: req.query.from, to: req.query.to });
  res.json(summary);
});

// ====== EVENTS ======
app.get('/api/events', async (req, res) => {
  try {
    await ready;
    const rows = await storage.listEvents({ from: req.query.from, to: req.query.to, q: req.query.q });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    await ready;
    const { title, date, start_time = null, end_time = null, notes = null } = req.body;
    if (!title) return res.status(400).json({ error: 'title obrigatório' });
    if (!date) return res.status(400).json({ error: 'date obrigatório (yyyy-mm-dd)' });

    const record = { id: uid(), title, date, start_time, end_time, notes };
    const created = await storage.createEvent(record);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  await ready;
  const row = await storage.getEvent(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  res.json(row);
});

app.patch('/api/events/:id', async (req, res) => {
  await ready;
  const current = await storage.getEvent(req.params.id);
  if (!current) return res.status(404).json({ error: 'Não encontrado' });

  const next = {
    title: req.body.title !== undefined ? req.body.title : current.title,
    date: req.body.date !== undefined ? req.body.date : current.date,
    start_time: req.body.start_time !== undefined ? req.body.start_time : current.start_time,
    end_time: req.body.end_time !== undefined ? req.body.end_time : current.end_time,
    notes: req.body.notes !== undefined ? req.body.notes : current.notes
  };
  if (!next.title) return res.status(400).json({ error: 'title obrigatório' });
  if (!next.date) return res.status(400).json({ error: 'date obrigatório' });

  const updated = await storage.updateEvent(req.params.id, next);
  res.json(updated);
});

app.delete('/api/events/:id', async (req, res) => {
  await ready;
  const removed = await storage.deleteEvent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Não encontrado' });
  res.status(204).send();
});

// ====== HEALTH ======
app.get('/api/health', async (_, res) => {
  try {
    await ready;
    const totalTransactions = await storage.countTransactions();
    res.json({ ok: true, totals: { transactions: totalTransactions } });
  } catch {
    res.json({ ok: true });
  }
});

app.get('/', (_, res) => {
  res.json({ ok: true, name: 'gestao-pessoal', version: '1.0.0' });
});


const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
  if (!sqlite3) {
    console.log(`💾 Usando arquivo JSON em ${jsonPath}`);
  }
});
