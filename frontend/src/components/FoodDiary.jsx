import React, { useEffect, useMemo, useRef, useState } from 'react';
import FoodPicker from '../FoodPicker';
import {
  deleteMeal,
  fetchMealsByDate,
  saveMeal,
  updateMeal,
} from '../foodDiaryApi';
import NutritionReports from './reports/NutritionReports';
import HydrationCard from './HydrationCard';
import { updateHydrationGoal } from '../hydrationApi';
import { scanFood } from '../services/foodScannerApi';
import {
  loadGoals,
  loadProfile,
  loadTodayWeight,
} from '../services/foodDiaryProfile';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const defaultGoals = {
  calories: 2000,
  protein: 120,
  water: 2.5,
};
const goalTypeOptions = [
  { value: 'lose_weight', label: 'Perder peso' },
  { value: 'maintain', label: 'Manter peso' },
  { value: 'gain_muscle', label: 'Ganhar massa' },
];
const objectiveToGoalType = {
  perder_peso: 'lose_weight',
  manter_peso: 'maintain',
  ganhar_massa: 'gain_muscle',
};
const goalTypeToObjective = {
  lose_weight: 'perder_peso',
  maintain: 'manter_peso',
  gain_muscle: 'ganhar_massa',
};

const defaultBody = {
  heightCm: '',
  weightKg: '',
  goalWeightKg: '',
};

const defaultWeightHistory = [];
const BLOCKS = 10;

const renderBlocks = (current, goal) => {
  if (!goal || goal <= 0) return '⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜';
  const ratio = Math.max(0, Math.min(1, current / goal));
  const filled = Math.round(ratio * BLOCKS);
  const empty = BLOCKS - filled;
  return '⬛'.repeat(filled) + '⬜'.repeat(empty);
};

const formatNumber = (value, decimals = 0) => {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const parseNumberInput = (value) => {
  if (value == null) return null;

  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;

  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const isValidDecimalInput = (value) => /^\d*([.,]\d*)?$/.test(value);


const getLatestWeight = (weightHistory, profile) => {
  if (Array.isArray(weightHistory) && weightHistory.length > 0) {
    const sorted = [...weightHistory].sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    return sorted[0].weightKg ?? sorted[0].weight;
  }

  return profile?.weightKg || profile?.weight || 0;
};

function getLocalDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getLocalDateOnlyFromDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function parseLocalDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatWorkoutDatePtBr(value) {
  const d = parseLocalDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('pt-BR');
}

const toStorageDateString = (selectedDate) => {
  const normalized = String(selectedDate || '').trim();
  if (normalized.includes('/')) {
    return normalized.split('/').reverse().join('-');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return getLocalDateOnly();
};

const formatDateToPtBr = (date) => {
  const formatted = formatWorkoutDatePtBr(date);
  return formatted === '-' ? '' : formatted;
};

const normalizeBaseUrl = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
};

const buildApiUrl = (baseUrl, path) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  if (!baseUrl) return safePath;
  return `${normalizeBaseUrl(baseUrl)}${safePath}`;
};

const getAuthHeaders = async (supabaseClient) => {
  if (!supabaseClient?.auth?.getSession) {
    return {};
  }

  const { data } = await supabaseClient.auth.getSession();
  const accessToken = data?.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
};

const getVariationIndicator = (variation) => {
  if (!Number.isFinite(variation)) {
    return {
      icon: '➖',
      label: 'Sem comparação',
      text: '—',
      className: 'neutral',
    };
  }

  if (variation < 0) {
    return {
      icon: '🔽',
      label: 'Diminuiu',
      text: `${formatNumber(variation, 1)} kg`,
      className: 'down',
    };
  }

  if (variation > 0) {
    return {
      icon: '🔼',
      label: 'Aumentou',
      text: `+${formatNumber(variation, 1)} kg`,
      className: 'up',
    };
  }

  return {
    icon: '➖',
    label: 'Estável',
    text: '0,0 kg',
    className: 'neutral',
  };
};

function FoodDiary({ userId, supabase, notify, refreshToken, apiBaseUrl }) {
  const [entriesByDate, setEntriesByDate] = useState({});
  const [goals, setGoals] = useState(defaultGoals);
  const [goalMode, setGoalMode] = useState('auto');
  const [goalType, setGoalType] = useState('maintain');
  const [objective, setObjective] = useState('manter_peso');
  const [sex, setSex] = useState(null);
  const [body, setBody] = useState(defaultBody);
  const [weightHistory, setWeightHistory] = useState(defaultWeightHistory);
  const [waterSummary, setWaterSummary] = useState({
    totalMl: 0,
    goalMl: defaultGoals.water * 1000,
  });
  const [hydrationGoalLoaded, setHydrationGoalLoaded] = useState(false);
  const [hydrationRefreshToken, setHydrationRefreshToken] = useState(0);
  const [, setIsLoading] = useState(true);
  const [, setSavingEntry] = useState(false);
  const [, setLoadingWeightHistory] = useState(false);
  const [, setProfileLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    () => getLocalDateOnly()
  );
  const [activeSubTab, setActiveSubTab] = useState('diario');
  const [isAddMealModalOpen, setIsAddMealModalOpen] = useState(false);
  const [addMealStep, setAddMealStep] = useState(1);
  const [foodInputMode, setFoodInputMode] = useState(null);
  const [selectedFood, setSelectedFood] = useState(null);
  const [mealItems, setMealItems] = useState([]);
  const [expandedMeals, setExpandedMeals] = useState({});
  const [isBodyWizardOpen, setIsBodyWizardOpen] = useState(false);
  const [isDailyWeightModalOpen, setIsDailyWeightModalOpen] = useState(false);
  const [isWeightHistoryModalOpen, setIsWeightHistoryModalOpen] = useState(false);
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [goalsModalStep, setGoalsModalStep] = useState(1);
  const [manualGoalsDraft, setManualGoalsDraft] = useState({
    calories: '',
    protein: '',
    water: '',
  });
  const [bodyWizardStep, setBodyWizardStep] = useState(1);
  const [bodyDraft, setBodyDraft] = useState({
    sex: null,
    weightKg: '',
    heightCm: '',
    goalType: 'maintain',
    goalWeightKg: '',
  });
  const [dailyWeightDraft, setDailyWeightDraft] = useState({
    weightKg: '',
    entryDate: getLocalDateOnly(),
  });

  const [form, setForm] = useState({
    mealType: 'Almoço',
    food: '',
    calories: '',
    protein: '',
    time: '',
    notes: ''
  });

  const [editingId, setEditingId] = useState(null);

  const [isFoodPickerOpen, setIsFoodPickerOpen] = useState(false);
  const [isScanningFood, setIsScanningFood] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [, setScanPreview] = useState(null);
  const [scanDescription, setScanDescription] = useState('');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const inputCameraRef = useRef(null);
  const inputGalleryRef = useRef(null);
  const lastSavedWaterGoalRef = useRef(defaultGoals.water);

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const fetchWeightHistoryFromDb = async (currentUserId) => {
    if (!supabase) {
      throw new Error('Supabase não disponível para carregar o histórico.');
    }

    const { data, error: loadError } = await supabase
      .from('food_weight_history')
      .select('entry_date, weight_kg, recorded_at')
      .eq('user_id', currentUserId)
      .order('entry_date', { ascending: false })
      .limit(30);

    if (loadError) {
      throw loadError;
    }

    return (data || []).map((row) => ({
      date: row.entry_date,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      recordedAt: row.recorded_at,
    }));
  };

  useEffect(() => {
    let isMounted = true;

    const loadMeals = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const meals = await fetchMealsByDate(userId, selectedDate, supabase);
        if (!isMounted) return;

        setEntriesByDate((prev) => ({
          ...prev,
          [selectedDate]: meals || [],
        }));
      } catch (err) {
        console.warn('Erro ao carregar refeições', err);
        if (isMounted) {
          setError('Não foi possível carregar as refeições do dia.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMeals();

    return () => {
      isMounted = false;
    };
  }, [userId, selectedDate, supabase, refreshToken]);

  useEffect(() => {
    if (error) {
      console.warn(error);
    }
  }, [error]);

  useEffect(() => {
    let isMounted = true;

    const loadFoodDiaryState = async () => {
      if (!userId || !supabase) {
        if (isMounted) {
          setProfileLoading(false);
        }
        return;
      }

      try {
        setLoadingWeightHistory(true);
        setProfileLoading(true);
        setError(null);

        const [profile, normalizedProfile, todayWeight, history] = await Promise.all([
          loadGoals({ supabase, userId }),
          loadProfile({ supabase, userId }),
          loadTodayWeight({ supabase, userId }),
          fetchWeightHistoryFromDb(userId),
        ]);

        if (!isMounted) return;

        const nextGoals = {
          calories:
            profile?.calorie_goal != null
              ? Number(profile.calorie_goal)
              : defaultGoals.calories,
          protein:
            profile?.protein_goal != null
              ? Number(profile.protein_goal)
              : defaultGoals.protein,
          water:
            profile?.water_goal_l != null
              ? Number(profile.water_goal_l)
              : defaultGoals.water,
        };

        const profileObjective =
          normalizedProfile?.objective || goalTypeToObjective[normalizedProfile?.goalType] || 'manter_peso';

        setGoals(nextGoals);
        setGoalMode(profile?.goal_mode === 'manual' ? 'manual' : 'auto');
        setObjective(profileObjective);
        setGoalType(objectiveToGoalType[profileObjective] || normalizedProfile?.goalType || 'maintain');
        setSex(normalizedProfile?.sex || null);
        setWaterSummary((prev) => ({
          ...prev,
          goalMl: nextGoals.water * 1000,
        }));

        const todayWeightValue =
          todayWeight?.weight_kg != null && todayWeight.weight_kg !== ''
            ? String(todayWeight.weight_kg)
            : '';
        const profileWeightValue =
          normalizedProfile?.weightKg != null && normalizedProfile.weightKg !== ''
            ? String(normalizedProfile.weightKg)
            : '';
        const nextBody = {
          heightCm:
            normalizedProfile?.heightCm != null && normalizedProfile.heightCm !== ''
              ? String(normalizedProfile.heightCm)
              : '',
          weightKg:
            todayWeightValue || profileWeightValue,
          goalWeightKg:
            normalizedProfile?.goalWeightKg != null &&
            normalizedProfile.goalWeightKg !== ''
              ? String(normalizedProfile.goalWeightKg)
              : '',
        };

        setBody(nextBody);

        setWeightHistory(history || defaultWeightHistory);
        setHydrationGoalLoaded(true);
        lastSavedWaterGoalRef.current = nextGoals.water;
      } catch (err) {
        console.warn('Erro ao carregar perfil de metas e peso', err);
        if (isMounted) {
          setError('Não foi possível carregar o histórico de peso.');
        }
      } finally {
        if (isMounted) {
          setLoadingWeightHistory(false);
          setProfileLoading(false);
        }
      }
    };

    loadFoodDiaryState();

    return () => {
      isMounted = false;
    };
  }, [userId, supabase, refreshToken]);

  const refreshGoalsFromProfile = async () => {
    if (!userId || !supabase) return;

    const profile = await loadGoals({ supabase, userId });
    const nextGoals = {
      calories:
        profile?.calorie_goal != null
          ? Number(profile.calorie_goal)
          : defaultGoals.calories,
      protein:
        profile?.protein_goal != null
          ? Number(profile.protein_goal)
          : defaultGoals.protein,
      water:
        profile?.water_goal_l != null
          ? Number(profile.water_goal_l)
          : defaultGoals.water,
    };

    setGoals(nextGoals);
    setGoalMode(profile?.goal_mode === 'manual' ? 'manual' : 'auto');
    setWaterSummary((prev) => ({
      ...prev,
      goalMl: nextGoals.water * 1000,
    }));

    if (lastSavedWaterGoalRef.current !== nextGoals.water) {
      setHydrationRefreshToken((prev) => prev + 1);
      lastSavedWaterGoalRef.current = nextGoals.water;
    }
  };

  const loadWater = async () => {
    if (!userId || !supabase) return;

    const selectedDay = toStorageDateString(selectedDate);

    const { data, error: loadError } = await supabase
      .from('hydration_logs')
      .select('*')
      .eq('user_id', userId);

    if (loadError) {
      console.error('Erro ao carregar água:', loadError);
      return;
    }

    const totalWaterMl = (data || [])
      .filter((item) => {
        if (item?.day_date === selectedDay || item?.entry_date === selectedDay) {
          return true;
        }
        if (!item?.created_at) {
          return false;
        }
        const createdAtDate = parseLocalDate(item.created_at);
        const selectedDayDate = parseLocalDate(selectedDay);
        if (!createdAtDate || !selectedDayDate) {
          return false;
        }
        return createdAtDate.toDateString() === selectedDayDate.toDateString();
      })
      .reduce((sum, item) => {
        const amountMl = Number(item?.amount_ml ?? item?.water_ml);
        if (Number.isFinite(amountMl)) {
          return sum + amountMl;
        }
        const amountL = Number(item?.amount_l ?? 0);
        return sum + (Number.isFinite(amountL) ? amountL * 1000 : 0);
      }, 0);

    setWaterSummary((prev) => ({
      ...prev,
      totalMl: totalWaterMl,
    }));
  };

  useEffect(() => {
    loadWater();
  }, [userId, supabase, selectedDate, refreshToken]);

  const dayEntries = useMemo(() => {
    const selected = parseLocalDate(selectedDate);
    if (!selected) return [];
    const selectedDay = getLocalDateOnlyFromDate(selected);

    return Object.values(entriesByDate)
      .flat()
      .filter((entry) => {
        const rawDate = entry?.entryDate || entry?.date || entry?.entry_date || entry?.day_date;
        const parsed = parseLocalDate(rawDate);
        if (!parsed) return false;
        return getLocalDateOnlyFromDate(parsed) === selectedDay;
      });
  }, [entriesByDate, selectedDate]);

  const totals = useMemo(() => {
    const totalCalories = dayEntries.reduce(
      (sum, item) => sum + (Number(item.calories) || 0),
      0
    );
    const totalProtein = dayEntries.reduce(
      (sum, item) => sum + (Number(item.protein) || 0),
      0
    );
    return { totalCalories, totalProtein };
  }, [dayEntries]);

  const totalCalories = totals.totalCalories;
  const totalProtein = totals.totalProtein;
  const mealTotalCalories = mealItems.reduce(
    (sum, item) => sum + Number(item.calories || 0),
    0,
  );
  const mealTotalProtein = mealItems.reduce(
    (sum, item) => sum + Number(item.protein || 0),
    0,
  );
  const calorieGoal = goals.calories || 0;
  const proteinGoal = goals.protein || 0;
  const waterTotalLiters = waterSummary.totalMl / 1000;
  const waterGoalLiters = waterSummary.goalMl / 1000;

  const goalsMet =
    totalCalories <= calorieGoal &&
    totalProtein >= proteinGoal &&
    (!waterGoalLiters || waterTotalLiters >= waterGoalLiters);

  const bmi = useMemo(() => {
    const h = Number(body.heightCm);
    const w = Number(body.weightKg);
    if (!h || !w) return null;
    const value = w / Math.pow(h / 100, 2);
    let label = 'Peso normal';
    if (value < 18.5) label = 'Abaixo do peso';
    else if (value >= 25 && value < 30) label = 'Sobrepeso';
    else if (value >= 30) label = 'Obesidade';
    return { value, label };
  }, [body.heightCm, body.weightKg]);

  const healthyWeightRange = useMemo(() => {
    const heightMeters = Number(body.heightCm) / 100;
    if (!heightMeters) return null;
    const squared = heightMeters * heightMeters;
    return {
      min: 18.5 * squared,
      max: 24.9 * squared,
    };
  }, [body.heightCm]);

  const goalTypeLabel = useMemo(() => {
    const objetivo = objective;
    const selectedGoalType = objectiveToGoalType[objetivo] || goalType;
    const selectedOption = goalTypeOptions.find((option) => option.value === selectedGoalType);
    return selectedOption?.label || 'Manter peso';
  }, [goalType, objective]);

  const objectiveExplanation = useMemo(() => {
    let title = '';
    let explanation = '';

    if (objective === 'perder_peso') {
      title = '🔥 Emagrecimento';
      explanation = 'Você está em déficit calórico. Seu corpo vai usar gordura como fonte de energia.';
    }

    if (objective === 'ganhar_massa') {
      title = '💪 Hipertrofia';
      explanation = 'Você está em superávit calórico. O foco é crescimento muscular.';
    }

    if (objective === 'manter_peso') {
      title = '⚖️ Manutenção';
      explanation = 'Você está em equilíbrio calórico. O objetivo é estabilidade.';
    }

    return { title, explanation };
  }, [objective]);

  const hasAutomaticGoals = useMemo(() => {
    if (goalMode !== 'auto') return false;
    const validWeight = Number.isFinite(parseNumberInput(body.weightKg));
    return (
      validWeight &&
      Number.isFinite(Number(goals.calories)) &&
      Number(goals.calories) > 0 &&
      Number.isFinite(Number(goals.protein)) &&
      Number(goals.protein) > 0 &&
      Number.isFinite(Number(goals.water)) &&
      Number(goals.water) > 0
    );
  }, [goalMode, body.weightKg, goals.calories, goals.protein, goals.water]);

  const weightChartData = useMemo(
    () =>
      weightHistory
        .slice()
        .sort((a, b) => {
          const aDate = parseLocalDate(a.date);
          const bDate = parseLocalDate(b.date);
          if (!aDate && !bDate) return 0;
          if (!aDate) return -1;
          if (!bDate) return 1;
          return aDate.getTime() - bDate.getTime();
        })
        .map((item) => ({
          date: (() => {
            const formatted = formatDateToPtBr(item.date);
            const parts = formatted.split('/');
            return parts.length === 3 ? `${parts[0]}/${parts[1]}` : formatted;
          })(),
          peso: Number(item.weightKg) || 0,
        })),
    [weightHistory]
  );

  const weightHistoryWithVariation = useMemo(() => {
    const sorted = weightHistory
      .slice()
      .sort((a, b) => {
        const aDate = parseLocalDate(a.date);
        const bDate = parseLocalDate(b.date);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate.getTime() - aDate.getTime();
      });

    return sorted.map((item, index) => {
      const previousEntry = sorted[index + 1];
      const currentWeight = Number(item.weightKg);
      const previousWeight = Number(previousEntry?.weightKg);
      const variation =
        Number.isFinite(currentWeight) && Number.isFinite(previousWeight)
          ? currentWeight - previousWeight
          : null;

      return {
        ...item,
        variation,
        variationMeta: getVariationIndicator(variation),
      };
    });
  }, [weightHistory]);

  const currentBodyVariation = useMemo(() => {
    const currentWeight = parseNumberInput(body.weightKg);
    if (!Number.isFinite(currentWeight)) return null;

    const today = getLocalDateOnly();
    const latestEntry = weightHistoryWithVariation[0];
    const referenceEntry =
      latestEntry?.date === today
        ? weightHistoryWithVariation[1] || null
        : latestEntry || null;

    if (!referenceEntry) return null;

    const referenceWeight = Number(referenceEntry.weightKg);
    if (!Number.isFinite(referenceWeight)) return null;

    const variation = currentWeight - referenceWeight;

    return {
      referenceDate: referenceEntry.date,
      referenceWeight,
      variation,
      ...getVariationIndicator(variation),
    };
  }, [body.weightKg, weightHistoryWithVariation]);

  const handleChangeForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const removeMealItem = (index) => {
    setMealItems((prev) => prev.filter((_, i) => i !== index));
  };

  const normalizeDecimal = (value) => {
    if (!value) return value;
    return value.toString().replace(',', '.');
  };

  const handleSelectFood = (foodData) => {
    const parsedQuantity = Number(foodData.quantity);
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 100;
    const isWhey = foodData?.source === 'WHEY';
    const unitType = foodData?.unit_type || 'g';
    const displayUnit = isWhey ? 'scoop' : unitType;
    const quantityLabel = isWhey
      ? `${quantity} ${quantity === 1 ? 'scoop' : 'scoops'}`
      : `${quantity} ${displayUnit}`;
    const selectedItem = {
      nome: foodData.name,
      quantidade: quantityLabel,
      calorias: Number(foodData.calories) || 0,
      proteina: Number(foodData.protein) || 0,
    };

    setSelectedFood({
      name: selectedItem.nome,
      calories: selectedItem.calorias,
      protein: selectedItem.proteina,
      fat: Number(foodData.fat) || 0,
      carbs: Number(foodData.carbs) || 0,
      fiber: Number(foodData.fiber) || 0,
      serving_g: Number(foodData.serving_g) || 0,
      serving_qty: Number(foodData.serving_qty) || 0,
      serving_unit: foodData.serving_unit || '',
      source: foodData.source || null,
      unit_type: foodData.unit_type || null,
      quantity,
      quantity_label: quantityLabel,
    });

    setScanPreview((prev) => {
      if (Array.isArray(prev)) {
        return [...prev, selectedItem];
      }
      return [selectedItem];
    });
    setAddMealStep(3);
    setIsAddMealModalOpen(true);
  };

  useEffect(() => {
    if (!selectedFood) return;

    setForm((prev) => ({
      ...prev,
      food: selectedFood.name || prev.food,
      calories: String(selectedFood.calories ?? prev.calories ?? ''),
      protein: String(selectedFood.protein ?? prev.protein ?? ''),
      notes: selectedFood.quantity_label || prev.notes || '',
    }));
  }, [selectedFood]);

  const isHeicFile = (file) => {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();

    return (
      type === 'image/heic' ||
      type === 'image/heif' ||
      name.endsWith('.heic') ||
      name.endsWith('.heif')
    );
  };

  const shouldConvertToJpeg = (file) => {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();

    if (!type.startsWith('image/')) return false;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    return isHeicFile(file) || !allowedTypes.includes(type);
  };

  const convertImageToJpeg = async (file) => {
    const objectUrl = URL.createObjectURL(file);

    try {
      const imageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (event) => reject(event?.error || new Error('Falha ao carregar imagem.'));
        img.src = objectUrl;
      });

      const width = imageElement.naturalWidth || imageElement.width;
      const height = imageElement.naturalHeight || imageElement.height;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas não suportado para conversão de imagem.');
      }
      context.drawImage(imageElement, 0, 0, width, height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) return resolve(result);
            reject(new Error('Falha ao converter imagem para JPEG.'));
          },
          'image/jpeg',
          0.9,
        );
      });

      return new File([blob], 'scan.jpg', { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const prepareImageForScan = async (file) => {
    if (!file) return file;

    if (!shouldConvertToJpeg(file)) {
      return file;
    }

    return convertImageToJpeg(file);
  };

  const handleScanFood = async (file) => {
    setIsScanningFood(true);
    setIsAnalyzing(true);
    try {
      const sanitizedFile = await prepareImageForScan(file);
      const analysis = await scanFood(sanitizedFile, scanDescription);
      const foodsDetected = Array.isArray(analysis?.itens)
        ? analysis.itens
            .map((item) => ({
              name: item?.nome || 'Alimento escaneado',
              calories: Number(item?.calorias) || 0,
              protein: Number(item?.proteina) || 0,
              notes: item?.quantidade || '',
            }))
            .filter((item) => item.name)
        : [];

      setMealItems((prev) => [...prev, ...foodsDetected]);
      setScanPreview([]);
      if (foodsDetected.length > 0) {
        setAddMealStep(2);
        setIsAddMealModalOpen(true);
      }
      setError(null);
      if (typeof notify === 'function') {
        notify('Alimento escaneado com sucesso.', 'success');
      }
    } catch (err) {
      console.error('Erro ao escanear alimento', err);
      const message =
        err?.message || 'Não foi possível analisar a imagem do alimento.';
      setError(message);
      setScanPreview([]);
      if (typeof notify === 'function') {
        notify(message, 'error');
      }
    } finally {
      setIsScanningFood(false);
      setIsAnalyzing(false);
    }
  };

  const handleSelectImageForScan = () => {
    setIsScanModalOpen(true);
  };

  const ensureDescriptionBeforeUpload = () => {
    const trimmed = scanDescription.trim();
    if (trimmed.length < 3) {
      if (typeof notify === 'function') {
        notify('Descreva o alimento antes de enviar a foto.', 'warning');
      }
      return false;
    }
    return true;
  };

  const handleFoodImageChange = (event) => {
    if (!ensureDescriptionBeforeUpload()) {
      event.target.value = '';
      return;
    }

    const [file] = event.target.files || [];
    if (file) {
      void handleScanFood(file);
      setIsScanModalOpen(false);
    }
    event.target.value = '';
  };

  const handleCloseScanModal = () => {
    setIsScanModalOpen(false);
  };

  const handleOpenScanFilePicker = () => {
    if (!ensureDescriptionBeforeUpload()) {
      return;
    }

    if (isMobile()) {
      inputCameraRef.current?.click();
    } else {
      inputGalleryRef.current?.click();
    }
  };

  const handleAddEntry = async (event) => {
    event.preventDefault();
    if (!form.food && !form.calories) {
      return;
    }

    if (!userId) {
      setError('Usuário não identificado para salvar a refeição.');
      return;
    }

    const proteinValue = parseFloat(normalizeDecimal(form.protein));
    const caloriesValue = parseFloat(normalizeDecimal(form.calories));

    const isEditing = Boolean(editingId);

    const payload = {
      mealType: form.mealType,
      food: form.food,
      calories: Number.isFinite(caloriesValue) ? caloriesValue : 0,
      protein: Number.isFinite(proteinValue) ? proteinValue : 0,
      time: form.time,
      notes: form.notes,
      entryDate: selectedDate,
    };

    if (!isEditing) {
      const newItem = {
        name: form.food,
        calories: Number.isFinite(caloriesValue) ? caloriesValue : 0,
        protein: Number.isFinite(proteinValue) ? proteinValue : 0,
        notes: form.notes || '',
      };

      setMealItems((prev) => [...prev, newItem]);
      setForm((prev) => ({
        ...prev,
        food: '',
        calories: '',
        protein: '',
        notes: '',
      }));
      setFoodInputMode(null);
      setSelectedFood(null);
      setScanPreview(null);
      setScanDescription('');
      setAddMealStep(2);
      setError(null);
      if (typeof notify === 'function') {
        notify('Alimento adicionado à refeição.', 'success');
      }
      return;
    }

    setSavingEntry(true);

    try {
      if (isEditing) {
        const updated = await updateMeal(editingId, payload, supabase);
        setEntriesByDate((prev) => {
          const existing = prev[selectedDate] || [];
          return {
            ...prev,
            [selectedDate]: existing.map((item) =>
              item.id === editingId ? updated : item,
            ),
          };
        });
      } else {
        const created = await saveMeal({ userId, ...payload }, supabase);
        setEntriesByDate((prev) => {
          const existing = prev[selectedDate] || [];
          return {
            ...prev,
            [selectedDate]: [created, ...existing],
          };
        });
      }

      setForm({
        mealType: 'Almoço',
        food: '',
        calories: '',
        protein: '',
        time: '',
        notes: ''
      });
      setFoodInputMode(null);
      setSelectedFood(null);
      setScanPreview(null);
      setScanDescription('');
      setEditingId(null);
      setAddMealStep(1);
      setIsAddMealModalOpen(false);
      setError(null);
      if (typeof notify === 'function') {
        notify(
          isEditing
            ? 'Refeição atualizada com sucesso.'
            : 'Refeição adicionada com sucesso.',
          'success'
        );
      }
    } catch (err) {
      console.error('Falha ao salvar refeição', err);
      setError('Não foi possível salvar a refeição.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar a refeição.', 'error');
      }
    } finally {
      setSavingEntry(false);
    }
  };

  const handleEditEntry = (entry) => {
    setEditingId(entry.id);
    setAddMealStep(1);
    setIsAddMealModalOpen(true);
    setFoodInputMode(null);
    setSelectedFood(null);
    setMealItems([]);
    setForm({
      mealType: entry.mealType || 'Almoço',
      food: entry.food || '',
      calories: entry.calories != null ? String(entry.calories) : '',
      protein: entry.protein != null ? String(entry.protein) : '',
      time: entry.time || '',
      notes: entry.notes || ''
    });
  };

  const openAddMealModal = () => {
    setEditingId(null);
    setFoodInputMode(null);
    setSelectedFood(null);
    setMealItems([]);
    setScanPreview(null);
    setScanDescription('');
    setForm({
      mealType: 'Almoço',
      food: '',
      calories: '',
      protein: '',
      time: '',
      notes: ''
    });
    setAddMealStep(1);
    setIsAddMealModalOpen(true);
  };

  const closeAddMealModal = () => {
    setIsAddMealModalOpen(false);
    setAddMealStep(1);
    setEditingId(null);
    setSelectedFood(null);
    setMealItems([]);
  };

  const handleSaveMealItems = async () => {
    if (mealItems.length === 0) {
      if (typeof notify === 'function') {
        notify('Adicione pelo menos um alimento antes de salvar.', 'warning');
      }
      return;
    }

    if (!userId) {
      setError('Usuário não identificado para salvar a refeição.');
      return;
    }

    setSavingEntry(true);

    try {
      const createdItems = await Promise.all(
        mealItems.map((item) =>
          saveMeal(
            {
              userId,
              entryDate: selectedDate,
              mealType: form.mealType,
              food: item.name,
              calories: item.calories,
              protein: item.protein,
              time: form.time,
              notes: item.notes || null,
            },
            supabase,
          ),
        ),
      );

      setEntriesByDate((prev) => {
        const existing = prev[selectedDate] || [];
        return {
          ...prev,
          [selectedDate]: [...createdItems.reverse(), ...existing],
        };
      });

      setForm({
        mealType: 'Almoço',
        food: '',
        calories: '',
        protein: '',
        time: '',
        notes: ''
      });
      setFoodInputMode(null);
      setSelectedFood(null);
      setScanPreview(null);
      setScanDescription('');
      setMealItems([]);
      setEditingId(null);
      setAddMealStep(1);
      setIsAddMealModalOpen(false);
      setError(null);
      if (typeof notify === 'function') {
        notify('Refeição adicionada com sucesso.', 'success');
      }
    } catch (err) {
      console.error('Falha ao salvar refeição', err);
      setError('Não foi possível salvar a refeição.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar a refeição.', 'error');
      }
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    try {
      await deleteMeal(entryId, supabase);
      setEntriesByDate((prev) => {
        const existing = prev[selectedDate] || [];
        const updated = existing.filter((item) => item.id !== entryId);
        return {
          ...prev,
          [selectedDate]: updated
        };
      });
      if (typeof notify === 'function') {
        notify('Refeição excluída.', 'success');
      }
    } catch (err) {
      console.warn('Erro ao excluir refeição', err);
      setError('Não foi possível excluir a refeição.');
      if (typeof notify === 'function') {
        notify('Não foi possível excluir a refeição.', 'error');
      }
    }
  };

  const handleEditWeightEntry = (entry) => {
    if (!entry) return;
    setBodyDraft({
      sex: sex || null,
      weightKg: entry.weightKg != null ? String(entry.weightKg) : body.weightKg,
      heightCm: body.heightCm || '',
      goalType: goalType || 'maintain',
      goalWeightKg: body.goalWeightKg || '',
    });
    setBodyWizardStep(1);
    setIsBodyWizardOpen(true);
  };

  const handleDeleteWeightEntry = async (entry) => {
    if (!entry || !entry.date || !entry.recordedAt || !userId) return;

    try {
      const { error: deleteError } = await supabase
        .from('food_weight_history')
        .delete()
        .match({
          user_id: userId,
          entry_date: entry.date,
          recorded_at: entry.recordedAt,
        });

      if (deleteError) throw deleteError;

      // Atualiza o estado local removendo o item
      setWeightHistory((prev) =>
        prev.filter(
          (item) =>
            !(item.date === entry.date && item.recordedAt === entry.recordedAt),
        ),
      );

      if (typeof notify === 'function') {
        notify('Registro de peso excluído.', 'success');
      }
    } catch (err) {
      console.error('Erro ao excluir registro de peso', err);
      setError('Não foi possível excluir o registro de peso.');
      if (typeof notify === 'function') {
        notify('Não foi possível excluir o registro de peso.', 'error');
      }
    }
  };

  const hasBodyRegistration = useMemo(() => {
    const hasWeightHistory = weightHistory.length > 0;
    const hasCurrentWeight = Number.isFinite(parseNumberInput(body.weightKg));
    const hasHeight = Number.isFinite(parseNumberInput(body.heightCm));
    return hasWeightHistory || hasCurrentWeight || hasHeight;
  }, [weightHistory.length, body.weightKg, body.heightCm]);

  const openBodyWizard = async () => {
    setBodyDraft({
      sex: sex || null,
      weightKg: body.weightKg || '',
      heightCm: body.heightCm || '',
      goalType: goalType || 'maintain',
      goalWeightKg: body.goalWeightKg || '',
    });
    setBodyWizardStep(1);
    setIsBodyWizardOpen(true);

    if (!supabase || !userId) {
      return;
    }

    try {
      const { data, error: profileError } = await supabase
        .from('food_diary_profile')
        .select('sex, weight, height_cm, objective, goal_weight')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      const resolvedHeight = data?.height_cm ?? data?.height ?? null;

      if (data?.sex || resolvedHeight != null) {
        if (data?.sex) {
          setSex(data.sex);
        }

        setBodyDraft((prev) => ({
          ...prev,
          ...(data?.sex ? { sex: data.sex } : {}),
          ...(resolvedHeight != null ? { heightCm: String(resolvedHeight) } : {}),
        }));
      }
    } catch (err) {
      console.warn('Não foi possível pré-carregar sexo do perfil.', err);
    }
  };

  const handleBodyDraftChange = (field, value) => {
    if ((field === 'weightKg' || field === 'heightCm' || field === 'goalWeightKg') && !isValidDecimalInput(value)) {
      return;
    }
    setBodyDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveBodyWizard = async () => {
    try {
      if (!userId) {
        setError('Usuário não identificado para salvar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar o peso.', 'error');
        }
        return;
      }

      const normalizedWeight = parseNumberInput(bodyDraft.weightKg);
      if (!Number.isFinite(normalizedWeight)) {
        setError('Não foi possível salvar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar o peso.', 'error');
        }
        return;
      }

      const normalizedHeight = parseNumberInput(bodyDraft.heightCm);
      const normalizedGoalWeight = parseNumberInput(bodyDraft.goalWeightKg);
      const normalizedObjective = goalTypeToObjective[bodyDraft.goalType] || 'manter_peso';
      const normalizedSex = bodyDraft.sex === 'male' || bodyDraft.sex === 'female' ? bodyDraft.sex : null;

      if (!normalizedSex) {
        setError('Selecione o sexo para continuar.');
        if (typeof notify === 'function') {
          notify('Selecione o sexo para continuar.', 'error');
        }
        return;
      }

      const bodyPayload = {
        user_id: userId,
        weight: Number(normalizedWeight),
        height_cm: normalizedHeight != null ? Number(normalizedHeight) : null,
        goal_weight: normalizedGoalWeight != null ? Number(normalizedGoalWeight) : null,
        goal_type: bodyDraft.goalType || 'maintain',
        objective: normalizedObjective,
        sex: normalizedSex,
      };
      const data = {
        user_id: userId,
        weight: normalizedWeight,
        height_cm: normalizedHeight,
        goal_weight: normalizedGoalWeight,
        goal_type: bodyDraft.goalType || 'maintain',
        objective: normalizedObjective,
        sex: normalizedSex,
      };

      console.log('ENVIANDO:', data);
      console.log('ENVIANDO:', {
        weight: bodyPayload.weight,
        goal_weight: bodyPayload.goal_weight,
        objective: bodyPayload.objective,
      });
      console.log('Payload corpo:', data);

      const response = await fetch(buildApiUrl(apiBaseUrl, '/body'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      const bodyResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(bodyResponse?.error || 'Não foi possível salvar os dados corporais.');
      }

      const responseGoals = bodyResponse?.goals ?? {};
      const normalizedGoals = {
        calories: Number(responseGoals.calorie_goal || 0),
        protein: Number(responseGoals.protein_goal || 0),
        water: Number(responseGoals.water_goal_l || 0),
      };
      const responseGoalMode = responseGoals?.goal_mode;
      const shouldApplyAutomaticGoals = responseGoalMode === 'auto';

      if (
        shouldApplyAutomaticGoals &&
        Number.isFinite(normalizedGoals.calories) &&
        normalizedGoals.calories > 0 &&
        Number.isFinite(normalizedGoals.protein) &&
        normalizedGoals.protein > 0 &&
        Number.isFinite(normalizedGoals.water) &&
        normalizedGoals.water > 0
      ) {
        setGoals(normalizedGoals);
        setWaterSummary((prev) => ({
          ...prev,
          goalMl: normalizedGoals.water * 1000,
        }));
        if (lastSavedWaterGoalRef.current !== normalizedGoals.water) {
          setHydrationRefreshToken((prev) => prev + 1);
          lastSavedWaterGoalRef.current = normalizedGoals.water;
        }
        await updateHydrationGoal({ goalLiters: normalizedGoals.water }, supabase);
      }
      if (responseGoalMode === 'manual' || responseGoalMode === 'auto') {
        setGoalMode(responseGoalMode);
      }

      const refreshedHistory = await fetchWeightHistoryFromDb(userId);
      setWeightHistory(refreshedHistory);
      setObjective(normalizedObjective);
      setGoalType(bodyDraft.goalType || 'maintain');
      setSex(normalizedSex);
      setBody({
        weightKg: String(normalizedWeight),
        heightCm: normalizedHeight != null ? String(normalizedHeight) : '',
        goalWeightKg: normalizedGoalWeight != null ? String(normalizedGoalWeight) : '',
      });
      setIsBodyWizardOpen(false);

      if (typeof notify === 'function') {
        notify('Dados corporais salvos com sucesso.', 'success');
      }
    } catch (error) {
      console.error('Erro ao salvar corpo:', error);
      setError('Não foi possível salvar o peso.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar o peso.', 'error');
      }
    }
  };

  const openGoalsModal = () => {
    setManualGoalsDraft({
      calories: goals?.calories != null ? String(goals.calories) : '',
      protein: goals?.protein != null ? String(goals.protein) : '',
      water: goals?.water != null ? String(goals.water) : '',
    });
    setGoalsModalStep(1);
    setIsGoalsModalOpen(true);
  };

  const handleManualGoalsDraftChange = (field, value) => {
    if (!isValidDecimalInput(value)) return;
    setManualGoalsDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveManualGoals = async () => {
    try {
      const calories = parseNumberInput(manualGoalsDraft.calories);
      const protein = parseNumberInput(manualGoalsDraft.protein);
      const water = parseNumberInput(manualGoalsDraft.water);

      if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(water)) {
        throw new Error('Preencha calorias, proteína e água com valores válidos.');
      }

      const headers = await getAuthHeaders(supabase);
      const response = await fetch(buildApiUrl(apiBaseUrl, '/goals/manual'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          calories,
          protein,
          water,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erro ao atualizar metas');
      }

      await refreshGoalsFromProfile();
      await updateHydrationGoal({ goalLiters: Number(water) }, supabase);
      setIsGoalsModalOpen(false);
      if (typeof notify === 'function') {
        notify('Metas manuais salvas com sucesso.', 'success');
      }
    } catch (err) {
      console.error('Erro ao salvar metas manuais:', err);
      setError('Não foi possível atualizar metas manuais.');
      if (typeof notify === 'function') {
        notify(err?.message || 'Não foi possível atualizar metas manuais.', 'error');
      }
    }
  };

  const openDailyWeightModal = () => {
    setDailyWeightDraft({
      weightKg: body.weightKg || '',
      entryDate: getLocalDateOnly(),
    });
    setIsDailyWeightModalOpen(true);
  };

  const handleDailyWeightDraftChange = (field, value) => {
    if (field === 'weightKg' && !isValidDecimalInput(value)) {
      return;
    }
    setDailyWeightDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveDailyWeight = async () => {
    try {
      if (!userId) {
        setError('Usuário não identificado para registrar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível registrar o peso.', 'error');
        }
        return;
      }

      const normalizedWeight = parseNumberInput(dailyWeightDraft.weightKg);
      if (!Number.isFinite(normalizedWeight)) {
        setError('Informe um peso válido para registrar.');
        if (typeof notify === 'function') {
          notify('Informe um peso válido.', 'error');
        }
        return;
      }

      if (!supabase) {
        throw new Error('Supabase não disponível para registrar o peso.');
      }

      const normalizedEntryDate = toStorageDateString(dailyWeightDraft.entryDate);

      const { data: existingWeightEntry, error: existingWeightError } = await supabase
        .from('food_weight_history')
        .select('id')
        .eq('user_id', userId)
        .eq('entry_date', normalizedEntryDate)
        .maybeSingle();

      if (existingWeightError) {
        throw existingWeightError;
      }

      if (existingWeightEntry?.id) {
        const { error: updateError } = await supabase
          .from('food_weight_history')
          .update({
            weight_kg: Number(normalizedWeight),
            recorded_at: new Date().toISOString(),
          })
          .eq('id', existingWeightEntry.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase
          .from('food_weight_history')
          .insert([
            {
              user_id: userId,
              weight_kg: Number(normalizedWeight),
              entry_date: normalizedEntryDate,
              recorded_at: new Date().toISOString(),
            },
          ]);

        if (insertError) {
          throw insertError;
        }
      }

      const { error: profileSyncError } = await supabase
        .from('food_diary_profile')
        .upsert({
          user_id: userId,
          weight: Number(normalizedWeight),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (profileSyncError) {
        throw profileSyncError;
      }

      const refreshedHistory = await fetchWeightHistoryFromDb(userId);
      setWeightHistory(refreshedHistory);
      setBody((prev) => ({
        ...prev,
        weightKg: String(normalizedWeight),
      }));
      setIsDailyWeightModalOpen(false);

      if (typeof notify === 'function') {
        notify('Peso do dia registrado com sucesso.', 'success');
      }
    } catch (err) {
      console.error('Erro ao registrar peso do dia', err);
      alert('Erro ao salvar peso');
      setError('Não foi possível registrar o peso do dia.');
      if (typeof notify === 'function') {
        notify('Não foi possível registrar o peso do dia.', 'error');
      }
    }
  };

  const handleHydrationStateChange = (state) => {
    const totalMl = Number(state?.totalMl ?? 0);
    const goalMl = Number(state?.goalMl ?? defaultGoals.water * 1000);

    setWaterSummary({ totalMl, goalMl });

    if (!hydrationGoalLoaded && Number.isFinite(goalMl) && goalMl > 0) {
      setGoals((prev) => ({
        ...prev,
        water: Number((goalMl / 1000).toFixed(2)),
      }));
      setHydrationGoalLoaded(true);
      lastSavedWaterGoalRef.current = Number((goalMl / 1000).toFixed(2));
    }
  };

  const todayCaloriesText = `Hoje você comeu ${formatNumber(
    totals.totalCalories,
    0
  )} kcal`;
  const scanHelpText = 'Ajude a identificar melhor o seu alimento';
  const mealIcons = {
    'Café da manhã': '🍳',
    Almoço: '🍽',
    Jantar: '🍲',
    Lanche: '🍎',
    'Pós-treino': '🥤',
  };

  const mealsOfDay = useMemo(() => {
    const grouped = dayEntries.reduce((acc, item) => {
      const key = item.mealType || 'Outros';
      if (!acc[key]) {
        acc[key] = { mealType: key, count: 0, calories: 0, items: [] };
      }
      acc[key].count += 1;
      acc[key].calories += Number(item.calories) || 0;
      acc[key].items.push(item);
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.calories - a.calories);
  }, [dayEntries]);

  const renderSummaryCard = () => (
    <div className="food-diary-summary-card card-padrao">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
        Resumo do dia
      </h5>
      <div className="muted" style={{ fontSize: 13 }}>
        {todayCaloriesText}
      </div>
      <div className="food-diary-meta-list">
        <div className="food-diary-meta-row">
          <div>
            Calorias:{' '}
            <strong>
              {formatNumber(totalCalories, 0)} / {formatNumber(calorieGoal, 0)} kcal
            </strong>
          </div>
          <div className="food-diary-bar">
            {renderBlocks(totals.totalCalories, goals.calories || 1)}
          </div>
        </div>

        <div className="food-diary-meta-row">
          <div>
            Proteína:{' '}
            <strong>
              {formatNumber(totalProtein, 0)} / {formatNumber(proteinGoal, 0)} g
            </strong>
          </div>
          <div className="food-diary-bar">
            {renderBlocks(totals.totalProtein, goals.protein || 1)}
          </div>
        </div>

        <div className="food-diary-meta-row">
          <div>
            Água:{' '}
            <strong>
              {formatNumber(waterTotalLiters, 1)} / {formatNumber(waterGoalLiters, 1)} L
            </strong>
          </div>
          <div className="food-diary-bar">
            {renderBlocks(waterTotalLiters, waterGoalLiters || 1)}
          </div>
        </div>
      </div>

      {goalsMet ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: '#16a34a',
          }}
        >
          ✅ Meta do dia batida. Bom trabalho!
        </div>
      ) : null}
    </div>
  );

  const GoalsSummaryCard = () => (
    <div className="food-diary-summary-card card-padrao">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
        Resumo das metas
      </h5>
      {hasAutomaticGoals ? (
        <>
          <div className="food-diary-meta-list">
            <div>
              Objetivo atual
              <div><strong>{goalTypeLabel}</strong></div>
            </div>
            <div>
              Calorias alvo
              <div><strong>{formatNumber(calorieGoal, 0)} kcal</strong></div>
            </div>
            <div>
              Proteína alvo
              <div><strong>{formatNumber(proteinGoal, 1)} g</strong></div>
            </div>
            <div>
              Água alvo
              <div><strong>{formatNumber(waterGoalLiters, 2)} L</strong></div>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            Essas metas foram calculadas automaticamente com base no seu peso e objetivo corporal.
          </div>

          <div className="food-diary-summary-card card-padrao" style={{ marginTop: 12 }}>
            <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
              {objectiveExplanation.title}
            </h5>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
              {objectiveExplanation.explanation}
            </p>
            {objective === 'perder_peso' ? (
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                📉 Ritmo estimado: ~0,5kg por semana
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>
          Preencha seu corpo para gerar metas automáticas.
        </div>
      )}
    </div>
  );

  const weightGoalMetaText =
    body.goalWeightKg != null && body.goalWeightKg !== ''
      ? `${formatNumber(body.goalWeightKg, 1)} kg`
      : '—';

  const latestWeight = parseNumberInput(getLatestWeight(weightHistory, body));

  const BodySummaryCard = () => (
    <div className="food-diary-summary-card card-body card-corpo">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
        Seu corpo hoje
      </h5>

      <div className="body-grid">
        <div className="body-box">
          <span>Peso atual</span>
          <strong>{Number.isFinite(latestWeight) ? `${formatNumber(latestWeight, 1)} kg` : '—'}</strong>
        </div>
        <div className="body-box">
          <span>Meta</span>
          <strong>{weightGoalMetaText}</strong>
        </div>
        <div className="body-box highlight">
          <span>Variação</span>
          {currentBodyVariation ? (
            <strong>
              {currentBodyVariation.text}
            </strong>
          ) : (
            <strong>—</strong>
          )}
        </div>
      </div>

      {currentBodyVariation?.referenceDate && (
        <div className="muted" style={{ fontSize: 12 }}>
          Comparado com {formatWorkoutDatePtBr(currentBodyVariation.referenceDate)} ({formatNumber(currentBodyVariation.referenceWeight, 1)} kg).
        </div>
      )}
    </div>
  );

  const BmiCard = () => (
    <div className="food-diary-summary-card card-imc">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>IMC e classificação</h5>

      {bmi ? (
        <>
          <div>
            IMC atual
            <div><strong>{formatNumber(bmi.value, 1)}</strong></div>
          </div>
          <div>
            Classificação
            <div><strong>{bmi.label}</strong></div>
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          Preencha altura e peso para calcular o IMC.
        </div>
      )}

      {healthyWeightRange && (
        <div className="muted" style={{ fontSize: 12 }}>
          Peso saudável estimado:{' '}
          <strong>
            {formatNumber(healthyWeightRange.min, 1)}kg – {formatNumber(healthyWeightRange.max, 1)}kg
          </strong>
        </div>
      )}
    </div>
  );

  const WeightEvolutionCard = () => (
    <div className="food-diary-summary-card card-grafico">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>Evolução do peso</h5>
      {weightChartData.length > 0 ? (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={weightChartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" unit="kg" />
              <Tooltip
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="peso" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          Adicione registros de peso para visualizar a tendência.
        </div>
      )}
    </div>
  );

  return (
    <>
      {isScanningFood && (
        <div className="scan-overlay">
          <div className="scan-overlay-box">
            <div className="scan-spinner"></div>

            <h3>🔎 Analisando sua refeição</h3>

            <p>⏳ Aguarde um momento</p>

            <p>
              Estamos identificando os alimentos da foto enviada.
            </p>

            <p>
              Isso pode levar até 40 segundos.
            </p>
          </div>
        </div>
      )}

      <div className="food-diary">
      {isScanModalOpen && (
        <div className="scan-modal-backdrop scan-modal-backdrop--top">
          <div className="scan-modal">
            {isAnalyzing ? (
              <div className="scanner-loading">
                <div className="scanner-loading-content">
                  <div className="spinner"></div>
                  <h3>🔎 Analisando sua refeição</h3>
                  <p>⏳ Aguarde um momento</p>
                  <p>
                    Estamos identificando os alimentos da foto enviada.
                  </p>
                  <p>
                    Isso pode levar até 40 segundos.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="scan-modal-title">
                  Para analisar melhor, descreva rapidamente o que você está comendo.
                </div>
                <div className="scan-modal-body">
                  <small className="food-help-text">{scanHelpText}</small>
                  <input
                    type="text"
                    placeholder="Ex.: arroz, feijão e frango grelhado"
                    value={scanDescription}
                    onChange={(e) => setScanDescription(e.target.value)}
                  />

                  <div className="scan-file-row">
                    <input
                      ref={inputCameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handleFoodImageChange}
                    />
                    <input
                      ref={inputGalleryRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFoodImageChange}
                    />
                    <button
                      type="button"
                      className="primary full"
                      onClick={handleOpenScanFilePicker}
                    >
                      {isMobile() ? 'Abrir câmera' : 'Escolher foto'}
                    </button>
                  </div>
                </div>

                <div className="row scan-modal-actions">
                  <button type="button" className="ghost" onClick={handleCloseScanModal}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="content-wrapper">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <h2 style={{ margin: 0 }}>🍽 Alimentação</h2>

          <button
            type="button"
            className="btn-primary"
            onClick={openAddMealModal}
            style={{
              display: 'inline-flex',
            }}
          >
            + Novo Alimento
          </button>
        </div>

        <div className="sep" style={{ marginTop: 12 }}></div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            marginTop: '10px',
          }}
        >
          {[
            { key: 'diario', label: '📖 Diário' },
            { key: 'agua', label: '💧 Água' },
            { key: 'relatorios', label: '📊 Relatórios' },
          ].map((subTab) => (
            <button
              key={subTab.key}
              type="button"
              className={activeSubTab === subTab.key ? 'subtab active' : 'subtab'}
              onClick={() => setActiveSubTab(subTab.key)}
            >
              {subTab.label}
            </button>
          ))}
        </div>

      {activeSubTab === 'diario' && (
        <>
          {renderSummaryCard()}
          <div className="sep" style={{ margin: '10px 0 14px' }}></div>
          <div>
            <h4 className="title" style={{ margin: '0 0 10px' }}>Refeições de hoje</h4>
            {mealsOfDay.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>
                Nenhuma refeição registrada para este dia.
              </div>
            )}

            {mealsOfDay.map((meal) => {
              const isExpanded = Boolean(expandedMeals[meal.mealType]);
              return (
                <div key={meal.mealType} className="food-diary-entry">
                  <div className="food-diary-entry-header">
                    <span>
                      <strong>{mealIcons[meal.mealType] || '🍽'} {meal.mealType}</strong>
                    </span>
                    <span>{formatNumber(meal.calories, 0)} kcal</span>
                  </div>
                  <div className="food-diary-entry-meta" style={{ justifyContent: 'space-between' }}>
                    <span>{meal.count} {meal.count === 1 ? 'alimento' : 'alimentos'}</span>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() =>
                        setExpandedMeals((prev) => ({
                          ...prev,
                          [meal.mealType]: !prev[meal.mealType],
                        }))
                      }
                    >
                      {isExpanded ? 'Ocultar alimentos' : 'Ver alimentos'}
                    </button>
                  </div>

                  {isExpanded && meal.items.map((item) => (
                    <div
                      key={item.id}
                      className="border-b border-blue-500/10 pb-2 mb-2"
                      style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="food-diary-entry-header">
                        <span>
                          {item.food || 'Alimento sem nome'}
                          {item.time && <span className="muted"> • {item.time}</span>}
                        </span>
                        <span>{formatNumber(item.calories, 0)} kcal</span>
                      </div>
                      <div className="food-diary-entry-meta">
                        {item.protein ? <span>{formatNumber(item.protein, 0)} g proteína</span> : null}
                      </div>
                      <div className="table-actions" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                        <button
                          type="button"
                          className="icon-button p-2 rounded-lg border border-blue-500/20 hover:bg-blue-500/10 transition"
                          onClick={() => handleEditEntry(item)}
                          title="Editar refeição"
                        >
                          <span role="img" aria-label="Editar">✏️</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button p-2 rounded-lg border border-blue-500/20 hover:bg-blue-500/10 transition"
                          onClick={() => handleDeleteEntry(item.id)}
                          title="Excluir refeição"
                        >
                          <span role="img" aria-label="Excluir">🗑️</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {isAddMealModalOpen && (
            <div className="scan-modal-backdrop meal-wizard-backdrop">
              <div className="scan-modal" style={{ maxWidth: 720 }}>
                <h4 className="title" style={{ marginTop: 0 }}>
                  {editingId ? 'Editar alimento' : 'Cadastrar alimento'}
                </h4>
                <form onSubmit={handleAddEntry} className="food-diary-form" autoComplete="off">
                  <div style={{ marginBottom: 12 }}>
                    <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>
                      Passo {addMealStep} de 3
                    </div>
                    {addMealStep === 1 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Informações da refeição</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          Informe a data, a refeição e o horário.
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        height: 6,
                        width: '100%',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.12)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(addMealStep / 3) * 100}%`,
                          background: 'var(--accent, #6ba8ff)',
                          transition: 'width 160ms ease',
                        }}
                      />
                    </div>
                  </div>

                  {addMealStep === 1 && (
                    <>
                      <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: 180 }}>
                          <label>📅 Data</label>
                          <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                          />
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 180 }}>
                          <label>🍽 Refeição</label>
                          <select
                            value={form.mealType}
                            onChange={(e) => handleChangeForm('mealType', e.target.value)}
                          >
                            <option>Café da manhã</option>
                            <option>Almoço</option>
                            <option>Jantar</option>
                            <option>Lanche</option>
                            <option>Pós-treino</option>
                          </select>
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 180 }}>
                          <label>⏰ Horário</label>
                          <input
                            type="time"
                            value={form.time}
                            onChange={(e) => handleChangeForm('time', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                        <button type="button" className="ghost" onClick={closeAddMealModal}>
                          ← Cancelar
                        </button>
                        <button type="button" className="primary" onClick={() => setAddMealStep(2)}>
                          Continuar →
                        </button>
                      </div>
                    </>
                  )}

                  {addMealStep === 2 && (
                    <>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button
                          type="button"
                          className={foodInputMode === 'buscar' ? 'primary small' : 'ghost small'}
                          onClick={() => {
                            setFoodInputMode('buscar');
                            setIsFoodPickerOpen(true);
                          }}
                          disabled={isScanningFood}
                        >
                          Adicionar alimento
                        </button>
                        <button
                          type="button"
                          className={foodInputMode === 'scan' ? 'primary small' : 'ghost small'}
                          onClick={() => {
                            setFoodInputMode('scan');
                            handleSelectImageForScan();
                          }}
                          disabled={isScanningFood}
                        >
                          Escanear comida
                        </button>
                      </div>


                      {mealItems.length > 0 && (
                        <div className="scan-preview-card" style={{ marginBottom: 10 }}>
                          <div className="scan-preview-header">
                            <strong>Itens da refeição</strong>
                          </div>
                          <div className="scan-preview-list meal-items-container">
                            {mealItems.map((item, index) => (
                              <div key={`${item.name || 'item'}-${index}`} className="meal-item">
                                <span>
                                  {item.name} — {formatNumber(item.calories, 0)} kcal
                                  {item.notes ? ` • ${item.notes}` : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeMealItem(index)}
                                  className="remove-food-button"
                                  aria-label={`Remover ${item.name || 'item'} da refeição`}
                                >
                                  🗑
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="muted" style={{ marginTop: 8 }}>
                            <strong>Total da refeição</strong>
                            <div>{formatNumber(mealTotalCalories, 0)} kcal</div>
                            <div>{formatNumber(mealTotalProtein, 1)} g proteína</div>
                          </div>
                        </div>
                      )}

                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="ghost" onClick={() => setAddMealStep(1)}>
                          Voltar
                        </button>
                        <button type="button" className="primary" onClick={handleSaveMealItems}>
                          Salvar refeição
                        </button>
                      </div>
                    </>
                  )}

                  {addMealStep === 3 && (
                    <>
                      <div className="field">
                        <label>Alimento</label>
                        <input
                          type="text"
                          placeholder="Ex.: Arroz, frango grelhado, iogurte..."
                          value={form.food}
                          onChange={(e) => handleChangeForm('food', e.target.value)}
                        />
                      </div>

                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: 180 }}>
                          <label>Calorias (kcal)</label>
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            min="0"
                            value={form.calories}
                            onChange={(e) => {
                              const normalized = normalizeDecimal(e.target.value);
                              handleChangeForm('calories', normalized);
                            }}
                            placeholder="Ex.: 250"
                          />
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 180 }}>
                          <label>Proteína (g) – opcional</label>
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            min="0"
                            value={form.protein}
                            onChange={(e) => {
                              const normalized = normalizeDecimal(e.target.value);
                              handleChangeForm('protein', normalized);
                            }}
                            placeholder="Ex.: 25"
                          />
                        </div>
                      </div>

                      <div className="field">
                        <label>Observações</label>
                        <textarea
                          rows="2"
                          placeholder="Ex.: refeição pré-treino, comi com pressa, etc."
                          value={form.notes}
                          onChange={(e) => handleChangeForm('notes', e.target.value)}
                        ></textarea>
                      </div>

                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                        <button type="button" className="ghost" onClick={() => setAddMealStep(2)}>
                          Voltar
                        </button>
                        <button type="submit" className="primary">
                          {editingId ? 'Salvar' : 'Adicionar alimento'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {activeSubTab === 'agua' && (
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            width: '100%',
            padding: '0 16px',
            boxSizing: 'border-box',
          }}
        >
          <HydrationCard
            key={`${selectedDate}-${hydrationRefreshToken}`}
            userId={userId}
            supabase={supabase}
            notify={notify}
            selectedDate={selectedDate}
            onStateChange={handleHydrationStateChange}
          />
        </div>
      )}

      {isWeightHistoryModalOpen && (
        <div className="modal-overlay">
          <div className="report-modal weight-history-modal">
            <h2>Histórico de peso</h2>
            {weightHistoryWithVariation.length > 0 ? (
              <div className="weight-history-scroll">
                <div className="weight-history-table">
                  <div className="weight-history-header">
                    <span>Data</span>
                    <span>Peso</span>
                    <span>Variação</span>
                    <span aria-hidden="true"></span>
                  </div>

                  {weightHistoryWithVariation.map((item) => (
                    <div
                      key={`${item.date}-${item.recordedAt}`}
                      className="weight-history-row"
                    >
                      <span>{formatDateToPtBr(item.date)}</span>
                      <span>{formatNumber(item.weightKg, 1)} kg</span>
                      <span className={`weight-variation-badge ${item.variationMeta.className}`}>
                        {item.variationMeta.icon} {item.variationMeta.text}
                      </span>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleEditWeightEntry(item)}
                          title="Editar peso"
                        >
                          <span role="img" aria-label="Editar">✏️</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleDeleteWeightEntry(item)}
                          title="Excluir peso"
                        >
                          <span role="img" aria-label="Excluir">🗑️</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Nenhum registro de peso encontrado.
              </div>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setIsWeightHistoryModalOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {isBodyWizardOpen && (
        <div className="modal-overlay">
          <div className="report-modal food-goals-wizard-modal">
            <h2>Registrar Corpo</h2>
            <p>Passo {bodyWizardStep} de 4</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(bodyWizardStep / 4) * 100}%` }}
              />
            </div>

            {bodyWizardStep === 1 && (
              <div>
                <h3>Você é:</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`objetivo-btn ${bodyDraft.sex === 'male' ? 'active' : ''}`}
                    onClick={() => handleBodyDraftChange('sex', 'male')}
                  >
                    Homem
                  </button>
                  <button
                    type="button"
                    className={`objetivo-btn ${bodyDraft.sex === 'female' ? 'active' : ''}`}
                    onClick={() => handleBodyDraftChange('sex', 'female')}
                  >
                    Mulher
                  </button>
                </div>
              </div>
            )}

            {bodyWizardStep === 2 && (
              <div style={{ display: 'grid', gap: 12 }}>
                <h3>Dados atuais</h3>
                <div className="field">
                  <label>Peso atual (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={bodyDraft.weightKg}
                    onChange={(e) => handleBodyDraftChange('weightKg', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Altura (cm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={bodyDraft.heightCm}
                    onChange={(e) => handleBodyDraftChange('heightCm', e.target.value)}
                  />
                </div>
              </div>
            )}

            {bodyWizardStep === 3 && (
              <div>
                <h3>Objetivo</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {goalTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`objetivo-btn ${bodyDraft.goalType === option.value ? 'active' : ''}`}
                      onClick={() => handleBodyDraftChange('goalType', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bodyWizardStep === 4 && (
              <div className="field">
                <h3>Meta</h3>
                <label>Meta de peso (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bodyDraft.goalWeightKg}
                  onChange={(e) => handleBodyDraftChange('goalWeightKg', e.target.value)}
                />
              </div>
            )}

            <div className="wizard-actions">
              {bodyWizardStep > 1 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setBodyWizardStep((prev) => prev - 1)}
                >
                  ← Voltar
                </button>
              )}

              {bodyWizardStep < 4 && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    if (bodyWizardStep === 1 && !bodyDraft.sex) {
                      alert('Selecione seu sexo para continuar');
                      setError('Selecione o sexo para continuar.');
                      if (typeof notify === 'function') {
                        notify('Selecione o sexo para continuar.', 'error');
                      }
                      return;
                    }
                    setBodyWizardStep((prev) => prev + 1);
                  }}
                >
                  Continuar →
                </button>
              )}

              {bodyWizardStep === 4 && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveBodyWizard}
                >
                  Salvar dados
                </button>
              )}

              <button
                type="button"
                className="ghost"
                onClick={() => setIsBodyWizardOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isDailyWeightModalOpen && (
        <div className="modal-overlay">
          <div className="report-modal food-goals-wizard-modal">
            <h2>Registrar Peso do Dia</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="field">
                <label>Peso (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={dailyWeightDraft.weightKg}
                  onChange={(e) => handleDailyWeightDraftChange('weightKg', e.target.value)}
                  placeholder="Ex.: 72,5"
                />
              </div>
              <div className="field">
                <label>Data</label>
                <input
                  type="date"
                  value={dailyWeightDraft.entryDate}
                  onChange={(e) => handleDailyWeightDraftChange('entryDate', e.target.value)}
                />
              </div>
            </div>
            <div className="wizard-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveDailyWeight}
              >
                Salvar peso
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setIsDailyWeightModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isGoalsModalOpen && (
        <div className="modal-overlay">
          <div className="report-modal food-goals-wizard-modal">
            <h2>Editar metas</h2>
            <p>Passo {goalsModalStep} de 3</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(goalsModalStep / 3) * 100}%` }}
              />
            </div>

            {goalsModalStep === 1 && (
              <div className="field">
                <h3>Calorias</h3>
                <label>Meta diária (kcal)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualGoalsDraft.calories}
                  onChange={(e) => handleManualGoalsDraftChange('calories', e.target.value)}
                />
              </div>
            )}

            {goalsModalStep === 2 && (
              <div className="field">
                <h3>Proteína</h3>
                <label>Meta diária (g)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualGoalsDraft.protein}
                  onChange={(e) => handleManualGoalsDraftChange('protein', e.target.value)}
                />
              </div>
            )}

            {goalsModalStep === 3 && (
              <div className="field">
                <h3>Água</h3>
                <label>Meta diária (L)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualGoalsDraft.water}
                  onChange={(e) => handleManualGoalsDraftChange('water', e.target.value)}
                />
              </div>
            )}

            <div className="wizard-actions">
              {goalsModalStep > 1 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setGoalsModalStep((prev) => prev - 1)}
                >
                  ← Voltar
                </button>
              )}
              {goalsModalStep < 3 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setGoalsModalStep((prev) => prev + 1)}
                >
                  Continuar →
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={handleSaveManualGoals}>
                  Salvar metas
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => setIsGoalsModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'relatorios' && (
        <NutritionReports
          userId={userId}
          supabase={supabase}
          selectedDate={selectedDate}
          goals={goals}
        />
      )}

      {isFoodPickerOpen && (
        <FoodPicker
          open={isFoodPickerOpen}
          onClose={() => setIsFoodPickerOpen(false)}
          onSelectFood={handleSelectFood}
        />
      )}
      </div>
      </div>
    </>
  );
}

export default FoodDiary;
