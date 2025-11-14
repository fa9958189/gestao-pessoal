#!/usr/bin/env node
const path = require('path');

const { loadEnv } = require('../lib/env');
const { createNotificationsManager } = require('../lib/notifications');
const { prisma, connectPrisma, disconnectPrisma } = require('../db/client');

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

const mapUserForNotifications = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    whatsapp: user.whatsapp
  };
};

const prepareEvents = (records) =>
  records.map((event) => ({
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

const logAttempt = async (result) => {
  try {
    await prisma.notificationLog.create({
      data: {
        reason: result.reason || 'cli',
        referenceDate: new Date(result.referenceDate || new Date().toISOString()),
        todayDate: result.todayDate,
        upcomingDate: result.upcomingDate,
        todayCount: result.counts?.today ?? 0,
        upcomingCount: result.counts?.upcoming ?? 0,
        dryRun: Boolean(result.dryRun),
        providerReady: Boolean(result.providerReady),
        sent: Boolean(result.sent),
        status: result.error ? 'error' : result.sent ? 'sent' : 'skipped',
        warning: result.warning || null,
        error: result.error || null,
        recipients: Array.isArray(result.recipients) ? result.recipients : null,
        message: result.message || null
      }
    });
  } catch (err) {
    console.warn('Não foi possível registrar o log da notificação:', err.message);
  }
};

(async () => {
  let exitCode = 0;
  try {
    await connectPrisma();

    const [users, eventRecords] = await Promise.all([
      prisma.user.findMany({}),
      prisma.event.findMany({
        include: {
          owner: {
            select: { id: true, username: true, name: true }
          }
        }
      })
    ]);

    const userMap = new Map(users.map((user) => [user.id, mapUserForNotifications(user)]));
    const events = prepareEvents(eventRecords);

    const manager = createNotificationsManager({
      getEvents: async () => events,
      getUserById: (id) => userMap.get(id),
      config
    });

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
      exitCode = 2;
    }

    if (sendReal && !result.sent) {
      console.warn('Envio real solicitado, mas nenhuma mensagem foi enviada.');
      exitCode = Math.max(exitCode, 3);
    }

    await logAttempt(result);
  } catch (err) {
    console.error('Falha ao executar simulação de notificações:', err);
    exitCode = exitCode || 1;
  } finally {
    await disconnectPrisma();
    process.exit(exitCode);
  }
})();
