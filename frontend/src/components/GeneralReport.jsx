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

const AVATAR_CACHE_KEY = 'gp-avatar-state-v1';

const readAvatarCache = (userId) => {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(`${AVATAR_CACHE_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.state || !parsed?.savedAt) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeAvatarCache = (userId, state) => {
  if (!userId || !state) return;
  try {
    window.localStorage.setItem(
      `${AVATAR_CACHE_KEY}:${userId}`,
      JSON.stringify({ state, savedAt: Date.now() }),
    );
  } catch (error) {
    // noop
  }
};

const getAvatarState = (score) => {
  if (!Number.isFinite(score)) return 'em_progresso';
  if (score < 40) return 'recuperacao';
  if (score < 75) return 'em_progresso';
  return 'em_forma';
};

const getNextAvatarState = (state) => {
  if (state === 'recuperacao') return 'em_progresso';
  if (state === 'em_progresso') return 'em_forma';
  return 'em_forma';
};

const avatarMeta = {
  recuperacao: {
    label: 'Recuperação',
    description: 'Pouca consistência. Ajuste alimentação e treinos pra subir rápido.',
    body: '#fb7185',
    accent: '#facc15',
    mood: 'sad',
  },
  em_progresso: {
    label: 'Em progresso',
    description: 'Você está no caminho. Falta só constância e bater as metas.',
    body: '#fbbf24',
    accent: '#38bdf8',
    mood: 'neutral',
  },
  em_forma: {
    label: 'Em forma',
    description: 'Top! Mantendo rotina e metas, seu resultado acelera.',
    body: '#34d399',
    accent: '#22c55e',
    mood: 'happy',
  },
};

const Avatar2D = ({ state = 'em_progresso', size = 160, className = '' }) => {
  const meta = avatarMeta[state] || avatarMeta.em_progresso;
  const headY = state === 'recuperacao' ? 36 : state === 'em_progresso' ? 30 : 26;
  const torsoY = state === 'recuperacao' ? 72 : state === 'em_progresso' ? 64 : 58;
  const torsoHeight = state === 'recuperacao' ? 56 : state === 'em_progresso' ? 62 : 68;
  const torsoWidth = state === 'recuperacao' ? 44 : state === 'em_progresso' ? 50 : 56;
  const armRaise = state === 'em_forma' ? 12 : state === 'em_progresso' ? 6 : 0;
  const stance = state === 'recuperacao' ? 6 : state === 'em_progresso' ? 0 : -6;
  const mouthPath = meta.mood === 'happy'
    ? 'M68 44c5 6 19 6 24 0'
    : meta.mood === 'sad'
      ? 'M68 50c5 -6 19 -6 24 0'
      : 'M70 46h20';

  return (
    <svg
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 160 176"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`gp-avatar-svg ${className}`.trim()}
      role="img"
      aria-label={`Avatar ${meta.label}`}
    >
      <rect x="24" y="10" width="112" height="156" rx="24" fill="#0f172a" opacity="0.5" />
      <circle cx="80" cy={headY} r="20" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
      <circle cx="72" cy={headY - 4} r="3" fill="#0f172a" />
      <circle cx="88" cy={headY - 4} r="3" fill="#0f172a" />
      <path d={mouthPath} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
      <rect
        x={80 - torsoWidth / 2}
        y={torsoY}
        width={torsoWidth}
        height={torsoHeight}
        rx="18"
        fill={meta.body}
        stroke="#0f172a"
        strokeWidth="2"
      />
      <rect
        x={80 - torsoWidth / 2 - 14}
        y={torsoY + 10 - armRaise}
        width="14"
        height="44"
        rx="8"
        fill={meta.body}
        stroke="#0f172a"
        strokeWidth="2"
      />
      <rect
        x={80 + torsoWidth / 2}
        y={torsoY + 10 - armRaise}
        width="14"
        height="44"
        rx="8"
        fill={meta.body}
        stroke="#0f172a"
        strokeWidth="2"
      />
      <rect
        x="56"
        y={torsoY + torsoHeight - 4}
        width="20"
        height="40"
        rx="10"
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth="2"
      />
      <rect
        x="84"
        y={torsoY + torsoHeight - 4}
        width="20"
        height="40"
        rx="10"
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth="2"
      />
      <circle cx={80 + stance} cy={torsoY + torsoHeight + 12} r="6" fill={meta.accent} />
      <path
        d="M52 128c8 6 48 6 56 0"
        stroke={meta.accent}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
};

function GeneralReport({ userId, supabase, goals }) {
  const [summary, setSummary] = useState(() => {
    const cached = readCache(userId);
    return cached?.data || null;
  });
  const [lastUpdated, setLastUpdated] = useState(() => readCache(userId)?.savedAt || null);
  const [loading, setLoading] = useState(!summary);
  const [avatarCache, setAvatarCache] = useState(() => readAvatarCache(userId));

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
  const lifeScore = data?.scores?.lifeScore ?? 0;
  const avatarState = getAvatarState(lifeScore);
  const nextAvatarState = getNextAvatarState(avatarState);
  const idealAvatarState = 'em_forma';
  const cachedState = avatarCache?.state;
  const displayAvatarState = avatarState || cachedState || 'em_progresso';

  useEffect(() => {
    if (avatarState && avatarState !== cachedState) {
      writeAvatarCache(userId, avatarState);
      setAvatarCache({ state: avatarState, savedAt: Date.now() });
    }
  }, [avatarState, cachedState, userId]);

  const focusPoints = useMemo(() => {
    const points = [];
    if (data?.goals?.proteinGoal && data.averages.protein < data.goals.proteinGoal * 0.9) {
      points.push('proteína');
    }
    if (data?.goals?.waterGoalMl && data.averages.water < data.goals.waterGoalMl * 0.9) {
      points.push('água');
    }
    if (data?.workouts?.constancy !== undefined && data.workouts.constancy < 50) {
      points.push('treino');
    }
    return points;
  }, [data]);

  const buildAvatarCopy = (state) => {
    const base = avatarMeta[state]?.description || '';
    if (!focusPoints.length || state === 'em_forma') return base;
    return `${base} Foco: ${focusPoints.join(', ')}.`;
  };

  const heroAvatarLabel = {
    recuperacao: 'Fase de recuperação',
    em_progresso: 'Em progresso',
    em_forma: 'Em forma',
  };

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
            <Avatar2D state={displayAvatarState} size={200} />
            <div className="general-report-avatar-label">
              {heroAvatarLabel[displayAvatarState]}
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

      <div className="gp-avatar-section">
        <div className="gp-avatar-header">
          <div>
            <h5 className="title" style={{ margin: 0 }}>
              Seu Avatar
            </h5>
            <span className="muted" style={{ fontSize: 12 }}>
              Veja seu estado atual e como pode evoluir.
            </span>
          </div>
          <div className="gp-avatar-score">
            Score atual <strong>{lifeScore}</strong>
          </div>
        </div>
        <div className="gp-avatar-content">
          <div className="gp-avatar-current">
            <Avatar2D state={displayAvatarState} size={180} />
            <div className="gp-avatar-current-label">
              {avatarMeta[displayAvatarState]?.label}
            </div>
            <p className="gp-avatar-current-text">
              {buildAvatarCopy(displayAvatarState)}
            </p>
          </div>
          <div className="gp-avatar-cards">
            <div className="gp-avatar-card">
              <div className="gp-avatar-card-title">Atual</div>
              <Avatar2D state={displayAvatarState} size={96} className="gp-avatar-mini" />
              <div className="gp-avatar-card-state">{avatarMeta[displayAvatarState]?.label}</div>
              <p className="gp-avatar-card-text">{buildAvatarCopy(displayAvatarState)}</p>
            </div>
            <div className="gp-avatar-card">
              <div className="gp-avatar-card-title">Próximo</div>
              <Avatar2D state={nextAvatarState} size={96} className="gp-avatar-mini" />
              <div className="gp-avatar-card-state">{avatarMeta[nextAvatarState]?.label}</div>
              <p className="gp-avatar-card-text">{buildAvatarCopy(nextAvatarState)}</p>
            </div>
            <div className="gp-avatar-card">
              <div className="gp-avatar-card-title">Ideal</div>
              <Avatar2D state={idealAvatarState} size={96} className="gp-avatar-mini" />
              <div className="gp-avatar-card-state">{avatarMeta[idealAvatarState]?.label}</div>
              <p className="gp-avatar-card-text">{buildAvatarCopy(idealAvatarState)}</p>
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
