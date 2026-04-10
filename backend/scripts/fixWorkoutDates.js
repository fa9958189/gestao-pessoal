import "dotenv/config";
import { supabase } from "../supabase.js";

const TABLE_NAME = "workout_sessions";
const BATCH_SIZE = 500;

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const getCorrectedDate = (timestampValue) => {
  const timestamp = new Date(timestampValue);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  const corrected = new Date(
    timestamp.getTime() - new Date().getTimezoneOffset() * 60000
  )
    .toISOString()
    .split("T")[0];

  return corrected;
};

const pickTimestamp = (row) => row.performed_at || row.created_at || null;

const run = async () => {
  console.log(`🔎 Iniciando correção one-off da tabela ${TABLE_NAME}...`);

  let offset = 0;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;

  while (true) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, date, performed_at, created_at")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Erro ao ler ${TABLE_NAME}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      if (!isDateOnly(row.date)) continue;

      const timestamp = pickTimestamp(row);
      if (!timestamp) continue;

      const correctedDate = getCorrectedDate(timestamp);
      if (!correctedDate) continue;

      candidates += 1;

      if (row.date === correctedDate) continue;

      const { error: updateError } = await supabase
        .from(TABLE_NAME)
        .update({ date: correctedDate })
        .eq("id", row.id);

      if (updateError) {
        console.error(`❌ Falha ao atualizar id=${row.id}:`, updateError.message);
        continue;
      }

      updated += 1;
      console.log(`✅ id=${row.id} | ${row.date} -> ${correctedDate}`);
    }

    offset += BATCH_SIZE;
  }

  console.log("\n📊 Resumo da execução:");
  console.log(`- Registros lidos: ${scanned}`);
  console.log(`- Registros candidatos (date YYYY-MM-DD + timestamp): ${candidates}`);
  console.log(`- Registros atualizados: ${updated}`);
  console.log("🏁 Correção finalizada.");
};

run().catch((error) => {
  console.error("❌ Erro fatal no script fixWorkoutDates:", error.message);
  process.exitCode = 1;
});
