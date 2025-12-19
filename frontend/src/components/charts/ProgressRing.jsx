import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const ProgressRing = ({ value = 0, max = 100, label }) => {
  const percentage = useMemo(() => {
    if (!max || Number.isNaN(max)) return 0;
    const raw = (Number(value || 0) / Number(max || 1)) * 100;
    return Math.min(Math.max(raw, 0), 100);
  }, [value, max]);

  const data = useMemo(() => {
    const safeValue = Math.max(Number(value || 0), 0);
    const safeMax = Math.max(Number(max || 0), 0);
    const remaining = Math.max(safeMax - safeValue, 0);
    return {
      labels: ['Progresso', 'Restante'],
      datasets: [
        {
          data: [safeValue, remaining],
          backgroundColor: ['#50be78', 'rgba(255,255,255,0.08)'],
          borderWidth: 0,
          cutout: '75%'
        }
      ]
    };
  }, [value, max]);

  const options = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }),
    []
  );

  return (
    <div className="chart-card">
      <div className="chart-title">{label}</div>
      <div className="progress-ring">
        <div className="progress-ring-chart">
          <Doughnut data={data} options={options} />
          <div className="progress-ring-center">
            <div className="progress-ring-value">{Math.round(percentage)}%</div>
            <div className="progress-ring-helper">
              {`${Math.max(Number(value || 0), 0)} de ${Math.max(Number(max || 0), 0)} dias`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressRing;
