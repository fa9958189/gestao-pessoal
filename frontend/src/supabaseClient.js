const { supabaseUrl, supabaseAnonKey, authSchema } = window.APP_CONFIG || {};

if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase não configurado corretamente.');
}

export const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    storageKey: 'gp-react-session',
    schema: authSchema || 'public',
  },
});
