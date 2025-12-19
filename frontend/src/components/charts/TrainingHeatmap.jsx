import React from 'react';

const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const TrainingHeatmap = ({ matrix = [], title }) => {
  const intensityColor = (value) => {
    const capped = Math.min(Math.max(value, 0), 4);
    const base = 20 + capped * 15;
    return `rgba(80, 190, 120, ${base / 100})`;
  };

  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div className="heatmap-wrapper">
        <div className="heatmap-grid">
          <div className="heatmap-header"></div>
          {weekdayLabels.map((label) => (
            <div key={label} className="heatmap-header">{label}</div>
          ))}
          {matrix.map((week) => (
            <React.Fragment key={week.weekLabel}>
              <div className="heatmap-row-label">{week.weekLabel}</div>
              {week.values.map((value, idx) => (
                <div
                  key={`${week.weekLabel}-${idx}`}
                  className="heatmap-cell"
                  style={{ background: intensityColor(value) }}
                  title={`${weekdayLabels[idx]}: ${value} treino(s)`}
                ></div>
              ))}
            </React.Fragment>
          ))}
          {matrix.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', padding: '8px 0' }}>
              Sem dados de treinos recentes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingHeatmap;
