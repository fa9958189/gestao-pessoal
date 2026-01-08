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

const normalizeWaterEntry = (item) => ({
  id: item.id,
  amountMl: item.amount_ml != null ? Number(item.amount_ml) : 0,
  createdAt: item.created_at,
  date: item.date,
});

export const fetchWaterByDate = async (userId, date, supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { data, error } = await supabase
    .from('water_intake')
    .select('id, amount_ml, created_at, date')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeWaterEntry);
};

export const addWaterEntry = async (
  { userId, date, amountMl },
  supabaseClient,
) => {
  const supabase = getSupabaseClient(supabaseClient);
  const payload = {
    user_id: userId,
    date,
    amount_ml: amountMl,
  };

  const { data, error } = await supabase
    .from('water_intake')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return normalizeWaterEntry(data);
};

export const deleteLatestWaterEntry = async (userId, date, supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { data, error } = await supabase
    .from('water_intake')
    .select('id, amount_ml, created_at, date')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const latest = data[0];
  const { data: deleted, error: deleteError } = await supabase
    .from('water_intake')
    .delete()
    .eq('id', latest.id)
    .select()
    .single();

  if (deleteError) throw deleteError;
  return normalizeWaterEntry(deleted);
};
