import React, { useEffect, useMemo, useState } from 'react';

const CACHE_PREFIX = 'gp-general-report-cache-v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

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


const evolutionLevels = [
  { label: 'Início', min: 0, max: 19 },
  { label: 'Em progresso', min: 20, max: 39 },
  { label: 'Consistente', min: 40, max: 59 },
  { label: 'Evoluindo', min: 60, max: 79 },
  { label: 'Alta performance', min: 80, max: 100 },
];

const getLifeLevel = (score) => {
  const value = Number(score) || 0;
  if (value < 20) return 'Início';
  if (value < 40) return 'Em progresso';
  if (value < 60) return 'Consistente';
  if (value < 80) return 'Evoluindo';
  return 'Alta performance';
};

const getNextLevel = (score) => {
  const value = Number(score) || 0;
  const currentIndex = evolutionLevels.findIndex((level) => value >= level.min && value <= level.max);
  const next = evolutionLevels[Math.min(currentIndex + 1, evolutionLevels.length - 1)];
  return next?.label || evolutionLevels[evolutionLevels.length - 1].label;
};

const getRemainingPointsToNextLevel = (score) => {
  const value = Number(score) || 0;
  if (value >= 80) return 0;
  if (value < 20) return 20 - value;
  if (value < 40) return 40 - value;
  if (value < 60) return 60 - value;
  return 80 - value;
};

const generateWeeklyInsight = ({ nutritionScore, trainingScore, financeScore }) => {
  const priorities = [
    { key: 'alimentação', value: nutritionScore, message: 'Seu foco da semana deve ser melhorar a qualidade da sua alimentação.' },
    { key: 'treinos', value: trainingScore, message: 'Seu foco da semana deve ser melhorar sua constância nos treinos.' },
    { key: 'financeiro', value: financeScore, message: 'Seu foco da semana deve ser organizar melhor seus gastos para proteger seu saldo.' },
  ];
  priorities.sort((a, b) => a.value - b.value);
  return priorities[0]?.message || 'Você está em ótimo ritmo. Mantenha sua consistência nos três pilares.';
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

function GeneralReport({ userId, supabase, goals, refreshToken }) {
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
  }, [goals, supabase, userId, refreshToken]);

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
  const cachedState = avatarCache?.state;
  const displayAvatarState = avatarState || cachedState || 'em_progresso';

  useEffect(() => {
    if (avatarState && avatarState !== cachedState) {
      writeAvatarCache(userId, avatarState);
      setAvatarCache({ state: avatarState, savedAt: Date.now() });
    }
  }, [avatarState, cachedState, userId]);

  const heroAvatarLabel = {
    recuperacao: 'Fase de recuperação',
    em_progresso: 'Em progresso',
    em_forma: 'Em forma',
  };

  const currentLevel = getLifeLevel(lifeScore);
  const nextLevel = getNextLevel(lifeScore);
  const pointsToNextLevel = getRemainingPointsToNextLevel(lifeScore);
  const weeklyInsight = generateWeeklyInsight({
    nutritionScore: data.scores.nutritionScore,
    trainingScore: data.scores.trainingScore,
    financeScore: data.scores.financeScore,
  });

  const evolutionTips = [];
  if (data.scores.nutritionScore < 60) {
    evolutionTips.push('Melhore sua alimentação esta semana');
  }
  if (data.scores.trainingScore < 60) {
    evolutionTips.push('Registre mais treinos');
  }
  if (!evolutionTips.length) {
    evolutionTips.push('Mantenha a consistência diária para avançar de nível.');
  }

  return (
    <div className="general-report">
      <div className="general-report-hero">
        <div className="general-report-hero-header">
          <div>
            <h4 className="title" style={{ margin: 0 }}>
              Relatório Geral
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
            <div className="general-report-score">
              <div className="general-report-score-header">
                <span>Nível atual</span>
                <strong>{currentLevel}</strong>
              </div>
              <div className="general-report-metric">
                <span>Score de vida</span>
                <strong>{data.scores.lifeScore} / 100</strong>
              </div>
              <div className="general-report-metric">
                <span>Próximo nível</span>
                <strong>{nextLevel}</strong>
              </div>
              <div className="general-report-metric">
                <span>Pontos restantes</span>
                <strong>{pointsToNextLevel}</strong>
              </div>
              <div className="general-report-score-bar">
                <div
                  className="general-report-score-progress"
                  style={{ width: `${Math.min(data.scores.lifeScore, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="gp-avatar-section">
        <div className="gp-avatar-header">
          <h5 className="title" style={{ margin: 0 }}>Níveis de Evolução</h5>
        </div>
        <div className="evolution-level-grid">
          {evolutionLevels.map((level) => (
            <div
              key={level.label}
              className={`evolution-level-card ${currentLevel === level.label ? 'active' : ''}`}
            >
              <strong>{level.label}</strong>
              <span>{level.min} - {level.max}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="general-report-grid">
        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>Score detalhado</h5>
          </div>
          <div className="detailed-score-row">
            <div className="general-report-metric"><span>Alimentação: {data.scores.nutritionScore} / 100</span></div>
            <div className="general-report-score-bar"><div className="general-report-score-progress" style={{ width: `${data.scores.nutritionScore}%` }} /></div>
          </div>
          <div className="detailed-score-row">
            <div className="general-report-metric"><span>Treino: {data.scores.trainingScore} / 100</span></div>
            <div className="general-report-score-bar"><div className="general-report-score-progress" style={{ width: `${data.scores.trainingScore}%` }} /></div>
          </div>
          <div className="detailed-score-row">
            <div className="general-report-metric"><span>Financeiro: {data.scores.financeScore} / 100</span></div>
            <div className="general-report-score-bar"><div className="general-report-score-progress" style={{ width: `${data.scores.financeScore}%` }} /></div>
          </div>
        </div>

        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>Como subir de nível</h5>
          </div>
          {evolutionTips.map((tip) => (
            <div key={tip} className="general-report-pill">{tip}</div>
          ))}
        </div>

        <div className="general-report-card">
          <div className="general-report-card-header">
            <h5 className="title" style={{ margin: 0 }}>Insight automático</h5>
          </div>
          <p className="general-report-hero-text" style={{ color: '#e2e8f0' }}>{weeklyInsight}</p>
        </div>
      </div>
    </div>
  );

}

export default GeneralReport;
