import "dotenv/config";
import { runReminderChecks } from "../services/reminderService.js";

const INTERVAL_MS = 60 * 1000;

let isRunning = false;

async function runCycle() {
  if (isRunning) return;
  isRunning = true;
  try {
    await runReminderChecks();
  } catch (err) {
    console.error("❌ Erro no worker de lembretes:", err);
  } finally {
    isRunning = false;
  }
}

console.log("🟢 Worker de lembretes iniciado (Agenda Diária + Agenda)");

runCycle().catch((err) =>
  console.error("❌ Erro inicial no worker de lembretes:", err)
);

setInterval(() => {
  runCycle().catch((err) =>
    console.error("❌ Erro no ciclo do worker de lembretes:", err)
  );
}, INTERVAL_MS);
