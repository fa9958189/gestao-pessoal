const fs = require('fs');
const path = require('path');

const loadEnv = (baseDir = __dirname) => {
  const envPath = path.join(baseDir, '.env');
  if (!fs.existsSync(envPath)) return;

  const stripQuotes = (value) => {
    if (!value) return value;
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const rawLine of lines) {
    if (!rawLine || rawLine.trim().startsWith('#')) continue;
    const idx = rawLine.indexOf('=');
    if (idx === -1) continue;
    const key = rawLine.slice(0, idx).trim();
    if (!key) continue;
    const value = stripQuotes(rawLine.slice(idx + 1));
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

module.exports = { loadEnv };
