const getSupabaseClient = (supabaseClient) => {
  if (supabaseClient) return supabaseClient;

  const { supabaseUrl, supabaseAnonKey, authSchema } = window.APP_CONFIG || {};
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não configurado corretamente.');
  }

  if (!getSupabaseClient.cached) {
    getSupabaseClient.cached = window.supabase.createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: 'gp-react-session',
          schema: authSchema || 'public',
        },
      },
    );
  }

  return getSupabaseClient.cached;
};

const normalizeBaseUrl = (value) =>
  typeof value === 'string' && value.trim()
    ? value.trim().replace(/\/+$/, '')
    : '';

const getApiBaseUrl = () =>
  normalizeBaseUrl(
    window.APP_CONFIG?.apiBaseUrl ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_BACKEND_URL,
  );

const getAuthHeaders = async (supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error || payload?.message || 'Erro ao comunicar com o servidor.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const fetchHydrationState = async ({ dayDate }, supabaseClient) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('API base não configurada.');
  }

  const headers = await getAuthHeaders(supabaseClient);
  const query = dayDate ? `?dayDate=${encodeURIComponent(dayDate)}` : '';
  return requestJson(`${baseUrl}/api/food-diary/hydration/state${query}`, {
    headers,
  });
};

export const addHydrationEntry = async ({ dayDate, amountMl }, supabaseClient) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('API base não configurada.');
  }

  const headers = await getAuthHeaders(supabaseClient);
  return requestJson(`${baseUrl}/api/food-diary/hydration/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ dayDate, amountMl }),
  });
};

export const undoHydrationEntry = async ({ dayDate }, supabaseClient) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('API base não configurada.');
  }

  const headers = await getAuthHeaders(supabaseClient);
  return requestJson(`${baseUrl}/api/food-diary/hydration/undo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ dayDate }),
  });
};
