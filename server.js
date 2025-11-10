// server.js
// API Gestão Pessoal – Express + armazenamento SQLite ou JSON

try {
  require('dotenv').config();
} catch (err) {
  if (err?.code === 'MODULE_NOT_FOUND') {
    console.warn('ℹ️ dotenv não encontrado; prosseguindo sem carregar arquivo .env');
  } else {
    throw err;
  }
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  const reason = err?.message?.replace(/\s+/g, ' ').trim() || 'motivo desconhecido';
  console.warn(`⚠️ sqlite3 indisponível, usando JSON. (${reason})`);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const sqlitePath = path.join(dbDir, 'data.db');
const jsonPath = path.join(dbDir, 'data.json');

// ==== UTIL ====
function cryptoRandomId(len = 21) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
const uid = () => cryptoRandomId();
const isSummarySlug = v => typeof v === 'string' && v.toLowerCase() === 'summary';

// ==== STORAGE SQLITE ====
class SqliteStorage {
  constructor(filePath) {
    this.db = new sqlite3.Database(filePath);
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db.exec(
        `
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user'
        );
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
        err => {
          if (err) return reject(err);
          this.ensureAdminUser().then(resolve).catch(reject);
        }
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

  async ensureAdminUser() {
    const existing = await this.get(`SELECT id FROM users WHERE username=?`, ['felipeadm']);
    if (!existing) {
      await this.run(`INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)`, [
        uid(),
        'felipeadm',
        '1234',
        'admin'
      ]);
    }
  }

  async authenticate(username, password) {
    const user = await this.get(`SELECT id, username, password, role FROM users WHERE username=?`, [username]);
    if (!user || user.password !== password) return null;
    return { id: user.id, username: user.username, role: user.role };
  }

  // transações e eventos (mesmos métodos que já existiam)
  async listTransactions(filters) {
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params = [];
    if (filters.from) { sql += ` AND date >= ?`; params.push(filters.from); }
    if (filters.to) { sql += ` AND date <= ?`; params.push(filters.to); }
    if (filters.type) { sql += ` AND type = ?`; params.push(filters.type); }
    sql += ` ORDER BY date DESC`;
    return this.all(sql, params);
  }

  async createTransaction(r) {
    await this.run(`INSERT INTO transactions (id,type,amount,description,category,date) VALUES (?,?,?,?,?,?)`,
      [r.id, r.type, r.amount, r.description, r.category, r.date]);
    return this.get(`SELECT * FROM transactions WHERE id=?`, [r.id]);
  }

  async deleteTransaction(id) {
    const info = await this.run(`DELETE FROM transactions WHERE id=?`, [id]);
    return info.changes > 0;
  }

  async summary({ from, to }) {
    let where = `FROM transactions WHERE 1=1`;
    const params = [];
    if (from) { where += ` AND date >= ?`; params.push(from); }
    if (to) { where += ` AND date <= ?`; params.push(to); }
    const inc = (await this.get(`SELECT SUM(amount) as total ${where} AND type='income'`, params)).total || 0;
    const exp = (await this.get(`SELECT SUM(amount) as total ${where} AND type='expense'`, params)).total || 0;
    return { income: inc, expense: exp, balance: inc - exp };
  }
}

// ==== STORAGE JSON ====
class JsonStorage {
  constructor(file) {
    this.file = file;
  }

  async init() {
    const data = await this.#read();
    if (!Array.isArray(data.users)) data.users = [];
    if (!data.users.some(u => u.username === 'felipeadm')) {
      data.users.push({ id: uid(), username: 'felipeadm', password: '1234', role: 'admin' });
      await this.#write(data);
    }
  }

  async #read() {
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { transactions: [], events: [], users: [] };
    }
  }

  async #write(data) {
    await fsp.writeFile(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  async authenticate(username, password) {
    const data = await this.#read();
    const user = data.users.find(u => u.username === username);
    if (!user || user.password !== password) return null;
    return { id: user.id, username: user.username, role: user.role };
  }

  async listTransactions() {
    const data = await this.#read();
    return data.transactions || [];
  }

  async summary() {
    const data = await this.#read();
    const inc = data.transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const exp = data.transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    return { income: inc, expense: exp, balance: inc - exp };
  }
}

// ==== BOOT ====
const storage = sqlite3 ? new SqliteStorage(sqlitePath) : new JsonStorage(jsonPath);
const ready = storage.init();

// ==== ROTAS ====
app.post('/api/auth/login', async (req, res) => {
  await ready;
  const { username, password } = req.body;
  const user = await storage.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });
  res.json({ ok: true, user });
});

app.get('/api/transactions/summary', async (req, res) => {
  await ready;
  res.json(await storage.summary(req.query));
});

app.get('/api/health', async (_, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`✅ API rodando http://localhost:${PORT}`));
