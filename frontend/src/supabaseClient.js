import { createClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const cfg = window.APP_CONFIG || {};

  const url =
    cfg.supabaseUrl ||
    import.meta.env.VITE_SUPABASE_URL ||
    '';

  const key =
    cfg.supabaseAnonKey ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    '';

  if (!url || !key) {
    console.error('❌ Supabase config ausente no runtime:', {
      windowConfig: cfg,
      viteEnvUrl: import.meta.env.VITE_SUPABASE_URL,
      viteEnvKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'OK' : 'MISSING'
    });
  }

  return { url, key };
}

const { url, key } = getSupabaseConfig();

export const supabase = createClient(url, key);
