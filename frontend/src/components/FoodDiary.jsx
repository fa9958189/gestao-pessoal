import React, { useEffect, useMemo, useRef, useState } from 'react';
import FoodPicker from '../FoodPicker';
import {
  deleteMeal,
  fetchMealsByDate,
  saveMeal,
  updateMeal,
} from '../foodDiaryApi';
import FoodDiaryReports from './FoodDiaryReports';
import {
  fetchWeightHistory,
  saveWeightEntry,
  fetchWeightProfile,
  saveWeightProfile,
  deleteWeightEntry,
} from '../weightApi';
import { scanFood } from '../services/foodScannerApi';

const defaultGoals = {
  calories: 2000,
  protein: 120,
  water: 2.5
};

const defaultBody = {
  heightCm: '',
  weightKg: ''
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

function FoodDiary({ userId, supabase, notify }) {
  const [entriesByDate, setEntriesByDate] = useState({});
  const [goals, setGoals] = useState(defaultGoals);
  const [body, setBody] = useState(defaultBody);
  const [weightHistory, setWeightHistory] = useState(defaultWeightHistory);
  const [, setIsLoading] = useState(true);
  const [, setSavingEntry] = useState(false);
  const [, setLoadingWeightHistory] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [tab, setTab] = useState('diario');

  const [form, setForm] = useState({
    mealType: 'Almoço',
    food: '',
    quantity: '',
    calories: '',
    protein: '',
    waterMl: '',
    time: '',
    notes: ''
  });

  const [editingId, setEditingId] = useState(null);

  const [isFoodPickerOpen, setIsFoodPickerOpen] = useState(false);
  const [isScanningFood, setIsScanningFood] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const fileInputRef = useRef(null);

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

    const loadWeightProfile = async () => {
      if (!userId) return;

      try {
        const profile = await fetchWeightProfile(userId);
        if (!isMounted) return;

        setGoals({
          calories:
            profile?.calorieGoal != null
              ? Number(profile.calorieGoal)
              : defaultGoals.calories,
          protein:
            profile?.proteinGoal != null
              ? Number(profile.proteinGoal)
              : defaultGoals.protein,
          water:
            profile?.waterGoalLiters != null
              ? Number(profile.waterGoalLiters)
              : defaultGoals.water,
        });

        setBody({
          heightCm:
            profile?.heightCm != null && profile.heightCm !== ''
              ? String(profile.heightCm)
              : '',
          weightKg:
            profile?.weightKg != null && profile.weightKg !== ''
              ? String(profile.weightKg)
              : '',
        });
      } catch (err) {
        console.warn('Erro ao carregar perfil de metas e peso', err);
      }
    };

    loadWeightProfile();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    const loadWeight = async () => {
      if (!userId) return;

      try {
        setLoadingWeightHistory(true);
        const historyFromDb = await fetchWeightHistory(userId);
        if (!isMounted) return;

        setWeightHistory(historyFromDb || defaultWeightHistory);
      } catch (err) {
        console.warn('Erro ao carregar histórico de peso', err);
        if (isMounted) {
          setError('Não foi possível carregar o histórico de peso.');
        }
      } finally {
        if (isMounted) {
          setLoadingWeightHistory(false);
        }
      }
    };

    loadWeight();

    return () => {
      isMounted = false;
    };
  }, [userId]);

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
    const totalWaterMl = dayEntries.reduce(
      (sum, item) => sum + (Number(item.waterMl) || 0),
      0
    );
    const totalWaterLiters = totalWaterMl / 1000;
    return { totalCalories, totalProtein, totalWaterMl, totalWaterLiters };
  }, [dayEntries]);

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
      agua: 0,
    };

    setScanPreview((prev) => {
      if (Array.isArray(prev)) {
        return [...prev, selectedItem];
      }
      return [selectedItem];
    });
  };

  const handleScanFood = async (file) => {
    setIsScanningFood(true);
    try {
      const analysis = await scanFood(file);
      setScanPreview(Array.isArray(analysis?.itens) ? analysis.itens : []);
      setError(null);
      if (typeof notify === 'function') {
        notify('Alimento escaneado com sucesso.', 'success');
      }
    } catch (err) {
      console.error('Erro ao escanear alimento', err);
      setError('Não foi possível analisar a imagem do alimento.');
      setScanPreview([]);
      if (typeof notify === 'function') {
        notify('Não foi possível analisar a imagem do alimento.', 'error');
      }
    } finally {
      setIsScanningFood(false);
    }
  };

  const handleApplyScannedItem = (item) => {
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      food: item.nome || prev.food,
      quantity: item.quantidade || prev.quantity,
      calories:
        item.calorias != null
          ? String(item.calorias)
          : prev.calories,
      protein:
        item.proteina != null
          ? String(item.proteina)
          : prev.protein,
      waterMl:
        item.agua != null
          ? String(item.agua)
          : prev.waterMl,
    }));
  };

  const handleApplyAllScannedItems = () => {
    if (!Array.isArray(scanPreview) || scanPreview.length === 0) return;

    const total = scanPreview.reduce(
      (acc, item) => ({
        calorias: acc.calorias + (Number(item.calorias) || 0),
        proteina: acc.proteina + (Number(item.proteina) || 0),
        agua: acc.agua + (Number(item.agua) || 0),
      }),
      { calorias: 0, proteina: 0, agua: 0 }
    );

    setForm((prev) => ({
      ...prev,
      food: scanPreview
        .map((i) => i.nome)
        .filter(Boolean)
        .join(', ') || prev.food,
      calories: String(total.calorias),
      protein: String(total.proteina),
      waterMl: String(total.agua),
    }));
  };

  const handleSelectImageForScan = () => {
    fileInputRef.current?.click();
  };

  const handleImageInputChange = (event) => {
    const [file] = event.target.files || [];
    if (file) {
      void handleScanFood(file);
    }
    event.target.value = '';
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
      quantity: form.quantity,
      calories: form.calories ? Number(form.calories) : 0,
      protein: form.protein ? Number(form.protein) : 0,
      waterMl: form.waterMl ? Number(form.waterMl) : 0,
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
        quantity: '',
        calories: '',
        protein: '',
        waterMl: '',
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
      quantity: entry.quantity || '',
      calories: entry.calories != null ? String(entry.calories) : '',
      protein: entry.protein != null ? String(entry.protein) : '',
      waterMl: entry.waterMl != null ? String(entry.waterMl) : '',
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
      // Usa a função do weightApi para remover o registro no Supabase
      await deleteWeightEntry(userId, entry.date, entry.recordedAt, supabase);

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
    setGoals((prev) => ({
      ...prev,
      [field]: value === '' ? '' : Number(value)
    }));
  };

  const handleBodyChange = (field, value) => {
    const nextBody = {
      ...body,
      [field]: value,
    };

    // Apenas atualizar o estado local.
    // O salvamento no Supabase será feito manualmente pelo botão.
    setBody(nextBody);
  };

  const handleSaveBodyAndWeight = async (nextBody = body) => {
    try {
      if (!userId) {
        setError('Usuário não identificado para salvar o peso.');
        if (typeof notify === 'function') {
          notify('Não foi possível salvar o peso.', 'error');
        }
        return;
      }

      const heightCm = nextBody.heightCm ? Number(nextBody.heightCm) : null;
      const weightKg = nextBody.weightKg ? Number(nextBody.weightKg) : null;

      await saveWeightProfile({
        userId,
        calorieGoal: goals.calories,
        proteinGoal: goals.protein,
        waterGoalLiters: goals.water,
        heightCm,
        weightKg,
      });

      if (weightKg) {
        const entryDate = selectedDate;
        const saved = await saveWeightEntry({
          userId,
          entryDate,
          weightKg,
        });

        setWeightHistory((prev) => {
          if (!saved) return prev;

          const newItem = {
            date: saved.entry_date,
            weightKg: Number(saved.weight_kg),
            recordedAt: saved.recorded_at,
          };

          const filtered = prev.filter(
            (x) =>
              !(
                x.date === newItem.date &&
                x.recordedAt === newItem.recordedAt
              ),
          );

          return [newItem, ...filtered];
        });

        if (typeof notify === 'function') {
          notify('Peso salvo com sucesso.', 'success');
        }
      }
    } catch (error) {
      console.error('Falha ao salvar peso', error);
      setError('Não foi possível salvar o peso.');
      if (typeof notify === 'function') {
        notify('Não foi possível salvar o peso.', 'error');
      }
    }
  };

  const todayCaloriesText = `Hoje você comeu ${formatNumber(
    totals.totalCalories,
    0
  )} kcal`;

  return (
    <div className="food-diary">
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                  onChange={handleImageInputChange}
                />
              </div>
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
                      <div style={{ fontSize: 13 }}>
                        {item.nome} – {item.quantidade}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.calorias} kcal • {item.proteina} g proteína • {item.agua} ml água
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
                <label>Quantidade</label>
                <input
                  type="text"
                  placeholder="Ex.: 100 g, 1 unidade, 1 copo"
                  value={form.quantity}
                  onChange={(e) => handleChangeForm('quantity', e.target.value)}
                />
              </div>
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
              <div className="field" style={{ flex: 1 }}>
                <label>Água (ml) – opcional</label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={form.waterMl}
                  onChange={(e) => handleChangeForm('waterMl', e.target.value)}
                  placeholder="Ex.: 250"
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
                  {item.quantity && (
                    <span className="muted">• {item.quantity}</span>
                  )}
                  {item.protein ? (
                    <span className="muted">
                      • {formatNumber(item.protein, 0)} g proteína
                    </span>
                  ) : null}
                  {item.waterMl ? (
                    <span className="muted">
                      • {formatNumber(item.waterMl / 1000, 2)} L água
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
                    {formatNumber(totals.totalCalories, 0)} /{' '}
                    {formatNumber(goals.calories || 0, 0)} kcal
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
                    {formatNumber(totals.totalProtein, 0)} /{' '}
                    {formatNumber(goals.protein || 0, 0)} g
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
                    {formatNumber(totals.totalWaterLiters, 2)} /{' '}
                    {formatNumber(goals.water || 0, 2)} L
                  </strong>
                </div>
                <div className="food-diary-bar">
                  {renderBlocks(totals.totalWaterLiters, goals.water || 1)}
                </div>
              </div>
            </div>
          </div>

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
                onChange={(e) => handleGoalChange('water', e.target.value)}
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
                value={body.heightCm}
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
                value={body.weightKg}
                onChange={(e) =>
                  handleBodyChange('weightKg', e.target.value)
                }
              />
            </div>
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

            <button
              type="button"
              className="primary"
              style={{ marginTop: 10 }}
              onClick={() => handleSaveBodyAndWeight()}
            >
              Salvar metas e peso
            </button>
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

      {tab === 'relatorios' && (
        <FoodDiaryReports userId={userId} supabase={supabase} />
      )}
    </div>
  );
}

export default FoodDiary;
