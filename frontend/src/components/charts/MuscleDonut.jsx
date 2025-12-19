import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const colorPalette = [
  '#7df59c',
  '#50be78',
  '#8b5cf6',
  '#22d3ee',
  '#f59e0b',
  '#f472b6',
  '#38bdf8',
  '#a3e635',
];

const MuscleDonut = ({ data = [], title }) => {
  const chartData = useMemo(
    () => ({
      labels: data.map((item) => item.label),
      datasets: [
        {
          data: data.map((item) => item.value || 0),
          backgroundColor: colorPalette,
          borderWidth: 0,
          cutout: '70%',
        },
      ],
    }),
    [data]
  );

  const options = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw || 0} treino(s)`
          }
        }
      },
      responsive: true,
      maintainAspectRatio: false,
    }),
    []
  );

  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div className="chart-with-legend">
        <div style={{ height: 240 }}>
          <Doughnut data={chartData} options={options} />
        </div>
        <div className="chart-legend">
          {data.map((item, index) => (
            <div key={item.label} className="chart-legend-item">
              <span
                className="chart-legend-dot"
                style={{ backgroundColor: colorPalette[index % colorPalette.length] }}
              ></span>
              <div>
                <div className="chart-legend-label">{item.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{item.value} treino(s)</div>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>Sem dados para exibir.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MuscleDonut;
