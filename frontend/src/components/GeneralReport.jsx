import React, { useEffect, useMemo, useState } from 'react';

const CACHE_PREFIX = 'gp-general-report-cache-v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const formatNumber = (value, decimals = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatCurrency = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'agora há pouco';
  const diffMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
};

const getStatusFromGoal = (value, goal) => {
  if (!goal) return 'Sem meta';
  const diffRatio = (value - goal) / goal;
  if (diffRatio < -0.05) return 'Abaixo da meta';
  if (diffRatio > 0.05) return 'Acima da meta';
  return 'Dentro da meta';
};

const goalScore = (value, goal) => {
  if (!goal) return 60;
  const ratio = value / goal;
  const diff = Math.abs(1 - ratio);
  return Math.max(0, Math.min(100, Math.round(100 - diff * 100)));
};

const parseDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch (error) {
    return '';
  }
};

const getDayLabel = (dateString) => {
  try {
    const date = new Date(`${dateString}T00:00:00`);
    const weekDay = date
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();
    const day = date.getDate();
    return `${weekDay} ${day}`;
  } catch (error) {
    return dateString;
  }
};

const buildWeekRange = (baseDate) => {
  const dates = [];
  const today = new Date(baseDate);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const buildSummary = ({ foodEntries, workoutSessions, transactions, goals, baseDate }) => {
  const daysRange = buildWeekRange(baseDate);
  const waterGoalMl = Number(goals?.water || 0) * 1000;
  const calorieGoal = Number(goals?.calories || 0);
  const proteinGoal = Number(goals?.protein || 0);

  const dailyNutrition = daysRange.map((date) => {
    const dayEntries = (foodEntries || []).filter((item) => {
      const dateKey = item.entry_date || item.entryDate;
      return dateKey === date;
    });
    const calories = dayEntries.reduce(
      (sum, item) => sum + (Number(item.calories) || 0),
      0,
    );
    const protein = dayEntries.reduce(
      (sum, item) => sum + (Number(item.protein) || 0),
      0,
    );
    const water = dayEntries.reduce(
      (sum, item) => sum + (Number(item.water_ml ?? item.waterMl) || 0),
      0,
    );
    return { date, calories, protein, water };
  });

  const totals = dailyNutrition.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      water: acc.water + item.water,
    }),
    { calories: 0, protein: 0, water: 0 },
  );

  const averages = {
    calories: totals.calories / 7,
    protein: totals.protein / 7,
    water: totals.water / 7,
  };

  const workoutByDay = (workoutSessions || []).reduce((acc, session) => {
    const dateKey = parseDateKey(session.date || session.performed_at || session.performedAt);
    if (!dateKey) return acc;
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {});

  const daysWithWorkout = daysRange.filter((date) => workoutByDay[date]).length;
  const constancy = Math.round((daysWithWorkout / 7) * 100);
  const totalWorkouts = Object.values(workoutByDay).reduce((sum, value) => sum + value, 0);

  let streak = 0;
  for (let i = daysRange.length - 1; i >= 0; i -= 1) {
    if (workoutByDay[daysRange[i]]) {
      streak += 1;
    } else {
      break;
    }
  }

  const income = (transactions || [])
    .filter((tx) => (tx.type || '').toLowerCase() === 'income')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const expenses = (transactions || [])
    .filter((tx) => (tx.type || '').toLowerCase() !== 'income')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const balance = income - expenses;
  const spentPercent = income > 0 ? Math.round((expenses / income) * 100) : 0;

  const dayCountInMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, baseDate.getDate());
  const avgDailyExpense = elapsedDays ? expenses / elapsedDays : 0;

  const nutritionScore = Math.round(
    (goalScore(averages.calories, calorieGoal)
      + goalScore(averages.protein, proteinGoal)
      + goalScore(averages.water, waterGoalMl)) / 3,
  );
  const trainingScore = constancy;
  const financeScore = income > 0
    ? Math.max(0, Math.min(100, Math.round(100 - (expenses / income) * 100)))
    : expenses > 0 ? 40 : 70;
  const lifeScore = Math.round(
    nutritionScore * 0.4 + trainingScore * 0.3 + financeScore * 0.3,
  );

  const averageCalories = averages.calories;
  let avatarType = 'normal';
  if (calorieGoal) {
    if (averageCalories < calorieGoal * 0.85) avatarType = 'magro';
    else if (averageCalories > calorieGoal * 1.15) avatarType = 'acima';
  } else if (lifeScore < 45) {
    avatarType = 'magro';
  } else if (lifeScore > 75) {
    avatarType = 'acima';
  }

  const timeline = daysRange.map((date) => {
    const nutrition = dailyNutrition.find((item) => item.date === date) || {
      calories: 0,
      protein: 0,
      water: 0,
    };
    const nutritionOk = calorieGoal
      ? nutrition.calories >= calorieGoal * 0.9 && nutrition.calories <= calorieGoal * 1.1
      : nutrition.calories > 0;
    const proteinOk = proteinGoal ? nutrition.protein >= proteinGoal * 0.9 : nutrition.protein > 0;
    const waterOk = waterGoalMl ? nutrition.water >= waterGoalMl * 0.9 : nutrition.water > 0;
    const nutritionPulse = nutritionOk && proteinOk && waterOk;
    const dayExpenses = (transactions || []).filter((tx) => {
      if ((tx.type || '').toLowerCase() === 'income') return false;
      return parseDateKey(tx.date) === date;
    });
    const dayExpenseTotal = dayExpenses.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const highSpending = avgDailyExpense > 0 && dayExpenseTotal > avgDailyExpense * 1.2;

    return {
      date,
      label: getDayLabel(date),
      nutritionOk: nutritionPulse,
      workout: Boolean(workoutByDay[date]),
      highSpending,
    };
  });

  return {
    averages,
    goals: { calorieGoal, proteinGoal, waterGoalMl },
    statuses: {
      calories: getStatusFromGoal(averages.calories, calorieGoal),
      protein: getStatusFromGoal(averages.protein, proteinGoal),
      water: getStatusFromGoal(averages.water, waterGoalMl),
    },
    workouts: {
      totalWorkouts,
      daysWithWorkout,
      constancy,
      streak,
    },
    finance: {
      income,
      expenses,
      balance,
      spentPercent,
      dayCountInMonth,
    },
    scores: {
      nutritionScore,
      trainingScore,
      financeScore,
      lifeScore,
    },
    avatarType,
    timeline,
  };
};

const GeneralAvatar = ({ variant = 'normal' }) => {
  const bodyWidth = variant === 'magro' ? 32 : variant === 'acima' ? 54 : 42;
  const waistWidth = variant === 'magro' ? 24 : variant === 'acima' ? 48 : 34;
  const bodyColor = variant === 'magro' ? '#22d3ee' : variant === 'acima' ? '#f59e0b' : '#60a5fa';
  const outline = '#0f172a';

  return (
    <svg
      width="140"
      height="160"
      viewBox="0 0 140 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="general-report-avatar-svg"
      aria-hidden="true"
    >
      <rect x="26" y="6" width="88" height="148" rx="24" fill="#0b1220" stroke="#1f2937" />
      <circle cx="70" cy="46" r="22" fill="#f8fafc" stroke={outline} strokeWidth="2" />
      <rect
        x={70 - bodyWidth / 2}
        y="70"
        width={bodyWidth}
        height="52"
        rx="16"
        fill={bodyColor}
        stroke={outline}
        strokeWidth="2"
      />
      <rect
        x={70 - waistWidth / 2}
        y="120"
        width={waistWidth}
        height="28"
        rx="12"
        fill="#1e293b"
        stroke={outline}
        strokeWidth="2"
      />
      <circle cx="60" cy="42" r="3" fill={outline} />
      <circle cx="80" cy="42" r="3" fill={outline} />
      <path
        d="M62 54c3 4 13 4 16 0"
        stroke={outline}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

const readCache = (userId) => {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeCache = (userId, data) => {
  if (!userId) return;
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}:${userId}`,
      JSON.stringify({ data, savedAt: Date.now() }),
    );
  } catch (error) {
    // noop
  }
};

function GeneralReport({ userId, supabase, goals }) {
  const [summary, setSummary] = useState(() => {
    const cached = readCache(userId);
    return cached?.data || null;
  });
  const [lastUpdated, setLastUpdated] = useState(() => readCache(userId)?.savedAt || null);
  const [loading, setLoading] = useState(!summary);

  const baseDate = useMemo(() => new Date(), []);

  useEffect(() => {
    const cached = readCache(userId);
    if (cached?.data) {
      setSummary(cached.data);
      setLastUpdated(cached.savedAt);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!userId || !supabase) return;

      setLoading(true);
      try {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        const weekStartStr = weekStart.toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthStartStr = monthStart.toISOString().slice(0, 10);

        const [foodResult, txResult] = await Promise.all([
          supabase
            .from('food_diary_entries')
            .select('entry_date, calories, protein, water_ml')
            .eq('user_id', userId)
            .gte('entry_date', weekStartStr)
            .lte('entry_date', todayStr)
            .order('entry_date', { ascending: true }),
          supabase
            .from('transactions')
            .select('type, amount, date')
            .eq('user_id', userId)
            .gte('date', monthStartStr)
            .lte('date', todayStr)
            .order('date', { ascending: true }),
        ]);

        if (foodResult.error) throw foodResult.error;
        if (txResult.error) throw txResult.error;

        let workoutSessions = [];
        const apiBase = (
          window.APP_CONFIG?.apiBaseUrl ||
          import.meta.env.VITE_API_BASE_URL ||
          import.meta.env.VITE_API_URL ||
          import.meta.env.VITE_BACKEND_URL ||
          ''
        ).replace(/\/$/, '');
        if (apiBase) {
          try {
            const params = new URLSearchParams({
              userId,
              from: weekStartStr,
              to: todayStr,
            });
            const response = await fetch(`${apiBase}/api/workouts/sessions?${params.toString()}`);
            if (response.ok) {
              workoutSessions = await response.json();
            }
          } catch (error) {
            console.warn('Falha ao carregar sessões de treino', error);
          }
        }

        const nextSummary = buildSummary({
          foodEntries: foodResult.data || [],
          workoutSessions,
          transactions: txResult.data || [],
          goals,
          baseDate: today,
        });

        if (!isMounted) return;
        setSummary(nextSummary);
        setLastUpdated(Date.now());
        writeCache(userId, nextSummary);
      } catch (error) {
        console.warn('Falha ao carregar relatório geral', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [goals, supabase, userId]);

  const fallbackSummary = useMemo(
    () =>
      buildSummary({
        foodEntries: [],
        workoutSessions: [],
        transactions: [],
        goals,
        baseDate,
      }),
    [baseDate, goals],
  );

  const data = summary || fallbackSummary;
  const updatedLabel = formatRelativeTime(lastUpdated);

  return (
    <div className="general-report">
      <div className="general-report-hero">
        <div className="general-report-hero-header">
          <div>
            <h4 className="title" style={{ margin: 0 }}>
              Meu Estado Atual
            </h4>
            <span className="muted" style={{ fontSize: 12 }}>
              Baseado nos últimos 7 dias e no mês atual.
            </span>
          </div>
          <div className="general-report-update">
            {loading ? 'Atualizando...' : `Atualizado ${updatedLabel}`}
          </div>
        </div>

        <div className="general-report-hero-content">
          <div className="general-report-avatar">
            <GeneralAvatar variant={data.avatarType} />
            <div className="general-report-avatar-label">
              {data.avatarType === 'magro' && 'Fase de recuperação'}
              {data.avatarType === 'normal' && 'Equilíbrio em alta'}
              {data.avatarType === 'acima' && 'Energia acima da média'}
            </div>
          </div>
          <div className="general-report-hero-info">
            <p className="general-report-hero-text">
              Seu score combina alimentação, treinos e finanças. Use os
              indicadores abaixo para ajustar o que precisa de atenção esta
              semana.
            </p>
            <div className="general-report-score">
              <div className="general-report-score-header">
                <span>Score de Vida</span>
                <strong>{data.scores.lifeScore}</strong>
              </div>
              <div className="general-report-score-bar">
                <div
                  className="general-report-score-progress"
                  style={{ width: `${Math.min(data.scores.lifeScore, 100)}%` }}
                />
              </div>
              <div className="general-report-score-caption">
                Alimentação {data.scores.nutritionScore}% · Treino {data.scores.trainingScore}% ·
                Financeiro {data.scores.financeScore}%
              </div>
            </div>
            <div className="general-report-chips">
              <span className="general-report-chip">Alimentação: {data.statuses.calories}</span>
              <span className="general-report-chip">Treino: {data.workouts.constancy}% constância</span>
              <span className="general-report-chip">Financeiro: {data.finance.spentPercent}% gasto</span>
            </div>
          </div>
        </div>
      </div>

      <div className="general-report-grid">
        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>
              Alimentação
            </h5>
            <span className="general-report-badge">7 dias</span>
          </div>
          <div className="general-report-metric">
            <span>Média kcal</span>
            <strong>{formatNumber(data.averages.calories, 0)} kcal</strong>
          </div>
          <div className="general-report-metric">
            <span>Proteína</span>
            <strong>{formatNumber(data.averages.protein, 1)} g</strong>
          </div>
          <div className="general-report-metric">
            <span>Água</span>
            <strong>{formatNumber(data.averages.water / 1000, 1)} L</strong>
          </div>
          <div className="general-report-pill">
            {data.statuses.calories} · {data.statuses.protein} · {data.statuses.water}
          </div>
        </div>

        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>
              Treino
            </h5>
            <span className="general-report-badge">7 dias</span>
          </div>
          <div className="general-report-metric">
            <span>Treinos na semana</span>
            <strong>{data.workouts.totalWorkouts}</strong>
          </div>
          <div className="general-report-metric">
            <span>Constância</span>
            <strong>{data.workouts.constancy}%</strong>
          </div>
          <div className="general-report-metric">
            <span>Streak atual</span>
            <strong>{data.workouts.streak} dia(s)</strong>
          </div>
          <div className="general-report-pill">
            {data.workouts.daysWithWorkout} de 7 dias com treino
          </div>
        </div>

        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>
              Financeiro
            </h5>
            <span className="general-report-badge">Mês atual</span>
          </div>
          <div className="general-report-metric">
            <span>Saldo do mês</span>
            <strong>{formatCurrency(data.finance.balance)}</strong>
          </div>
          <div className="general-report-metric">
            <span>Gastos</span>
            <strong>{formatCurrency(data.finance.expenses)}</strong>
          </div>
          <div className="general-report-metric">
            <span>% gasto vs entradas</span>
            <strong>{data.finance.spentPercent}%</strong>
          </div>
          <div className="general-report-pill">
            {formatCurrency(data.finance.income)} em entradas no mês
          </div>
        </div>
      </div>

      <div className="general-report-timeline">
        <div className="general-report-timeline-header">
          <h5 className="title" style={{ margin: 0 }}>
            Linha do tempo da semana
          </h5>
          <span className="muted" style={{ fontSize: 12 }}>
            Alimentação · Treino · Gastos altos
          </span>
        </div>
        <div className="general-report-timeline-track">
          {data.timeline.map((day) => (
            <div key={day.date} className="general-report-timeline-day">
              <div className="general-report-timeline-label">{day.label}</div>
              <div className="general-report-timeline-dots">
                <span
                  className={`general-report-dot ${day.nutritionOk ? 'ok' : 'warn'}`}
                  title="Alimentação"
                />
                <span
                  className={`general-report-dot ${day.workout ? 'ok' : 'muted'}`}
                  title="Treino"
                />
                <span
                  className={`general-report-dot ${day.highSpending ? 'danger' : 'muted'}`}
                  title="Gastos altos"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GeneralReport;
