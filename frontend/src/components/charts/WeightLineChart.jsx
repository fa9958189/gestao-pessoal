import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const WeightLineChart = ({ dailyCounts = [] }) => {
  const labels = useMemo(
    () =>
      dailyCounts.map((item) => {
        const date = new Date(item.date);
        if (Number.isNaN(date.getTime())) return item.date;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      }),
    [dailyCounts]
  );

  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Treinos',
          data: dailyCounts.map((item) => item.count || 0),
          borderColor: '#7df59c',
          backgroundColor: 'rgba(125, 245, 156, 0.15)',
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
        },
      ],
    }),
    [dailyCounts, labels]
  );

  const options = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw || 0} treino(s)`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#9ba4b5', maxTicksLimit: 10 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: '#9ba4b5', precision: 0, beginAtZero: true },
          grid: { color: 'rgba(255,255,255,0.05)' },
          suggestedMax: Math.max(...dailyCounts.map((i) => i.count || 0), 3)
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    }),
    [dailyCounts]
  );

  return (
    <div className="chart-card">
      <div className="chart-title">Evolução de treinos nos últimos 30 dias</div>
      <div style={{ height: 240 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default WeightLineChart;
