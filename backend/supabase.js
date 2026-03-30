import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { logInfo, logWarn } from "./utils/logger.js";

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

const SUPABASE_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;
const MAX_JITTER_MS = 250;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 30000;
const TIMEOUT_SPIKE_WINDOW_MS = 5 * 60 * 1000;
const TIMEOUT_SPIKE_THRESHOLD = 10;

const circuitBreaker = {
  state: "CLOSED",
  failureCount: 0,
  openedAt: null,
  nextTryAt: null,
  halfOpenInFlight: false,
};

const timeoutEvents = [];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutLike = (value) => {
  const raw = String(value || "").toLowerCase();
  return (
    raw.includes("timeout") ||
    raw.includes("connect timeout") ||
    raw.includes("und_err_connect_timeout") ||
    raw.includes("fetch failed")
  );
};

const isRetryableStatus = (status) => [429, 502, 503, 504].includes(Number(status));
const isCircuitFailureStatus = (status) => [502, 503, 504].includes(Number(status));

const pruneTimeoutEvents = () => {
  const cutoff = Date.now() - TIMEOUT_SPIKE_WINDOW_MS;
  while (timeoutEvents.length && timeoutEvents[0] < cutoff) {
    timeoutEvents.shift();
  }
};

export const recordTimeoutEvent = () => {
  timeoutEvents.push(Date.now());
  pruneTimeoutEvents();

  const total = timeoutEvents.length;
  if (total > TIMEOUT_SPIKE_THRESHOLD) {
    logWarn("supabase_timeout_spike", {
      count: total,
      windowMs: TIMEOUT_SPIKE_WINDOW_MS,
    });
  }
};

export const getRecentTimeoutCount = () => {
  pruneTimeoutEvents();
  return timeoutEvents.length;
};

export const getCircuitBreakerState = () => ({
  state: circuitBreaker.state,
  failureCount: circuitBreaker.failureCount,
  openedAt: circuitBreaker.openedAt,
  nextTryAt: circuitBreaker.nextTryAt,
});

const openCircuit = (reason) => {
  const now = Date.now();
  circuitBreaker.state = "OPEN";
  circuitBreaker.openedAt = new Date(now).toISOString();
  circuitBreaker.nextTryAt = new Date(now + CIRCUIT_OPEN_MS).toISOString();
  circuitBreaker.halfOpenInFlight = false;
  logWarn("supabase_circuit_open", {
    reason,
    failureCount: circuitBreaker.failureCount,
    nextTryAt: circuitBreaker.nextTryAt,
  });
};

export const recordSupabaseSuccess = () => {
  const wasHalfOpen = circuitBreaker.state === "HALF_OPEN";
  const wasOpen = circuitBreaker.state === "OPEN";
  circuitBreaker.state = "CLOSED";
  circuitBreaker.failureCount = 0;
  circuitBreaker.openedAt = null;
  circuitBreaker.nextTryAt = null;
  circuitBreaker.halfOpenInFlight = false;

  if (wasHalfOpen || wasOpen) {
    logInfo("supabase_circuit_closed", { by: "success" });
  }
};

export const recordSupabaseFailure = (failureMeta = {}) => {
  circuitBreaker.halfOpenInFlight = false;

  if (circuitBreaker.state === "HALF_OPEN") {
    circuitBreaker.failureCount = Math.max(circuitBreaker.failureCount + 1, CIRCUIT_FAILURE_THRESHOLD);
    openCircuit("half_open_failure");
    return;
  }

  circuitBreaker.failureCount += 1;

  if (circuitBreaker.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    openCircuit(failureMeta.reason || "threshold_reached");
  }
};

export const shouldShortCircuitSupabase = () => {
  if (circuitBreaker.state === "OPEN") {
    const now = Date.now();
    const nextTryAtMs = circuitBreaker.nextTryAt ? new Date(circuitBreaker.nextTryAt).getTime() : 0;

    if (now < nextTryAtMs) {
      return true;
    }

    circuitBreaker.state = "HALF_OPEN";
    circuitBreaker.halfOpenInFlight = false;
    logWarn("supabase_circuit_half_open", {
      openedAt: circuitBreaker.openedAt,
      nextTryAt: circuitBreaker.nextTryAt,
    });
  }

  if (circuitBreaker.state === "HALF_OPEN") {
    if (circuitBreaker.halfOpenInFlight) {
      return true;
    }

    circuitBreaker.halfOpenInFlight = true;
    return false;
  }

  return false;
};

export const isRetryableSupabaseError = (error, response) => {
  if (response && isRetryableStatus(response.status)) return true;

  if (!error) return false;

  return (
    error?.name === "AbortError" ||
    isTimeoutLike(error?.message) ||
    isTimeoutLike(error?.details) ||
    isTimeoutLike(error?.cause?.message) ||
    isTimeoutLike(error?.cause?.code) ||
    isTimeoutLike(error?.code)
  );
};

const isCircuitBreakerFailure = (error, response) => {
  if (response && isCircuitFailureStatus(response.status)) return true;

  if (!error) return false;

  return (
    error?.name === "AbortError" ||
    isTimeoutLike(error?.message) ||
    isTimeoutLike(error?.details) ||
    isTimeoutLike(error?.cause?.message) ||
    isTimeoutLike(error?.cause?.code) ||
    isTimeoutLike(error?.code)
  );
};

const buildCircuitOpenError = () => {
  const error = new Error("SUPABASE_CIRCUIT_OPEN");
  error.code = "SUPABASE_CIRCUIT_OPEN";
  return error;
};

export const fetchWithTimeoutAndRetry = async (url, options = {}) => {
  if (shouldShortCircuitSupabase()) {
    throw buildCircuitOpenError();
  }

  for (let retryCount = 0; retryCount <= MAX_RETRIES; retryCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (isCircuitFailureStatus(response.status)) {
        recordSupabaseFailure({ reason: `status_${response.status}` });
      } else if (response.ok || response.status < 500) {
        recordSupabaseSuccess();
      }

      const retryable = isRetryableSupabaseError(null, response);
      if (retryable && retryCount < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** retryCount + Math.floor(Math.random() * MAX_JITTER_MS);
        logWarn("supabase_request_retry", {
          attempt: retryCount + 1,
          delayMs,
          status: response.status,
        });
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);

      const timeoutLike = isTimeoutLike(error?.message) || error?.name === "AbortError";
      if (timeoutLike) {
        recordTimeoutEvent();
        logWarn("supabase_timeout", {
          attempt: retryCount + 1,
          message: error?.message,
          code: error?.code || error?.cause?.code,
        });
      }

      const retryable = isRetryableSupabaseError(error);
      if (retryable && retryCount < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** retryCount + Math.floor(Math.random() * MAX_JITTER_MS);
        logWarn("supabase_request_retry", {
          attempt: retryCount + 1,
          delayMs,
          error: error?.message || "unknown_error",
        });
        await sleep(delayMs);
        continue;
      }

      if (isCircuitBreakerFailure(error)) {
        recordSupabaseFailure({ reason: "network_failure" });
      }

      throw error;
    }
  }

  throw new Error("Falha inesperada no retry de Supabase");
};

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  global: {
    fetch: fetchWithTimeoutAndRetry,
  },
});
