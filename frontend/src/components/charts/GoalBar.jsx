import React, { useMemo } from 'react';

const GoalBar = ({ current = 0, goal = 0, label }) => {
  const percentage = useMemo(() => {
    if (!goal) return 0;
    const raw = (Number(current || 0) / Number(goal || 1)) * 100;
    return Math.min(Math.max(raw, 0), 100);
  }, [current, goal]);

  return (
    <div className="chart-card">
      <div className="chart-title">{label}</div>
      <div className="goal-bar">
        <div className="goal-bar-track">
          <div
            className="goal-bar-fill"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <div className="goal-bar-footer">
          <span className="goal-bar-highlight">{Math.round(percentage)}%</span>
          <span className="muted">
            {Math.max(Number(current || 0), 0)} / {Math.max(Number(goal || 0), 0)} treinos
          </span>
        </div>
      </div>
    </div>
  );
};

export default GoalBar;
