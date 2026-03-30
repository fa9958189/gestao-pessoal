const buildLogPayload = (level, event, meta = {}) => ({
  level,
  event,
  timestamp: new Date().toISOString(),
  ...meta,
});

export const logInfo = (event, meta = {}) => {
  console.log(buildLogPayload("info", event, meta));
};

export const logWarn = (event, meta = {}) => {
  console.warn(buildLogPayload("warn", event, meta));
};

export const logError = (event, meta = {}) => {
  console.error(buildLogPayload("error", event, meta));
};
