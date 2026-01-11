import React, { useMemo } from 'react';
import { clampValue } from '../utils/generalReportMetrics';

const formatValue = (value, decimals = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const resolveStatus = (value, ranges) => {
  if (!Number.isFinite(value)) {
    return { label: 'Referência', tone: 'ok' };
  }
  const match = ranges.find(
    (range) => value >= range.from && value <= range.to,
  );
  if (match) return { label: match.label, tone: match.tone };
  if (value < ranges[0].from) {
    return { label: ranges[0].label, tone: ranges[0].tone };
  }
  const last = ranges[ranges.length - 1];
  return { label: last.label, tone: last.tone };
};

function MetricGauge({
  value,
  min,
  max,
  ranges,
  legendLabels,
  description,
  statusLabel,
  showTicks = [],
  showDetails = true,
}) {
  const safeMin = Number(min);
  const safeMax = Number(max);
  const safeValue = Number(value);
  const rawMarker = Number.isFinite(safeValue)
    ? (safeValue - safeMin) / (safeMax - safeMin)
    : 0;
  const markerPercent = clampValue(rawMarker, 0, 1);

  const computedStatus = useMemo(
    () => resolveStatus(safeValue, ranges),
    [safeValue, ranges],
  );

  const finalStatus = statusLabel || computedStatus.label;

  const legend = legendLabels?.length ? legendLabels : ranges.map((r) => r.label);

  return (
    <div className="metric-gauge">
      <div className={`metric-status tone-${computedStatus.tone}`}>
        {finalStatus}
      </div>
      <div className="gaugeBar">
        {ranges.map((range, index) => {
          const width = clampValue(
            ((range.to - range.from) / (safeMax - safeMin)) * 100,
            0,
            100,
          );
          return (
            <div
              key={`${range.label}-${index}`}
              className={`gaugeSeg tone-${range.tone}`}
              style={{ width: `${width}%` }}
            />
          );
        })}
        <div
          className="gaugeMarker"
          style={{ left: `${clampValue(markerPercent * 100, 0, 100)}%` }}
        />
      </div>
      {showTicks.length > 0 && (
        <div className="gaugeTicks">
          {showTicks.map((tick, index) => {
            const tickValue = Number(tick);
            const tickPercent = clampValue(
              (tickValue - safeMin) / (safeMax - safeMin),
              0,
              1,
            );
            return (
              <span
                key={`${tick}-${index}`}
                className="gaugeTick"
                style={{ left: `${tickPercent * 100}%` }}
              >
                {formatValue(tickValue, 1)}
              </span>
            );
          })}
        </div>
      )}
      {showDetails && (
        <>
          <div className="gaugeLegend">
            {legend.map((label, index) => (
              <span key={`${label}-${index}`} className="legendItem">
                <span className={`legendDot tone-${ranges[index]?.tone || 'ok'}`} />
                {label}
              </span>
            ))}
          </div>
          {description && (
            <div className="gaugeDescription">{description}</div>
          )}
        </>
      )}
    </div>
  );
}

export default MetricGauge;
