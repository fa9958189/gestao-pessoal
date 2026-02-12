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

const normalizeMealFromDb = (item) => ({
  id: item.id,
  mealType: item.meal_type || '',
  food: item.food || '',
  quantity: item.quantity || '',
  calories: item.calories != null ? Number(item.calories) : 0,
  protein: item.protein != null ? Number(item.protein) : 0,
  waterMl: item.water_ml != null ? Number(item.water_ml) : 0,
  time: item.entry_time || '',
  notes: item.notes || '',
  date: item.entry_date,
  createdAt: item.created_at,
});

const normalizeTimeToHHmm = (value) => {
  if (!value) return null;
  const input = String(value).trim();
  if (!input) return null;

  const match = input.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const saveMeal = async (
  {
    userId,
    entryDate,
    mealType,
    food,
    quantity,
    calories,
    protein,
    waterMl,
    time,
    notes,
  },
  supabaseClient,
) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  const resolvedUserId = user?.id || userId;
  if (!resolvedUserId) {
    throw new Error('Usuário não autenticado para salvar refeição.');
  }
  const selectedFoods = Array.isArray(food) ? food : [];
  const formattedTime = normalizeTimeToHHmm(time);

  const payload = {
    user_id: resolvedUserId,
    entry_date: entryDate,
    entry_time: formattedTime,
    meal_type: mealType || null,
    food: selectedFoods.length
      ? selectedFoods.map((f) => f.name).join(', ')
      : food || null,
    quantity: selectedFoods.length
      ? selectedFoods.map((f) => `${f.qty}g`).join(', ')
      : quantity || null,
    calories: calories ? Number(calories) : null,
    protein: protein ? Number(protein) : null,
    water_ml: waterMl ? Number(waterMl) : null,
    notes: notes || null,
  };

  console.log('PAYLOAD REFEIÇÃO:', payload);

  const { data, error } = await supabase
    .from('food_daily_entries')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar refeição:', error);
  }
  if (error) throw error;
  return normalizeMealFromDb(data);
};

export const fetchMealsByDate = async (userId, date, supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { data, error } = await supabase
    .from('food_diary_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', date)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeMealFromDb);
};

export const updateMeal = async (entryId, newData, supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const payload = {
    meal_type: newData.mealType ?? newData.meal_type ?? '',
    food: newData.food ?? newData.alimento ?? '',
    quantity: newData.quantity ?? newData.quantidade ?? '',
    calories: newData.calories ?? newData.calorias ?? null,
    protein: newData.protein ?? newData.proteina ?? null,
    water_ml: newData.waterMl ?? newData.agua ?? null,
    entry_time: newData.time ?? newData.entry_time ?? null,
    notes: newData.notes ?? newData.observacoes ?? null,
    entry_date: newData.entryDate || newData.entry_date || newData.date,
  };

  const { data, error } = await supabase
    .from('food_diary_entries')
    .update(payload)
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw error;
  return normalizeMealFromDb(data);
};

export const deleteMeal = async (entryId, supabaseClient) => {
  const supabase = getSupabaseClient(supabaseClient);
  const { error } = await supabase
    .from('food_diary_entries')
    .delete()
    .eq('id', entryId);

  if (error) throw error;
};
