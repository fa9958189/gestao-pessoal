const https = require('https');
const { URLSearchParams } = require('url');

const isDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const toDate = (value) => {
  if (isDate(value)) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const formatDate = (date) => {
  if (!isDate(date)) return null;
  return date.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const ensureLogger = (logger = console) => ({
  info: typeof logger.info === 'function' ? logger.info.bind(logger) : (...args) => console.log(...args),
  warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : (...args) => console.warn(...args),
  error: typeof logger.error === 'function' ? logger.error.bind(logger) : (...args) => console.error(...args)
});

const sanitizeEvent = (event, getUserById) => {
  if (!event || typeof event !== 'object') return null;
  const safe = {
    id: event.id,
    title: event.title,
    date: event.date,
    start_time: event.start_time ?? null,
    end_time: event.end_time ?? null,
    notes: event.notes ?? null,
    ownerId: event.ownerId ?? null
  };

  if (safe.ownerId && typeof getUserById === 'function') {
    const owner = getUserById(safe.ownerId);
    if (owner) {
      safe.ownerName = owner.name || owner.username || owner.id;
    }
  }

  return safe;
};

const formatEventLine = (event) => {
  const segments = [event.title];
  const timeRange = [event.start_time, event.end_time].filter(Boolean).join(' - ');
  if (timeRange) segments.push(`(${timeRange})`);
  if (event.notes) segments.push(`Notas: ${event.notes}`);
  if (event.ownerName) segments.push(`Responsável: ${event.ownerName}`);
  return `• ${segments.join(' ')}`.trim();
};

const buildMessage = (evaluation) => {
  const lines = [];
  lines.push('Resumo diário de compromissos');
  lines.push(`Data de referência: ${evaluation.todayDate}`);
  lines.push('');

  if (evaluation.today.length > 0) {
    lines.push(`Compromissos do dia (${evaluation.todayDate}):`);
    evaluation.today.forEach((event) => lines.push(formatEventLine(event)));
  } else {
    lines.push(`Sem compromissos para hoje (${evaluation.todayDate}).`);
  }

  lines.push('');

  if (evaluation.upcoming.length > 0) {
    lines.push(`Compromissos em 5 dias (${evaluation.upcomingDate}):`);
    evaluation.upcoming.forEach((event) => lines.push(formatEventLine(event)));
  } else {
    lines.push(`Sem compromissos para ${evaluation.upcomingDate}.`);
  }

  lines.push('');
  lines.push('Mensagem automática do sistema de gestão pessoal.');

  return lines.join('\n');
};

const normalizeRecipients = (recipients) => {
  if (!recipients) return [];
  if (!Array.isArray(recipients)) recipients = [recipients];
  return recipients
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
};

const createNotificationsManager = ({ getEvents, getUserById, logger, config = {} }) => {
  const log = ensureLogger(logger);

  const effectiveConfig = {
    enabled: config.enabled !== false,
    accountSid: config.accountSid || null,
    authToken: config.authToken || null,
    from: config.from || null,
    recipients: normalizeRecipients(config.recipients),
    timezone: config.timezone || 'UTC'
  };

  const providerReady = () =>
    Boolean(effectiveConfig.accountSid && effectiveConfig.authToken && effectiveConfig.from);

  const sendViaTwilio = (to, body) =>
    new Promise((resolve, reject) => {
      const accountSid = effectiveConfig.accountSid;
      const authToken = effectiveConfig.authToken;
      const postData = new URLSearchParams({
        From: effectiveConfig.from,
        To: to,
        Body: body
      }).toString();

      const options = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        method: 'POST',
        auth: `${accountSid}:${authToken}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch {
              resolve({ sid: null, status: 'sent', raw: data });
            }
            return;
          }

          let message = `Status ${response.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            if (parsed?.message) message = parsed.message;
          } catch {
            if (data) message = data;
          }

          const error = new Error(message);
          error.statusCode = response.statusCode;
          error.body = data;
          reject(error);
        });
      });

      request.on('error', reject);
      request.write(postData);
      request.end();
    });

  const evaluate = (referenceDateInput = new Date()) => {
    const referenceDate = toDate(referenceDateInput) || new Date();
    const todayDate = formatDate(referenceDate);
    const upcomingDate = formatDate(addDays(referenceDate, 5));
    const events = typeof getEvents === 'function' ? getEvents() : [];
    const safeEvents = Array.isArray(events)
      ? events
          .map((event) => sanitizeEvent(event, getUserById))
          .filter((event) => event && typeof event.date === 'string')
      : [];

    const today = safeEvents.filter((event) => event.date === todayDate);
    const upcoming = safeEvents.filter((event) => event.date === upcomingDate);

    return {
      referenceDate: referenceDate.toISOString(),
      todayDate,
      upcomingDate,
      today,
      upcoming
    };
  };

  const sendNotifications = async ({
    referenceDate,
    recipients,
    dryRun = false,
    reason = 'manual'
  } = {}) => {
    const evaluation = evaluate(referenceDate);
    const response = {
      reason,
      referenceDate: evaluation.referenceDate,
      todayDate: evaluation.todayDate,
      upcomingDate: evaluation.upcomingDate,
      counts: {
        today: evaluation.today.length,
        upcoming: evaluation.upcoming.length
      },
      providerReady: providerReady(),
      dryRun,
      sent: false,
      deliveries: []
    };

    const hasEvents = evaluation.today.length > 0 || evaluation.upcoming.length > 0;
    if (!hasEvents) {
      log.info(
        `[notifications] Nenhum compromisso para ${evaluation.todayDate} ou ${evaluation.upcomingDate} (motivo: ${reason}).`
      );
      return response;
    }

    const message = buildMessage(evaluation);
    response.message = message;

    const targetRecipients = normalizeRecipients(recipients);
    if (targetRecipients.length === 0) {
      targetRecipients.push(...effectiveConfig.recipients);
    }
    response.recipients = targetRecipients;

    if (targetRecipients.length === 0) {
      response.warning = 'Nenhum destinatário configurado para notificações.';
      log.warn('[notifications] Execução sem destinatários configurados.');
      return response;
    }

    if (dryRun || !effectiveConfig.enabled) {
      if (!effectiveConfig.enabled) {
        response.warning = 'Envio automático desabilitado por configuração.';
      }
      log.info(
        `[notifications] Execução em modo de simulação para ${targetRecipients.join(', ')} (motivo: ${reason}).`
      );
      return response;
    }

    if (!providerReady()) {
      const errorMessage = 'Provedor WhatsApp não configurado corretamente.';
      response.error = errorMessage;
      log.error(`[notifications] ${errorMessage}`);
      return response;
    }

    for (const to of targetRecipients) {
      try {
        const result = await sendViaTwilio(to, message);
        response.deliveries.push({
          to,
          sid: result.sid || null,
          status: result.status || result.statusCode || 'sent'
        });
      } catch (err) {
        response.deliveries.push({ to, error: err.message || String(err) });
        log.error(`[notifications] Falha ao enviar mensagem para ${to}:`, err);
      }
    }

    response.sent = response.deliveries.some((delivery) => !delivery.error);
    return response;
  };

  return {
    evaluate,
    sendNotifications,
    buildMessage: (referenceDate) => buildMessage(evaluate(referenceDate)),
    getConfig: () => ({ ...effectiveConfig }),
    getTimezone: () => effectiveConfig.timezone
  };
};

module.exports = { createNotificationsManager };
