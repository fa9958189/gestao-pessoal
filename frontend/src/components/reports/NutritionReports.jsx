import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const formatDateKey = (date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

const getDateRange = (selectedDate) => {
  const endDate = selectedDate ? new Date(selectedDate) : new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - (6 - index));
    return d;
  });
};

const getDayStatus = (day) => {
  const score =
    (day.calorieGoal ? day.calories / day.calorieGoal : 0) +
    (day.proteinGoal ? day.protein / day.proteinGoal : 0) +
    (day.waterGoal ? day.water / day.waterGoal : 0);
  const ratio = score / 3;

  if (ratio >= 1) return { color: '#50be78', label: 'Meta atingida' };
  if (ratio >= 0.75) return { color: '#f2c94c', label: 'Próximo da meta' };
  return { color: '#e74c3c', label: 'Muito abaixo' };
};

export const generateNutritionInsights = (data) => {
  const proteinMissed = data.filter((day) => day.protein < day.proteinGoal).length;
  const waterMissed = data.filter((day) => day.water < day.waterGoal).length;
  const consistency = data.filter((day) => day.metaAtingidaDia).length;

  const insights = [];

  if (proteinMissed >= 3) {
    insights.push(`Você não atingiu proteína em ${proteinMissed} dias da semana.`);
  }

  if (waterMissed >= 3) {
    insights.push('Sua hidratação caiu nos últimos dias.');
  }

  if (consistency >= 5) {
    insights.push('Excelente consistência esta semana!');
  }

  if (insights.length === 0) {
    insights.push('Você está evoluindo bem. Continue registrando para melhorar ainda mais.');
  }

  return insights;
};

function NutritionReports({ userId, supabase, goals, selectedDate }) {
  const [nutritionData, setNutritionData] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({ daysMet: 0, daysInMonth: 30 });
  const [loading, setLoading] = useState(true);

  const getLast7DaysNutrition = async (currentUserId) => {
    if (!currentUserId || !supabase) return [];

    const dateRange = getDateRange(selectedDate);
    const fromDate = formatDateKey(dateRange[0]);
    const toDate = formatDateKey(dateRange[dateRange.length - 1]);

    const [mealsResult, hydrationResult] = await Promise.all([
      supabase
        .from('food_diary_entries')
        .select('entry_date, calories, protein')
        .eq('user_id', currentUserId)
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate),
      supabase
        .from('hydration_logs')
        .select('day_date, amount_ml')
        .eq('user_id', currentUserId)
        .gte('day_date', fromDate)
        .lte('day_date', toDate),
    ]);

    if (mealsResult.error) throw mealsResult.error;
    if (hydrationResult.error) throw hydrationResult.error;

    const mealsByDay = (mealsResult.data || []).reduce((acc, meal) => {
      const date = meal.entry_date;
      const current = acc[date] || { calories: 0, protein: 0 };
      acc[date] = {
        calories: current.calories + (Number(meal.calories) || 0),
        protein: current.protein + (Number(meal.protein) || 0),
      };
      return acc;
    }, {});

    const waterByDay = (hydrationResult.data || []).reduce((acc, entry) => {
      const date = entry.day_date;
      acc[date] = (acc[date] || 0) + (Number(entry.amount_ml) || 0);
      return acc;
    }, {});

    return dateRange.map((dateObj) => {
      const date = formatDateKey(dateObj);
      const calories = mealsByDay[date]?.calories || 0;
      const protein = mealsByDay[date]?.protein || 0;
      const water = (waterByDay[date] || 0) / 1000;
      const calorieGoal = Number(goals?.calories) || 0;
      const proteinGoal = Number(goals?.protein) || 0;
      const waterGoal = Number(goals?.water) || 0;
      const metaAtingidaDia =
        calories >= calorieGoal &&
        protein >= proteinGoal &&
        water >= waterGoal;

      return {
        date,
        label: dayLabels[dateObj.getDay()],
        calories,
        protein,
        water,
        calorieGoal,
        proteinGoal,
        waterGoal,
        metaAtingidaDia,
      };
    });
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await getLast7DaysNutrition(userId);
        if (!isMounted) return;
        setNutritionData(data);
      } catch (error) {
        console.error('Erro ao carregar dados de nutrição:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [userId, supabase, selectedDate, goals]);

  useEffect(() => {
    let isMounted = true;

    const loadMonthProgress = async () => {
      if (!userId || !supabase) return;

      const baseDate = selectedDate ? new Date(selectedDate) : new Date();
      const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

      const [mealsResult, hydrationResult] = await Promise.all([
        supabase
          .from('food_diary_entries')
          .select('entry_date, calories, protein')
          .eq('user_id', userId)
          .gte('entry_date', formatDateKey(monthStart))
          .lte('entry_date', formatDateKey(monthEnd)),
        supabase
          .from('hydration_logs')
          .select('day_date, amount_ml')
          .eq('user_id', userId)
          .gte('day_date', formatDateKey(monthStart))
          .lte('day_date', formatDateKey(monthEnd)),
      ]);

      if (mealsResult.error) throw mealsResult.error;
      if (hydrationResult.error) throw hydrationResult.error;

      const byDate = {};
      (mealsResult.data || []).forEach((meal) => {
        const date = meal.entry_date;
        const current = byDate[date] || { calories: 0, protein: 0, water: 0 };
        byDate[date] = {
          ...current,
          calories: current.calories + (Number(meal.calories) || 0),
          protein: current.protein + (Number(meal.protein) || 0),
        };
      });
      (hydrationResult.data || []).forEach((entry) => {
        const date = entry.day_date;
        const current = byDate[date] || { calories: 0, protein: 0, water: 0 };
        byDate[date] = {
          ...current,
          water: current.water + (Number(entry.amount_ml) || 0) / 1000,
        };
      });

      const calorieGoal = Number(goals?.calories) || 0;
      const proteinGoal = Number(goals?.protein) || 0;
      const waterGoal = Number(goals?.water) || 0;
      const daysMet = Object.values(byDate).filter(
        (day) => day.calories >= calorieGoal && day.protein >= proteinGoal && day.water >= waterGoal,
      ).length;

      if (isMounted) {
        setMonthlyStats({
          daysMet,
          daysInMonth: monthEnd.getDate(),
        });
      }
    };

    loadMonthProgress().catch((error) => {
      console.error('Erro ao carregar progresso mensal:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [userId, supabase, selectedDate, goals]);

  const weeklyConsistency = useMemo(
    () => nutritionData.filter((day) => day.metaAtingidaDia).length,
    [nutritionData],
  );

  const disciplineScore = useMemo(() => {
    if (!nutritionData.length) return 0;
    const proteinGoal = Number(goals?.protein) || 0;
    const waterGoal = Number(goals?.water) || 0;
    const avgProtein =
      nutritionData.reduce((sum, day) => sum + day.protein, 0) / nutritionData.length;
    const avgWater =
      nutritionData.reduce((sum, day) => sum + day.water, 0) / nutritionData.length;

    const percentualProteina = proteinGoal ? Math.min(avgProtein / proteinGoal, 1) : 0;
    const percentualAgua = waterGoal ? Math.min(avgWater / waterGoal, 1) : 0;

    return Math.min(
      100,
      Math.round(weeklyConsistency * 10 + percentualProteina * 40 + percentualAgua * 40),
    );
  }, [nutritionData, weeklyConsistency, goals]);

  const insights = useMemo(() => generateNutritionInsights(nutritionData), [nutritionData]);

  if (loading) {
    return <p>Carregando dashboard nutricional...</p>;
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <h4 className="title" style={{ marginTop: 0 }}>Dashboard de nutrição</h4>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="food-diary-summary-card" style={{ flex: '1 1 240px' }}>
          <div className="muted">Meta atingida</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{weeklyConsistency} / 7 dias</div>
        </div>
        <div className="food-diary-summary-card" style={{ flex: '1 1 240px' }}>
          <div className="muted">Disciplina alimentar</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{disciplineScore} / 100</div>
        </div>
      </div>

      <div style={{ width: '100%', height: 250, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Calorias vs Meta</div>
        <ResponsiveContainer>
          <LineChart data={nutritionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="calories" stroke="#50be78" strokeWidth={2} />
            <Line type="monotone" dataKey="calorieGoal" stroke="#6ab0ff" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 280, height: 240 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Proteína</div>
          <ResponsiveContainer>
            <BarChart data={nutritionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="protein" fill="#6ab0ff" />
              <Bar dataKey="proteinGoal" fill="#3b4f7a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 280, height: 240 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Água (L)</div>
          <ResponsiveContainer>
            <BarChart data={nutritionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="water" fill="#4cc9f0" />
              <Bar dataKey="waterGoal" fill="#355070" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Mapa da semana</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {nutritionData.map((day) => {
            const status = getDayStatus(day);
            return (
              <div key={day.date} style={{ textAlign: 'center' }} title={status.label}>
                <div className="muted" style={{ marginBottom: 6 }}>{day.label}</div>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: status.color,
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Progresso do mês</div>
        <div className="muted" style={{ marginBottom: 6 }}>
          {monthlyStats.daysMet} / {monthlyStats.daysInMonth} dias com meta completa
        </div>
        <div style={{ height: 10, borderRadius: 12, background: 'rgba(255,255,255,0.1)' }}>
          <div
            style={{
              width: `${Math.min((monthlyStats.daysMet / monthlyStats.daysInMonth) * 100, 100)}%`,
              height: '100%',
              borderRadius: 12,
              background: '#50be78',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Insights automáticos</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {insights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default NutritionReports;
