import React, { useMemo, useState } from 'react';
import {
  activityMultiplier,
  calcBMI,
  calcBMR_MifflinStJeor,
  calcBodyFatDeurenberg,
} from '../utils/generalReportMetrics';
import { generalReportRanges } from '../services/generalReportRanges';
import MetricGauge from './MetricGauge';

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
  subtitle,
  gaugeProps,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="general-report-card">
      <div className="general-report-card-header">
        <div>
          <h5 className="title" style={{ margin: 0 }}>
            {title}
          </h5>
          {subtitle && <span className="muted">{subtitle}</span>}
        </div>
        <button
          type="button"
          className="metric-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          <span className={`metric-toggle-icon ${expanded ? 'open' : ''}`}>
            ▾
          </span>
        </button>
      </div>
      <div className="general-report-value">
        {value}
        {unit && <span className="general-report-unit">{unit}</span>}
      </div>
      <MetricGauge {...gaugeProps} showDetails={expanded} />
    </div>
  );
};

function GeneralReport({ body, weightHistory, profileLoading = false }) {
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

  const needsProfileData = !sex || !age || !activityLevel;
  const showProfileBanner = !profileLoading && needsProfileData;

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

      {showProfileBanner && (
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
          subtitle="Índice de massa corporal"
          gaugeProps={{
            value: bmiValue,
            ...generalReportRanges.bmi,
            showTicks: [18.5, 24.9],
          }}
        />
        <MetricCard
          title="TMB"
          value={formatNumber(bmrValue, 0)}
          unit="kcal"
          subtitle="Metabolismo basal"
          gaugeProps={{
            value: bmrValue,
            ...generalReportRanges.bmr,
          }}
        />
        <MetricCard
          title="TDEE"
          value={formatNumber(tdeeValue, 0)}
          unit="kcal"
          subtitle="Gasto diário estimado"
          gaugeProps={{
            value: tdeeValue,
            ...generalReportRanges.tdee,
          }}
        />
        <MetricCard
          title="Gordura corporal"
          value={formatNumber(bodyFatValue, 1)}
          unit="%"
          subtitle="Estimado"
          gaugeProps={{
            value: bodyFatValue,
            ...generalReportRanges.bodyFat,
          }}
        />
        <MetricCard
          title="Massa gorda"
          value={formatNumber(fatMass, 1)}
          unit="kg"
          subtitle="Derivado"
          gaugeProps={{
            value: fatMass,
            ...generalReportRanges.fatMass,
          }}
        />
        <MetricCard
          title="Massa magra"
          value={formatNumber(leanMass, 1)}
          unit="kg"
          subtitle="Derivado"
          gaugeProps={{
            value: leanMass,
            ...generalReportRanges.leanMass,
          }}
        />
      </div>
    </div>
  );
}

export default GeneralReport;
