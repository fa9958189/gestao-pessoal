import React from 'react';

const MiniStats = ({ items = [] }) => {
  return (
    <div className="mini-stats-grid">
      {items.map((item, idx) => (
        <div key={`${item.label}-${idx}`} className="mini-stat-card">
          <div className="mini-stat-label">{item.label}</div>
          <div className="mini-stat-value">{item.value}</div>
          {item.helper && <div className="mini-stat-helper">{item.helper}</div>}
        </div>
      ))}
      {items.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>
          Nenhuma estatística disponível ainda.
        </div>
      )}
    </div>
  );
};

export default MiniStats;
