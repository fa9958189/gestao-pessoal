import React, { useEffect, useMemo, useState } from 'react';

const getStatusFromGoal = (value, goal) => {
  if (!goal) return 'Sem meta';
  const diffRatio = (value - goal) / goal;
  if (diffRatio < -0.05) return 'Abaixo da meta';
  if (diffRatio > 0.05) return 'Acima da meta';
  return 'Dentro da meta';
};

const formatNumber = (value, decimals = 0) => {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

function FoodDiaryReports({ userId, supabase, selectedDate, goals }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      if (!userId || !supabase) return;
      setLoading(true);
      setError(null);

      try {
        const today = new Date(selectedDate || new Date());
        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 29);

        const todayStr = today.toISOString().slice(0, 10);
        const fromDateStr = fromDate.toISOString().slice(0, 10);

        const { data, error: dbError } = await supabase
          .from('food_diary_entries')
          .select('*')
          .eq('user_id', userId)
          .gte('entry_date', fromDateStr)
          .lte('entry_date', todayStr)
          .order('entry_date', { ascending: true });

        if (dbError) throw dbError;
        if (!isMounted) return;
        setEntries(data || []);

        const { data: weightData, error: weightError } = await supabase
          .from('food_weight_history')
          .select('*')
          .eq('user_id', userId)
          .order('entry_date', { ascending: true })
          .limit(30);

        if (weightError) throw weightError;
        setWeightHistory(
          (weightData || []).map((item) => ({
            date: item.entry_date,
            weightKg: Number(item.weight_kg) || 0,
            recordedAt: item.recorded_at,
          })),
        );
      } catch (err) {
        console.error('Erro ao carregar relatórios do diário alimentar:', err);
        if (isMounted) setError('Não foi possível carregar os relatórios.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadReports();
    return () => {
      isMounted = false;
    };
  }, [userId, supabase, selectedDate]);

  const daysRange = useMemo(() => {
    const today = new Date(selectedDate || new Date());
    const dates = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [selectedDate]);

  const dailyTotals = useMemo(() => {
    return daysRange.map((date) => {
      const dayEntries = (entries || []).filter(
        (item) => item.entry_date === date || item.entryDate === date,
      );
      const totalCalories = dayEntries.reduce(
        (sum, item) => sum + (Number(item.calories) || 0),
        0,
      );
      const totalProtein = dayEntries.reduce(
        (sum, item) => sum + (Number(item.protein) || 0),
        0,
      );
      const totalWater = dayEntries.reduce(
        (sum, item) => sum + (Number(item.water_ml ?? item.waterMl) || 0),
        0,
      );
      return { date, totalCalories, totalProtein, totalWater };
    });
  }, [daysRange, entries]);

  const last7DaysEntries = useMemo(() => {
    const validDates = new Set(daysRange);
    return (entries || []).filter((item) => {
      const dateKey = item.entry_date || item.entryDate;
      return dateKey && validDates.has(dateKey);
    });
  }, [entries, daysRange]);

  const calorieGoal = Number(goals?.calories) || 0;
  const proteinGoal = Number(goals?.protein) || 0;
  const waterGoalLiters = Number(goals?.water) || 0;

  const stats = useMemo(() => {
    const totalCaloriesWeek = dailyTotals.reduce(
      (sum, day) => sum + day.totalCalories,
      0,
    );
    const totalProteinWeek = dailyTotals.reduce(
      (sum, day) => sum + day.totalProtein,
      0,
    );
    const totalWaterWeek = dailyTotals.reduce((sum, day) => sum + day.totalWater, 0);
    const daysCount = Math.max(dailyTotals.length, 1);

    return {
      avgCalories: totalCaloriesWeek / daysCount,
      avgProtein: totalProteinWeek / daysCount,
      totalWaterWeek,
      totalCaloriesWeek,
      totalProteinWeek,
    };
  }, [dailyTotals]);

  const heatmapRange = useMemo(() => {
    const today = new Date(selectedDate || new Date());
    const dates = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [selectedDate]);

  const entriesByDate = useMemo(() => {
    return (entries || []).reduce((acc, item) => {
      const dateKey = item.entry_date || item.entryDate || item.date;
      if (!dateKey) return acc;
      const current = acc[dateKey] || { calories: 0, protein: 0, water: 0, items: [] };
      acc[dateKey] = {
        calories: current.calories + (Number(item.calories) || 0),
        protein: current.protein + (Number(item.protein) || 0),
        water: current.water + (Number(item.water_ml ?? item.waterMl) || 0),
        items: [...current.items, item],
      };
      return acc;
    }, {});
  }, [entries]);

  const heatmapData = useMemo(() => {
    return heatmapRange.map((date) => {
      const dayData = entriesByDate[date];
      const totalCalories = dayData?.calories || 0;
      let color = '#3a3a3a';
      if (totalCalories > 0 && totalCalories < 1000) color = '#b59f3b';
      else if (totalCalories >= 1000 && totalCalories <= 2000) color = '#50be78';
      else if (totalCalories > 2000) color = '#c0392b';
      return { date, totalCalories, color };
    });
  }, [heatmapRange, entriesByDate]);

  const foodRanking = useMemo(() => {
    const counts = last7DaysEntries.reduce((acc, item) => {
      const foodName = item.food || item.nome || item.alimento;
      if (!foodName) return acc;
      const current = acc[foodName] || { times: 0, calories: 0 };
      acc[foodName] = {
        times: current.times + 1,
        calories: current.calories + (Number(item.calories) || 0),
      };
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([food, info]) => ({ food, times: info.times, calories: info.calories }))
      .sort((a, b) => b.calories - a.calories || b.times - a.times)
      .slice(0, 5);
  }, [last7DaysEntries]);

  const weightTrend = useMemo(() => {
    return weightHistory
      .slice()
      .filter((item) => item.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [weightHistory]);

  const recentWeightTrend = useMemo(() => {
    return weightTrend.slice(-10);
  }, [weightTrend]);

  const adherence = useMemo(() => {
    const totalDays = dailyTotals.length || 0;
    const withinCalories = calorieGoal
      ? dailyTotals.filter(
          (day) => getStatusFromGoal(day.totalCalories, calorieGoal) === 'Dentro da meta',
        ).length
      : 0;
    const withinProtein = proteinGoal
      ? dailyTotals.filter(
          (day) => getStatusFromGoal(day.totalProtein, proteinGoal) === 'Dentro da meta',
        ).length
      : 0;
    const withinWater = waterGoalLiters
      ? dailyTotals.filter(
          (day) => getStatusFromGoal(day.totalWater / 1000, waterGoalLiters) === 'Dentro da meta',
        ).length
      : 0;

    return {
      totalDays,
      withinCalories,
      withinProtein,
      withinWater,
      hasGoals: Boolean(calorieGoal || proteinGoal || waterGoalLiters),
    };
  }, [dailyTotals, calorieGoal, proteinGoal, waterGoalLiters]);

  if (loading) {
    return <p>Carregando relatórios...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  const maxCalories = Math.max(
    ...dailyTotals.map((day) => day.totalCalories || 0),
    1,
  );

  const maxRankingCalories = Math.max(
    ...foodRanking.map((food) => food.calories || 0),
    1,
  );

  const maxDayCalories = Math.max(
    ...heatmapData.map((day) => day.totalCalories || 0),
    1,
  );

  const heatmapWeeks = heatmapData.reduce((acc, day, index) => {
    if (index % 7 === 0) acc.push([]);
    acc[acc.length - 1].push(day);
    return acc;
  }, []);

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 className="title" style={{ margin: 0 }}>Relatórios do diário</h4>
        <div className="muted" style={{ fontSize: 12 }}>
          Visão geral dos últimos 7 dias com base nas suas metas.
        </div>
      </div>

      <div className="sep" style={{ margin: '12px 0 16px' }}></div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 200px',
            background: '#131722',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 220,
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>Média de calorias (7 dias)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {formatNumber(stats.avgCalories, 0)} kcal
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Meta diária: {calorieGoal ? `${formatNumber(calorieGoal, 0)} kcal` : '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Status: <strong>{getStatusFromGoal(stats.avgCalories, calorieGoal)}</strong>
          </div>
        </div>

        <div
          style={{
            flex: '1 1 200px',
            background: '#131722',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 220,
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>Média de proteína (7 dias)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {formatNumber(stats.avgProtein, 0)} g
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Meta diária: {proteinGoal ? `${formatNumber(proteinGoal, 0)} g` : '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Status: <strong>{getStatusFromGoal(stats.avgProtein, proteinGoal)}</strong>
          </div>
        </div>

        <div
          style={{
            flex: '1 1 200px',
            background: '#131722',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 220,
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>Água consumida (7 dias)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {formatNumber(stats.totalWaterWeek / 1000, 1)} L
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Meta para 7 dias:{' '}
            {waterGoalLiters
              ? `${formatNumber(waterGoalLiters * 7, 1)} L`
              : '—'}
          </div>
        </div>
      </div>

      <div className="sep" style={{ margin: '16px 0 12px' }}></div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Calorias por dia</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dailyTotals.map((day) => (
            <div key={day.date}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                <span>{new Date(day.date).toLocaleDateString('pt-BR')}</span>
                <span className="muted">{formatNumber(day.totalCalories, 0)} kcal</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min((day.totalCalories / maxCalories) * 100, 100)}%`,
                    height: '100%',
                    background: '#50be78',
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 320px',
            background: '#131722',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 260,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Aderência às metas (7 dias)</div>
          {adherence.hasGoals ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Dias com calorias dentro da meta</span>
                <strong>{adherence.withinCalories} de {adherence.totalDays}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Dias com proteína dentro da meta</span>
                <strong>{adherence.withinProtein} de {adherence.totalDays}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Dias com água dentro da meta</span>
                <strong>{adherence.withinWater} de {adherence.totalDays}</strong>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Configure suas metas para acompanhar sua aderência.
            </div>
          )}
        </div>

        <div
          style={{
            flex: '1 1 320px',
            background: '#131722',
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 260,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Resumo da semana</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Calorias médias (7 dias)</span>
              <strong>{formatNumber(stats.avgCalories, 0)} kcal</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Proteína média (7 dias)</span>
              <strong>{formatNumber(stats.avgProtein, 0)} g</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Água média (7 dias)</span>
              <strong>{formatNumber(stats.totalWaterWeek / 7000, 1)} L</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="sep" style={{ margin: '16px 0 12px' }}></div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Visão detalhada do diário</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {/* Ranking de alimentos */}
          <div
            style={{
              background: '#131722',
              borderRadius: 12,
              padding: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              minHeight: 220,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Ranking de alimentos (7 dias)</div>
            {foodRanking.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {foodRanking.map((item) => {
                  const barWidth = Math.min((item.calories / maxRankingCalories) * 100, 100);
                  return (
                    <div key={item.food}>
                      <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{item.food}</span>
                        <span className="muted">{formatNumber(item.calories, 0)} kcal</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: '#50be78',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#0c111c',
                          }}
                        >
                          {item.times}x
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Sem dados suficientes para o ranking nos últimos 7 dias.
              </div>
            )}
          </div>

          {/* Heatmap de calorias dos últimos 30 dias */}
          <div
            style={{
              background: '#131722',
              borderRadius: 12,
              padding: 12,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Mapa de calor (30 dias)</div>
            {entries.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Sem registros suficientes para montar o mapa de calor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {heatmapWeeks.map((week, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                    {week.map((day) => {
                      const intensity = Math.min(day.totalCalories / maxDayCalories, 1);
                      const background = day.totalCalories
                        ? `rgba(80, 190, 120, ${0.25 + intensity * 0.6})`
                        : 'rgba(255,255,255,0.04)';
                      const borderColor = 'rgba(255,255,255,0.08)';
                      return (
                        <div
                          key={day.date}
                          title={`${new Date(day.date).toLocaleDateString('pt-BR')} – ${formatNumber(day.totalCalories, 0)} kcal`}
                          style={{
                            height: 26,
                            borderRadius: 6,
                            background,
                            border: `1px solid ${borderColor}`,
                            cursor: 'default',
                          }}
                        ></div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Cada quadrado representa um dia; tons mais fortes indicam maior consumo de calorias.
            </div>
          </div>

          {/* Mini gráfico de peso */}
          <div
            style={{
              background: '#131722',
              borderRadius: 12,
              padding: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              minHeight: 220,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Evolução do peso (recentes)</div>
            {recentWeightTrend.length < 2 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Adicione mais registros de peso para visualizar a tendência.
              </div>
            ) : (
              <>
                <div style={{ width: '100%', height: 160 }}>
                  <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                    {(() => {
                      const weights = recentWeightTrend.map((item) => item.weightKg);
                      const minWeight = Math.min(...weights);
                      const maxWeight = Math.max(...weights);
                      const range = maxWeight - minWeight || 1;
                      const points = recentWeightTrend.map((item, index) => {
                        const x = (index / Math.max(recentWeightTrend.length - 1, 1)) * 100;
                        const y = 60 - ((item.weightKg - minWeight) / range) * 60;
                        return `${x},${y}`;
                      });
                      return (
                        <>
                          <polyline
                            points={points.join(' ')}
                            fill="none"
                            stroke="#50be78"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          {points.map((point, idx) => (
                            <circle
                              key={point}
                              cx={point.split(',')[0]}
                              cy={point.split(',')[1]}
                              r="2"
                              fill="#50be78"
                            >
                              <title>
                                {`${new Date(recentWeightTrend[idx].date).toLocaleDateString('pt-BR')} – ${formatNumber(
                                  recentWeightTrend[idx].weightKg,
                                  1,
                                )} kg`}
                              </title>
                            </circle>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {`De ${formatNumber(recentWeightTrend[0].weightKg, 1)} kg para ${formatNumber(
                    recentWeightTrend[recentWeightTrend.length - 1].weightKg,
                    1,
                  )} kg`}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FoodDiaryReports;
