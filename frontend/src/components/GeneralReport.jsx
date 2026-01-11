import React, { useMemo } from 'react';
import {
  activityMultiplier,
  buildMetricStatus,
  calcBMI,
  calcBMR_MifflinStJeor,
  calcBodyFatDeurenberg,
  clampValue,
} from '../utils/generalReportMetrics';

const formatNumber = (value, decimals = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const MetricCard = ({
  title,
  value,
  unit,
  statusText,
  statusType,
  markerPercent,
  rangeLabels,
  subtitle,
}) => (
  <div className="general-report-card">
    <div className="general-report-card-header">
      <h5 className="title" style={{ margin: 0 }}>
        {title}
      </h5>
      {subtitle && <span className="muted">{subtitle}</span>}
    </div>
    <div className="general-report-value">
      {value}
      {unit && <span className="general-report-unit">{unit}</span>}
    </div>
    <div className={`general-report-status ${statusType}`}>
      {statusText}
    </div>
    <div className="general-report-bar">
      <div className="general-report-bar-track" />
      <div
        className="general-report-marker"
        style={{ left: `${clampValue(markerPercent * 100, 0, 100)}%` }}
      />
    </div>
    {rangeLabels && (
      <div className="general-report-range">
        <span>{rangeLabels.min}</span>
        <span>{rangeLabels.max}</span>
      </div>
    )}
  </div>
);

function GeneralReport({ body, weightHistory }) {
  const latestWeight = useMemo(() => {
    if (!Array.isArray(weightHistory) || weightHistory.length === 0) {
      return null;
    }
    return weightHistory
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [weightHistory]);

  const weightKg =
    Number(body?.weightKg) ||
    (latestWeight?.weightKg != null ? Number(latestWeight.weightKg) : null);
  const heightCm = body?.heightCm ? Number(body.heightCm) : null;
  const sex = body?.sex || '';
  const age = body?.age ? Number(body.age) : null;
  const activityLevel = body?.activityLevel || '';

  const bmiValue = useMemo(() => calcBMI(weightKg, heightCm), [
    weightKg,
    heightCm,
  ]);

  const bmrValue = useMemo(
    () =>
      calcBMR_MifflinStJeor({
        sex,
        age,
        weightKg,
        heightCm,
      }),
    [sex, age, weightKg, heightCm],
  );

  const activityFactor = activityMultiplier(activityLevel);
  const tdeeValue = bmrValue && activityFactor ? bmrValue * activityFactor : null;

  const bodyFatValue = useMemo(
    () =>
      calcBodyFatDeurenberg({
        sex,
        age,
        bmi: bmiValue,
      }),
    [sex, age, bmiValue],
  );

  const fatMass = bodyFatValue && weightKg ? (weightKg * bodyFatValue) / 100 : null;
  const leanMass = weightKg && fatMass != null ? weightKg - fatMass : null;

  const bmiStatus = buildMetricStatus({
    value: bmiValue,
    min: 14,
    max: 40,
    targetMin: 18.5,
    targetMax: 24.9,
  });

  const bmiLabel = useMemo(() => {
    if (!bmiValue) return '—';
    if (bmiValue < 18.5) return 'Abaixo';
    if (bmiValue <= 24.9) return 'Normal';
    if (bmiValue <= 29.9) return 'Sobrepeso';
    return 'Obesidade';
  }, [bmiValue]);

  const bodyFatStatus = useMemo(() => {
    if (!bodyFatValue) {
      return buildMetricStatus({ value: null, min: 5, max: 45, alwaysReference: true });
    }
    const target =
      sex === 'Feminino' ? { min: 21, max: 33 } : { min: 8, max: 19 };
    return buildMetricStatus({
      value: bodyFatValue,
      min: 5,
      max: 45,
      targetMin: target.min,
      targetMax: target.max,
    });
  }, [bodyFatValue, sex]);

  const referenceStatus = (value, min, max) =>
    buildMetricStatus({ value, min, max, alwaysReference: true });

  const needsProfileData = !sex || !age || !activityLevel;
  const bmrStatus = referenceStatus(bmrValue, 1000, 2500);
  const tdeeStatus = referenceStatus(tdeeValue, 1400, 3500);
  const fatMassStatus = referenceStatus(fatMass, 0, 80);
  const leanMassStatus = referenceStatus(leanMass, 20, 120);

  return (
    <div className="general-report">
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h4 className="title" style={{ margin: 0 }}>
          Relatório Geral
        </h4>
        <span className="muted" style={{ fontSize: 12 }}>
          Estimativas baseadas nas informações do seu perfil.
        </span>
      </div>

      {needsProfileData && (
        <div className="general-report-alert">
          Preencha sexo/idade/atividade no Diário Alimentar para liberar as
          estimativas.
        </div>
      )}

      <div className="general-report-grid">
        <MetricCard
          title="IMC"
          value={formatNumber(bmiValue, 1)}
          unit=""
          statusText={bmiStatus.statusText}
          statusType={bmiStatus.statusType}
          markerPercent={bmiStatus.markerPercent}
          rangeLabels={{ min: '14', max: '40' }}
          subtitle={bmiValue ? `Faixa: ${bmiLabel}` : ''}
        />
        <MetricCard
          title="TMB"
          value={formatNumber(bmrValue, 0)}
          unit="kcal"
          statusText={bmrStatus.statusText}
          statusType={bmrStatus.statusType}
          markerPercent={bmrStatus.markerPercent}
          rangeLabels={{ min: '1000', max: '2500' }}
          subtitle="Metabolismo basal"
        />
        <MetricCard
          title="TDEE"
          value={formatNumber(tdeeValue, 0)}
          unit="kcal"
          statusText={tdeeStatus.statusText}
          statusType={tdeeStatus.statusType}
          markerPercent={tdeeStatus.markerPercent}
          rangeLabels={{ min: '1400', max: '3500' }}
          subtitle="Gasto diário estimado"
        />
        <MetricCard
          title="Gordura corporal"
          value={formatNumber(bodyFatValue, 1)}
          unit="%"
          statusText={bodyFatStatus.statusText}
          statusType={bodyFatStatus.statusType}
          markerPercent={bodyFatStatus.markerPercent}
          rangeLabels={{ min: '5', max: '45' }}
          subtitle="Estimado"
        />
        <MetricCard
          title="Massa gorda"
          value={formatNumber(fatMass, 1)}
          unit="kg"
          statusText={fatMassStatus.statusText}
          statusType={fatMassStatus.statusType}
          markerPercent={fatMassStatus.markerPercent}
          rangeLabels={{ min: '0', max: '80' }}
          subtitle="Derivado"
        />
        <MetricCard
          title="Massa magra"
          value={formatNumber(leanMass, 1)}
          unit="kg"
          statusText={leanMassStatus.statusText}
          statusType={leanMassStatus.statusType}
          markerPercent={leanMassStatus.markerPercent}
          rangeLabels={{ min: '20', max: '120' }}
          subtitle="Derivado"
        />
      </div>
    </div>
  );
}

export default GeneralReport;
