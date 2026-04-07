const CLIENT_KEY = '__gp_supabase_client__';

const createSupabaseClient = () => {
  const { supabaseUrl, supabaseAnonKey, authSchema } = window.APP_CONFIG || {};

  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não configurado corretamente.');
  }

  return window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: 'gp-react-session',
      schema: authSchema || 'public',
    },
  });
};

if (!window[CLIENT_KEY]) {
  window[CLIENT_KEY] = createSupabaseClient();
}

export const supabase = window[CLIENT_KEY];
