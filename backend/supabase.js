import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL não está definido no ambiente do backend.");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY não está definido no ambiente do backend. Configure a service role key válida antes de iniciar o servidor.",
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeoutAndRetry = async (url, options = {}, attempt = 1) => {
  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);

    const isTimeout =
      error?.name === "AbortError" ||
      String(error?.message || "").toLowerCase().includes("timeout") ||
      String(error?.cause?.code || "").toLowerCase().includes("timeout") ||
      String(error?.code || "").toLowerCase().includes("timeout");

    if (attempt < 3 && isTimeout) {
      await sleep(attempt * 1000);
      return fetchWithTimeoutAndRetry(url, options, attempt + 1);
    }

    throw error;
  }
};

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  global: {
    fetch: fetchWithTimeoutAndRetry,
  },
});
