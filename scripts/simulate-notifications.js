#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { loadEnv } = require('../lib/env');
const { createNotificationsManager } = require('../lib/notifications');

const projectDir = path.join(__dirname, '..');
loadEnv(projectDir);

const args = process.argv.slice(2);
let referenceInput = null;
let sendReal = false;

for (const arg of args) {
  if (arg === '--send') {
    sendReal = true;
    continue;
  }
  if (!referenceInput) referenceInput = arg;
}

const referenceDate = referenceInput ? new Date(referenceInput) : new Date();
if (referenceInput && Number.isNaN(referenceDate.getTime())) {
  console.error('referenceDate inválido. Use formato ISO (yyyy-mm-dd).');
  process.exit(1);
}

const dbPath = path.join(projectDir, 'db', 'data.json');
let events = [];
let users = [];
try {
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      events = Array.isArray(parsed.events) ? parsed.events : [];
      users = Array.isArray(parsed.users) ? parsed.users : [];
    }
  }
} catch (err) {
  console.error('Erro ao carregar banco de dados para simulação:', err);
  process.exit(1);
}

const config = {
  enabled: true,
  accountSid: process.env.TWILIO_ACCOUNT_SID || null,
  authToken: process.env.TWILIO_AUTH_TOKEN || null,
  from: process.env.TWILIO_WHATSAPP_FROM || null,
  recipients: (process.env.TWILIO_WHATSAPP_TO || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  timezone: process.env.NOTIFICATIONS_TIMEZONE || 'UTC'
};

const manager = createNotificationsManager({
  getEvents: () => events,
  getUserById: (id) => users.find((user) => user.id === id),
  config
});

(async () => {
  try {
    const result = await manager.sendNotifications({
      referenceDate,
      dryRun: !sendReal,
      reason: sendReal ? 'cli-send' : 'cli-dry-run'
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.warning) {
      console.warn(`Aviso: ${result.warning}`);
    }

    if (result.error) {
      console.error(`Erro: ${result.error}`);
      process.exit(2);
    }

    if (sendReal && !result.sent) {
      console.warn('Envio real solicitado, mas nenhuma mensagem foi enviada.');
      process.exit(3);
    }
  } catch (err) {
    console.error('Falha ao executar simulação de notificações:', err);
    process.exit(1);
  }
})();
