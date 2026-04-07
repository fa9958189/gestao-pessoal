import { supabase as sharedSupabase } from './supabaseClient';
const getSupabaseClient = (supabaseClient) => {
  if (supabaseClient) return supabaseClient;
  return sharedSupabase;
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
  const payload = {
    user_id: userId,
    entry_date: entryDate,
    entry_time: time || null,
    meal_type: mealType,
    food,
    quantity,
    calories: calories || 0,
    protein: protein || 0,
    water_ml: waterMl || 0,
    notes: notes || null,
  };

  const { data, error } = await supabase
    .from('food_diary_entries')
    .insert([payload])
    .select()
    .single();

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
