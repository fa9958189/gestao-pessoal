// server.js
// API Gestão Pessoal - Express + sqlite3 (sem native build)
// Tabelas: transactions (ganhos/gastos) e events (agenda)

require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === DB SETUP ===
const dbPath = path.join(__dirname, 'db', 'data.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

// helpers Promise
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.lastID, this.changes
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

// init schema
db.serialize(() => {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      amount REAL NOT NULL CHECK (amount >= 0),
      description TEXT,
      category TEXT,
      date TEXT NOT NULL -- ISO yyyy-mm-dd
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,          -- ISO yyyy-mm-dd
      start_time TEXT,             -- HH:mm
      end_time TEXT,               -- HH:mm
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  `);
});

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

// ====== TRANSACTIONS ======
// LIST with filters: ?from=yyyy-mm-dd&to=yyyy-mm-dd&type=income|expense&q=texto
app.get('/api/transactions', async (req, res) => {
  try {
    const { from, to, type, q } = req.query;
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params = [];

    if (from) { sql += ` AND date >= ?`; params.push(from); }
    if (to)   { sql += ` AND date <= ?`; params.push(to); }
    if (type && (type === 'income' || type === 'expense')) { sql += ` AND type = ?`; params.push(type); }
    if (q)    { sql += ` AND (description LIKE ? OR category LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }

    sql += ` ORDER BY date DESC`;
    const rows = await all(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar transações' });
  }
});

// CREATE
app.post('/api/transactions', async (req, res) => {
  try {
    const { type, amount, description = null, category = null, date } = req.body;
    if (!type || !['income','expense'].includes(type)) return res.status(400).json({error:'type inválido'});
    if (typeof amount !== 'number' || amount < 0) return res.status(400).json({error:'amount inválido'});
    if (!date) return res.status(400).json({error:'date obrigatório (yyyy-mm-dd)'});

    const id = uid();
    await run(
      `INSERT INTO transactions (id, type, amount, description, category, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, type, amount, description, category, date]
    );

    const created = await get(`SELECT * FROM transactions WHERE id = ?`, [id]);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({error:'Erro ao criar transação'});
  }
});

// READ
app.get('/api/transactions/:id', async (req, res) => {
  const row = await get(`SELECT * FROM transactions WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({error:'Não encontrado'});
  res.json(row);
});

// UPDATE (parcial)
app.patch('/api/transactions/:id', async (req, res) => {
  const id = req.params.id;
  const current = await get(`SELECT * FROM transactions WHERE id = ?`, [id]);
  if (!current) return res.status(404).json({error:'Não encontrado'});

  const next = {
    type: req.body.type ?? current.type,
    amount: (typeof req.body.amount === 'number') ? req.body.amount : current.amount,
    description: (req.body.description !== undefined) ? req.body.description : current.description,
    category: (req.body.category !== undefined) ? req.body.category : current.category,
    date: req.body.date ?? current.date
  };
  if (!['income','expense'].includes(next.type)) return res.status(400).json({error:'type inválido'});
  if (next.amount < 0) return res.status(400).json({error:'amount inválido'});
  if (!next.date) return res.status(400).json({error:'date obrigatório'});

  await run(
    `UPDATE transactions SET type=?, amount=?, description=?, category=?, date=? WHERE id=?`,
    [next.type, next.amount, next.description, next.category, next.date, id]
  );

  const updated = await get(`SELECT * FROM transactions WHERE id = ?`, [id]);
  res.json(updated);
});

// DELETE
app.delete('/api/transactions/:id', async (req, res) => {
  const info = await run(`DELETE FROM transactions WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({error:'Não encontrado'});
  res.status(204).send();
});

// RESUMO: saldo, total incomes, total expenses (com filtros de período)
app.get('/api/transactions/summary', async (req, res) => {
  const { from, to } = req.query;
  let base = `FROM transactions WHERE 1=1`;
  const params = [];
  if (from) { base += ` AND date >= ?`; params.push(from); }
  if (to)   { base += ` AND date <= ?`; params.push(to); }

  const inc = (await get(`SELECT COALESCE(SUM(amount),0) as total ${base} AND type='income'`, params)).total;
  const exp = (await get(`SELECT COALESCE(SUM(amount),0) as total ${base} AND type='expense'`, params)).total;

  res.json({ income: inc, expense: exp, balance: inc - exp });
});

// ====== EVENTS (AGENDA) ======
// LIST
app.get('/api/events', async (req, res) => {
  const { from, to, q } = req.query;
  let sql = `SELECT * FROM events WHERE 1=1`;
  const params = [];

  if (from) { sql += ` AND date >= ?`; params.push(from); }
  if (to)   { sql += ` AND date <= ?`; params.push(to); }
  if (q)    { sql += ` AND (title LIKE ? OR notes LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }

  sql += ` ORDER BY date DESC, start_time ASC`;
  const rows = await all(sql, params);
  res.json(rows);
});

// CREATE
app.post('/api/events', async (req, res) => {
  try {
    const { title, date, start_time = null, end_time = null, notes = null } = req.body;
    if (!title) return res.status(400).json({error:'title obrigatório'});
    if (!date) return res.status(400).json({error:'date obrigatório (yyyy-mm-dd)'});

    const id = uid();
    await run(
      `INSERT INTO events (id, title, date, start_time, end_time, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, title, date, start_time, end_time, notes]
    );

    const created = await get(`SELECT * FROM events WHERE id = ?`, [id]);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({error:'Erro ao criar evento'});
  }
});

// READ
app.get('/api/events/:id', async (req, res) => {
  const row = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({error:'Não encontrado'});
  res.json(row);
});

// UPDATE
app.patch('/api/events/:id', async (req, res) => {
  const id = req.params.id;
  const cur = await get(`SELECT * FROM events WHERE id = ?`, [id]);
  if (!cur) return res.status(404).json({error:'Não encontrado'});

  const next = {
    title: (req.body.title !== undefined) ? req.body.title : cur.title,
    date: (req.body.date !== undefined) ? req.body.date : cur.date,
    start_time: (req.body.start_time !== undefined) ? req.body.start_time : cur.start_time,
    end_time: (req.body.end_time !== undefined) ? req.body.end_time : cur.end_time,
    notes: (req.body.notes !== undefined) ? req.body.notes : cur.notes
  };
  if (!next.title) return res.status(400).json({error:'title obrigatório'});
  if (!next.date) return res.status(400).json({error:'date obrigatório'});

  await run(
    `UPDATE events SET title=?, date=?, start_time=?, end_time=?, notes=? WHERE id=?`,
    [next.title, next.date, next.start_time, next.end_time, next.notes, id]
  );

  const updated = await get(`SELECT * FROM events WHERE id = ?`, [id]);
  res.json(updated);
});

// DELETE
app.delete('/api/events/:id', async (req, res) => {
  const info = await run(`DELETE FROM events WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({error:'Não encontrado'});
  res.status(204).send();
});

// HEALTHCHECK
app.get('/', (_, res) => {
  res.json({ ok: true, name: 'gestao-pessoal', version: '1.0.0' });
});

// START
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});
