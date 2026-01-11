export const clampValue = (value, min, max) =>
  Math.min(Math.max(value, min), max);

export const calcBMI = (weightKg, heightCm) => {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  if (!weight || !height) return null;
  return weight / Math.pow(height / 100, 2);
};

export const calcBMR_MifflinStJeor = ({ sex, age, weightKg, heightCm }) => {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  const ageNumber = Number(age);
  if (!weight || !height || !ageNumber || !sex) return null;
  const base = 10 * weight + 6.25 * height - 5 * ageNumber;
  return sex === 'Masculino' ? base + 5 : base - 161;
};

export const activityMultiplier = (level) => {
  switch (level) {
    case 'Sedentário':
      return 1.2;
    case 'Leve':
      return 1.375;
    case 'Moderado':
      return 1.55;
    case 'Alto':
      return 1.725;
    case 'Muito alto':
      return 1.9;
    default:
      return null;
  }
};

export const calcBodyFatDeurenberg = ({ sex, age, bmi }) => {
  const bmiValue = Number(bmi);
  const ageNumber = Number(age);
  if (!bmiValue || !ageNumber || !sex) return null;
  const sexFactor = sex === 'Masculino' ? 1 : 0;
  return 1.2 * bmiValue + 0.23 * ageNumber - 10.8 * sexFactor - 5.4;
};

export const buildMetricStatus = ({
  value,
  min,
  max,
  targetMin,
  targetMax,
  alwaysReference = false,
}) => {
  if (value == null || Number.isNaN(value)) {
    return {
      statusText: 'Referência',
      statusType: 'reference',
      markerPercent: 0,
    };
  }

  const markerPercent = clampValue((value - min) / (max - min), 0, 1);

  if (alwaysReference || targetMin == null || targetMax == null) {
    return { statusText: 'Referência', statusType: 'reference', markerPercent };
  }

  const achieved = value >= targetMin && value <= targetMax;
  return {
    statusText: achieved ? 'Objetivo atingido' : 'Objetivo não atingido',
    statusType: achieved ? 'success' : 'danger',
    markerPercent,
  };
};
