import React, { useEffect, useMemo, useRef, useState } from 'react';
import FoodPicker from '../FoodPicker';
import {
  deleteMeal,
  fetchMealsByDate,
  saveMeal,
  updateMeal,
} from '../foodDiaryApi';
import FoodDiaryReports from './FoodDiaryReports';
import GeneralReport from './GeneralReport';
import HydrationCard from './HydrationCard';
import { updateHydrationGoal } from '../hydrationApi';
import { scanFood } from '../services/foodScannerApi';
import {
  loadGoals,
  loadProfile,
  loadTodayWeight,
  saveGoals,
  saveProfile,
  saveWeightEntry,
} from '../services/foodDiaryProfile';

const defaultGoals = {
  calories: 2000,
  protein: 120,
  water: 2.5,
};

const defaultBody = {
  heightCm: null,
  weightKg: null,
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
  if (value == null || value === '') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const scaleByGrams = (value, grams, baseGrams) => {
  const safeBase = Number(baseGrams) || 100;
  const safeGrams = Number(grams) || safeBase;
  return (Number(value) || 0) * (safeGrams / safeBase);
};

const getLocalDateString = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

function FoodDiary({ userId, supabase, notify }) {
  const [entriesByDate, setEntriesByDate] = useState({});
  const [goals, setGoals] = useState(defaultGoals);
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
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    () => getLocalDateString()
  );
  const [tab, setTab] = useState('diario');

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
  const [scanPreview, setScanPreview] = useState(null);
  const [scanDescription, setScanDescription] = useState('');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const inputCameraRef = useRef(null);
  const inputGalleryRef = useRef(null);
  const goalAutosaveTimeoutRef = useRef(null);
  const hasEditedGoalsRef = useRef(false);
  const lastSavedWaterGoalRef = useRef(defaultGoals.water);
  const initialBodyRef = useRef(defaultBody);
  const profileAutosaveTimeoutRef = useRef(null);
  const hasEditedProfileRef = useRef(false);

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
  }, [userId, selectedDate, supabase]);

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

        setGoals(nextGoals);
        setWaterSummary((prev) => ({
          ...prev,
          goalMl: nextGoals.water * 1000,
        }));

        const todayWeightValue =
          todayWeight?.weight_kg != null && todayWeight.weight_kg !== ''
            ? String(todayWeight.weight_kg)
            : null;
        const profileWeightValue =
          normalizedProfile?.weightKg != null && normalizedProfile.weightKg !== ''
            ? String(normalizedProfile.weightKg)
            : null;
        const nextBody = {
          heightCm:
            normalizedProfile?.heightCm != null && normalizedProfile.heightCm !== ''
              ? String(normalizedProfile.heightCm)
              : null,
          weightKg:
            todayWeightValue ?? profileWeightValue,
        };

        setBody(nextBody);
        initialBodyRef.current = nextBody;

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
  }, [userId]);

  const persistDailyGoals = async (nextGoals) => {
    const waterGoal = Number(nextGoals.water || 0);
    if (waterGoal < 0) {
      setError('Não foi possível salvar as metas.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar as metas.', 'error');
      }
      return;
    }
    const saved = await saveGoals({
      supabase,
      userId,
      calorieGoal: nextGoals.calories,
      proteinGoal: nextGoals.protein,
      waterGoalL: nextGoals.water,
    });

    const normalizedGoals = {
      calories:
        saved?.calorie_goal != null
          ? Number(saved.calorie_goal)
          : Number(nextGoals.calories || 0),
      protein:
        saved?.protein_goal != null
          ? Number(saved.protein_goal)
          : Number(nextGoals.protein || 0),
      water:
        saved?.water_goal_l != null
          ? Number(saved.water_goal_l)
          : Number(nextGoals.water || 0),
    };

    setGoals(normalizedGoals);
    await updateHydrationGoal({ goalLiters: normalizedGoals.water }, supabase);
  };

  useEffect(() => {
    if (!userId || !hasEditedGoalsRef.current) return;

    if (goalAutosaveTimeoutRef.current) {
      clearTimeout(goalAutosaveTimeoutRef.current);
    }

    goalAutosaveTimeoutRef.current = setTimeout(async () => {
      try {
        await persistDailyGoals(goals);
        const nextWaterGoal = Number(goals.water || 0);
        if (lastSavedWaterGoalRef.current !== nextWaterGoal) {
          setHydrationRefreshToken((prev) => prev + 1);
          lastSavedWaterGoalRef.current = nextWaterGoal;
        }
        hasEditedGoalsRef.current = false;
      } catch (error) {
        console.error('Falha ao salvar metas', error);
        setError('Não foi possível salvar as metas.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar as metas.', 'error');
        }
      }
    }, 600);

    return () => {
      if (goalAutosaveTimeoutRef.current) {
        clearTimeout(goalAutosaveTimeoutRef.current);
      }
    };
  }, [goals, userId, notify]);

  const dayEntries = entriesByDate[selectedDate] || [];

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

  const handleChangeForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectFood = (foodData) => {
    const selectedItem = {
      nome: foodData.nome,
      quantidade: foodData.quantidadeTexto,
      calorias: Number(foodData.kcal) || 0,
      proteina: Number(foodData.proteina) || 0,
    };

    setScanPreview((prev) => {
      if (Array.isArray(prev)) {
        return [...prev, selectedItem];
      }
      return [selectedItem];
    });
  };

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
    try {
      const sanitizedFile = await prepareImageForScan(file);
      const analysis = await scanFood(sanitizedFile, scanDescription);
      const normalizeScanItem = (item) => {
        const directBase =
          Number(item?.baseGrams ?? item?.gramsBase ?? item?.grams ?? item?.gramas);
        let parsedBase = directBase;

        if (!Number.isFinite(parsedBase) && typeof item?.quantidade === 'string') {
          const match = item.quantidade.match(/[\d,.]+/);
          if (match) {
            parsedBase = Number(match[0].replace(',', '.'));
          }
        }

        const baseGrams = Number.isFinite(parsedBase) && parsedBase > 0 ? parsedBase : 100;
        const baseCalories = Number(item?.calorias) || 0;
        const baseProtein = Number(item?.proteina) || 0;

        return {
          ...item,
          baseGrams,
          grams: baseGrams,
          baseCalories,
          baseProtein,
        };
      };

      const items = Array.isArray(analysis?.itens)
        ? analysis.itens.map((item) => normalizeScanItem(item))
        : [];
      setScanPreview(items);
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
    }
  };

  const handleApplyScannedItem = (item) => {
    if (!item) return;
    const baseGrams = Number(item.baseGrams) || 100;
    const grams = Number(item.grams) || baseGrams;
    const calories = Math.round(
      scaleByGrams(item.baseCalories ?? item.calorias, grams, baseGrams),
    );
    const protein = Number(
      scaleByGrams(item.baseProtein ?? item.proteina, grams, baseGrams).toFixed(1),
    );
    setForm((prev) => ({
      ...prev,
      food: item.nome || prev.food,
      calories: String(calories),
      protein: String(protein),
    }));
  };

  const handleApplyAllScannedItems = () => {
    if (!Array.isArray(scanPreview) || scanPreview.length === 0) return;

    const total = scanPreview.reduce(
      (acc, item) => ({
        calorias:
          acc.calorias +
          Math.round(
            scaleByGrams(
              item.baseCalories ?? item.calorias,
              item.grams,
              item.baseGrams,
            ),
          ),
        proteina:
          acc.proteina +
          Number(
            scaleByGrams(
              item.baseProtein ?? item.proteina,
              item.grams,
              item.baseGrams,
            ).toFixed(1),
          ),
      }),
      { calorias: 0, proteina: 0 }
    );

    setForm((prev) => ({
      ...prev,
      food: scanPreview
        .map((i) => i.nome)
        .filter(Boolean)
        .join(', ') || prev.food,
      calories: String(total.calorias),
      protein: total.proteina.toFixed(1),
    }));
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

  const handleScannedGramsChange = (index, value) => {
    if (!Array.isArray(scanPreview)) return;
    if (value === '') return;

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;

    const clamped = Math.min(2000, Math.max(1, Math.round(numeric)));

    setScanPreview((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, grams: clamped } : item,
      ),
    );
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

    const isEditing = Boolean(editingId);

    const payload = {
      mealType: form.mealType,
      food: form.food,
      calories: form.calories ? Number(form.calories) : 0,
      protein: form.protein ? Number(form.protein) : 0,
      time: form.time,
      notes: form.notes,
      entryDate: selectedDate,
    };

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
      setEditingId(null);
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
    setForm({
      mealType: entry.mealType || 'Almoço',
      food: entry.food || '',
      calories: entry.calories != null ? String(entry.calories) : '',
      protein: entry.protein != null ? String(entry.protein) : '',
      time: entry.time || '',
      notes: entry.notes || ''
    });
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

    // Opcional: colocar a data selecionada igual à data do registro
    if (entry.date) {
      setSelectedDate(entry.date);
    }

    // Preenche o campo "Peso atual (kg)" com o valor do histórico
    setBody((prev) => ({
      ...prev,
      weightKg:
        entry.weightKg != null ? String(entry.weightKg) : prev.weightKg,
    }));
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

  const handleGoalChange = (field, value) => {
    hasEditedGoalsRef.current = true;
    const nextValue = value === '' ? '' : Number(value);

    setGoals((prev) => ({
      ...prev,
      [field]: nextValue,
    }));

    if (field === 'water') {
      setWaterSummary((prev) => ({
        ...prev,
        goalMl: nextValue === '' ? 0 : Number(nextValue) * 1000,
      }));
    }
  };

  const handleBodyChange = (field, value) => {
    const nextBody = {
      ...body,
      [field]: value,
    };

    // Apenas atualizar o estado local.
    setBody(nextBody);

    if (field !== 'weightKg') {
      hasEditedProfileRef.current = true;
    }
  };

  const normalizeBodyValues = (values) => {
    const normalizeNumber = (value) => {
      return parseNumberInput(value);
    };

    return {
      heightCm: normalizeNumber(values.heightCm),
      weightKg: normalizeNumber(values.weightKg),
    };
  };

  const buildProfilePayload = (currentValues, initialValues) => {
    const normalizedCurrent = normalizeBodyValues(currentValues);
    const normalizedInitial = normalizeBodyValues(initialValues);
    const fieldsToCheck = ['heightCm'];
    const payload = fieldsToCheck.reduce((acc, key) => {
      if (!Object.is(normalizedCurrent[key], normalizedInitial[key])) {
        acc[key] = normalizedCurrent[key];
      }
      return acc;
    }, {});

    const cleanedPayload = Object.fromEntries(
      Object.entries(payload).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );

    return { cleanedPayload, normalizedCurrent };
  };

  const handleSaveProfile = async (nextBody = body) => {
    try {
      if (!userId) {
        return;
      }

      const { cleanedPayload, normalizedCurrent } = buildProfilePayload(
        nextBody,
        initialBodyRef.current,
      );

      if (Object.keys(cleanedPayload).length === 0) {
        return;
      }

      await saveProfile({
        supabase,
        userId,
        ...cleanedPayload,
      });

      const refreshedBody = {
        ...nextBody,
        heightCm:
          cleanedPayload.heightCm != null
            ? String(cleanedPayload.heightCm)
            : nextBody.heightCm,
      };

      setBody(refreshedBody);
      initialBodyRef.current = {
        ...initialBodyRef.current,
        heightCm:
          normalizedCurrent.heightCm != null
            ? String(normalizedCurrent.heightCm)
            : initialBodyRef.current.heightCm,
      };
    } catch (error) {
      console.error('Falha ao salvar perfil', error);
      setError('Não foi possível salvar os dados do perfil.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar os dados do perfil.', 'error');
      }
    }
  };

  const handleSaveWeight = async (nextBody = body) => {
    try {
      if (!userId) {
        setError('Usuário não identificado para salvar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar o peso.', 'error');
        }
        return;
      }

      const normalizedWeight = parseNumberInput(nextBody.weightKg);
      if (!Number.isFinite(normalizedWeight)) {
        setError('Não foi possível salvar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar o peso.', 'error');
        }
        return;
      }

      const normalizedHeight = parseNumberInput(nextBody.heightCm);
      const entryDate = getLocalDateString();

      await saveWeightEntry({
        supabase,
        userId,
        weightKg: normalizedWeight,
        ...(normalizedHeight != null ? { heightCm: normalizedHeight } : {}),
        entryDate,
      });

      const refreshedHistory = await fetchWeightHistoryFromDb(userId);
      setWeightHistory(refreshedHistory);

      setBody((prev) => ({
        ...prev,
        weightKg: String(normalizedWeight),
      }));

      if (typeof notify === 'function') {
        notify('Peso salvo com sucesso.', 'success');
      }
    } catch (error) {
      console.error('Falha ao salvar peso', error);
      setError('Não foi possível salvar o peso.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar o peso.', 'error');
      }
    }
  };

  useEffect(() => {
    if (!userId || profileLoading || !hasEditedProfileRef.current) return;

    if (profileAutosaveTimeoutRef.current) {
      clearTimeout(profileAutosaveTimeoutRef.current);
    }

    profileAutosaveTimeoutRef.current = setTimeout(async () => {
      try {
        await handleSaveProfile(body);
        hasEditedProfileRef.current = false;
      } catch (error) {
        console.error('Falha ao salvar dados do perfil', error);
      }
    }, 600);

    return () => {
      if (profileAutosaveTimeoutRef.current) {
        clearTimeout(profileAutosaveTimeoutRef.current);
      }
    };
  }, [
    body.heightCm,
    userId,
    profileLoading,
  ]);

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

  return (
    <div className="food-diary">
      {isScanModalOpen && (
        <div className="scan-modal-backdrop">
          <div className="scan-modal">
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
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 12, margin: '10px 0 18px' }}>
        <button
          type="button"
          className={tab === 'diario' ? 'primary' : 'ghost'}
          onClick={() => setTab('diario')}
        >
          Diário
        </button>
        <button
          type="button"
          className={tab === 'relatorios' ? 'primary' : 'ghost'}
          onClick={() => setTab('relatorios')}
        >
          Relatórios
        </button>
        <button
          type="button"
          className={tab === 'relatorio-geral' ? 'primary' : 'ghost'}
          onClick={() => setTab('relatorio-geral')}
        >
          Relatório Geral
        </button>
      </div>

      {tab === 'diario' && (
        <>
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <h4 className="title" style={{ margin: 0 }}>
              Diário alimentar
            </h4>
            <div className="muted" style={{ fontSize: 12 }}>
              Registre o que comeu e acompanhe suas metas diárias.
            </div>
          </div>

          <div className="sep" style={{ margin: '10px 0 14px' }}></div>

          <div className="food-diary-grid">
            {/* LADO ESQUERDO – Formulário + lista do dia */}
            <div className="food-diary-left">
              <form
                onSubmit={handleAddEntry}
                className="food-diary-form"
                autoComplete="off"
              >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Data</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Refeição</label>
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
            </div>

            <div className="field">
              <label>Alimento</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ex.: Arroz, frango grelhado, iogurte..."
                  value={form.food}
                  onChange={(e) => handleChangeForm('food', e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="ghost small"
                  onClick={handleSelectImageForScan}
                  disabled={isScanningFood}
                >
                  📷 Escanear comida
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => setIsFoodPickerOpen(true)}
                  disabled={isScanningFood}
                >
                  Buscar alimento
                </button>
              </div>
            </div>

            <div className="field">
              <input
                type="text"
                value={scanDescription}
                onChange={(e) => setScanDescription(e.target.value)}
              />
            </div>

            {Array.isArray(scanPreview) && scanPreview.length > 0 && (
              <div className="food-scan-preview" style={{ marginTop: 8 }}>
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <strong style={{ fontSize: 13 }}>Alimentos identificados na foto</strong>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setScanPreview(null)}
                  >
                    Limpar
                  </button>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0' }}>
                  {scanPreview.map((item, index) => (
                    <li key={index} style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>
                          {item.nome}
                          {item.quantidade ? ` – ${item.quantidade}` : ''}
                        </span>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            step="1"
                            value={item.grams}
                            onChange={(e) =>
                              handleScannedGramsChange(index, e.target.value)
                            }
                            style={{ width: 72 }}
                          />
                          <span>g</span>
                        </label>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {Math.round(
                          scaleByGrams(
                            item.baseCalories ?? item.calorias,
                            item.grams,
                            item.baseGrams,
                          ),
                        )}{' '}
                        kcal •{' '}
                        {Number(
                          scaleByGrams(
                            item.baseProtein ?? item.proteina,
                            item.grams,
                            item.baseGrams,
                          ).toFixed(1),
                        )}{' '}
                        g proteína
                      </div>
                      <button
                        type="button"
                        className="ghost small"
                        style={{ marginTop: 4 }}
                        onClick={() => handleApplyScannedItem(item)}
                      >
                        Usar este alimento
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="primary small"
                  style={{ marginTop: 8 }}
                  onClick={handleApplyAllScannedItems}
                >
                  Somar tudo e preencher a refeição
                </button>
              </div>
            )}

            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Calorias (kcal)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.calories}
                  onChange={(e) => handleChangeForm('calories', e.target.value)}
                  placeholder="Ex.: 250"
                />
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Proteína (g) – opcional</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.protein}
                  onChange={(e) => handleChangeForm('protein', e.target.value)}
                  placeholder="Ex.: 25"
                />
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Horário</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => handleChangeForm('time', e.target.value)}
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

            <div
              className="row"
              style={{
                justifyContent: 'flex-end',
                marginTop: 8
              }}
            >
              <button type="submit" className="primary">
                Adicionar refeição
              </button>
            </div>
          </form>

          <div className="food-diary-entries">
            {dayEntries.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>
                Nenhuma refeição registrada para este dia.
              </div>
            )}

            {dayEntries.map((item) => (
              <div key={item.id} className="food-diary-entry">
                <div className="food-diary-entry-header">
                  <span>
                    <strong>{item.mealType}</strong>{' '}
                    {item.time && <span className="muted">– {item.time}</span>}
                    {(item.date || selectedDate) && (
                      <span className="muted">
                        {' '}
                        • {new Date(item.date || selectedDate).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </span>
                  <span>{formatNumber(item.calories, 0)} kcal</span>
                </div>
                <div className="food-diary-entry-meta">
                  {item.food && <span>{item.food}</span>}
                  {item.protein ? (
                    <span className="muted">
                      • {formatNumber(item.protein, 0)} g proteína
                    </span>
                  ) : null}
                </div>
                {item.notes && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {item.notes}
                  </div>
                )}
                <div
                  className="food-diary-entry-actions"
                  style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}
                >
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleEditEntry(item)}
                      title="Editar refeição"
                    >
                      <span role="img" aria-label="Editar">✏️</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleDeleteEntry(item.id)}
                      title="Excluir refeição"
                    >
                      <span role="img" aria-label="Excluir">🗑️</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LADO DIREITO – Resumo, metas e dados corporais */}
        <aside className="food-diary-right">
          <div className="food-diary-summary-card">
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

            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: goalsMet ? '#16a34a' : '#dc2626',
              }}
            >
              {goalsMet
                ? '✅ Meta do dia batida. Bom trabalho!'
                : '⚠️ Meta do dia não batida. Um alerta será enviado no WhatsApp às 23h.'}
            </div>
          </div>

          <HydrationCard
            key={`${selectedDate}-${hydrationRefreshToken}`}
            userId={userId}
            supabase={supabase}
            notify={notify}
            selectedDate={selectedDate}
            onStateChange={handleHydrationStateChange}
          />

          <div className="food-diary-summary-card">
            <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
              Metas diárias
            </h5>
            <div className="field">
              <label>Meta de calorias (kcal/dia)</label>
              <input
                type="number"
                min="0"
                value={goals.calories}
                onChange={(e) =>
                  handleGoalChange('calories', e.target.value)
                }
              />
            </div>
            <div className="field">
              <label>Meta de proteína (g/dia)</label>
              <input
                type="number"
                min="0"
                value={goals.protein}
                onChange={(e) =>
                  handleGoalChange('protein', e.target.value)
                }
              />
            </div>
            <div className="field">
              <label>Meta de água (L/dia)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={goals.water}
                onChange={(e) =>
                  handleGoalChange('water', e.target.value)
                }
              />
            </div>
          </div>

          <div className="food-diary-summary-card">
            <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
              Altura e peso
            </h5>
            <div className="field">
              <label>Altura (cm)</label>
              <input
                type="number"
                min="0"
                value={body.heightCm ?? ''}
                onChange={(e) =>
                  handleBodyChange('heightCm', e.target.value)
                }
              />
            </div>
            <div className="field">
              <label>Peso atual (kg)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={body.weightKg ?? ''}
                onChange={(e) =>
                  handleBodyChange('weightKg', e.target.value)
                }
              />
            </div>
            <button
              type="button"
              className="primary"
              style={{ marginTop: 10 }}
              onClick={() => handleSaveWeight()}
            >
              Salvar peso
            </button>
            {bmi && (
              <div className="muted" style={{ fontSize: 13 }}>
                IMC:{' '}
                <strong>{formatNumber(bmi.value, 1)}</strong> – {bmi.label}
              </div>
            )}

            {weightHistory.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                <div>Histórico de peso (recentes):</div>
                <div className="weight-history-scroll">
                  {weightHistory
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .map((item) => (
                      <div
                        key={`${item.date}-${item.recordedAt}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          marginTop: 2,
                        }}
                      >
                        <span>
                          {new Date(item.date).toLocaleDateString('pt-BR')} –{' '}
                          {formatNumber(item.weightKg, 1)} kg
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
            )}

          </div>
        </aside>
      </div>
          {isFoodPickerOpen && (
            <FoodPicker
              open={isFoodPickerOpen}
              onClose={() => setIsFoodPickerOpen(false)}
              onSelectFood={handleSelectFood}
            />
          )}
        </>
      )}

      {tab === 'relatorio-geral' && (
        <GeneralReport
          body={body}
          weightHistory={weightHistory}
          userId={userId}
          supabase={supabase}
        />
      )}

      {tab === 'relatorios' && (
        <FoodDiaryReports
          userId={userId}
          supabase={supabase}
          selectedDate={selectedDate}
          goals={goals}
        />
      )}
    </div>
  );
}

export default FoodDiary;
