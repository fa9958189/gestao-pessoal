import React, { useEffect, useMemo, useState } from 'react';
import {
  activityMultiplier,
  calcBMI,
  calcBMR_MifflinStJeor,
  calcBodyFatDeurenberg,
} from '../utils/generalReportMetrics';
import { generalReportRanges } from '../services/generalReportRanges';
import { loadProfile, saveProfile } from '../services/foodDiaryProfile';
import MetricGauge from './MetricGauge';

const normalizeSexForUi = (value) => {
  if (value == null || value === '') return '';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'masculino') return 'Masculino';
  if (normalized === 'feminino') return 'Feminino';
  return value;
};

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

const defaultProfile = {
  sex: '',
  age: '',
  activityLevel: '',
};

function GeneralReport({ body, weightHistory, userId, supabase }) {
  const [profile, setProfile] = useState(defaultProfile);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfileData = async () => {
      if (!userId || !supabase) {
        if (isMounted) {
          setProfileLoading(false);
        }
        return;
      }

      try {
        setProfileLoading(true);
        const loadedProfile = await loadProfile({ supabase, userId });
        if (!isMounted) return;
        setProfile({
          sex: normalizeSexForUi(loadedProfile?.sex),
          age:
            loadedProfile?.age != null
              ? String(loadedProfile.age)
              : '',
          activityLevel: loadedProfile?.activityLevel ?? '',
        });
      } catch (error) {
        console.warn('Falha ao carregar perfil do relatório geral', error);
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    };

    loadProfileData();

    return () => {
      isMounted = false;
    };
  }, [supabase, userId]);

  const handleProfileChange = async (field, value) => {
    const nextProfile = {
      ...profile,
      [field]: value,
    };

    setProfile(nextProfile);

    if (!userId || !supabase) return;

    try {
      const payload = { supabase, userId };
      if (field === 'sex') {
        payload.sex = value;
      }
      if (field === 'activityLevel') {
        payload.activityLevel = value;
      }
      if (field === 'age') {
        const normalizedAge =
          value === '' ? null : Number.parseInt(value, 10);
        payload.age = Number.isFinite(normalizedAge) ? normalizedAge : null;
      }

      await saveProfile(payload);
    } catch (error) {
      console.error('Falha ao salvar perfil do relatório geral', error);
    }
  };

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
  const sex = profile.sex || '';
  const age = profile.age ? Number(profile.age) : null;
  const activityLevel = profile.activityLevel || '';

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
          Preencha sexo/idade/atividade aqui no Relatório Geral para liberar as
          estimativas.
        </div>
      )}

      <div className="food-diary-summary-card">
        <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
          Perfil para estimativas
        </h5>
        <div className="field">
          <label>Sexo</label>
          <select
            value={profile.sex}
            onChange={(event) =>
              handleProfileChange('sex', event.target.value)
            }
          >
            <option value="">Selecione</option>
            <option value="Masculino">Masculino</option>
            <option value="Feminino">Feminino</option>
          </select>
        </div>
        <div className="field">
          <label>Idade</label>
          <input
            type="number"
            min="0"
            step="1"
            value={profile.age}
            onChange={(event) =>
              handleProfileChange('age', event.target.value)
            }
          />
        </div>
        <div className="field">
          <label>Nível de atividade</label>
          <select
            value={profile.activityLevel}
            onChange={(event) =>
              handleProfileChange('activityLevel', event.target.value)
            }
          >
            <option value="">Selecione</option>
            <option value="sedentário">Sedentário</option>
            <option value="levemente ativo">Levemente ativo</option>
            <option value="moderadamente ativo">Moderadamente ativo</option>
            <option value="ativo">Ativo</option>
            <option value="muito ativo">Muito ativo</option>
          </select>
        </div>
      </div>

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
