const buildRange = (label, from, to, tone) => ({
  label,
  from,
  to,
  tone,
});

export const generalReportRanges = {
  bmi: {
    min: 14,
    max: 40,
    ranges: [
      buildRange('Insuficiente', 14, 18.4, 'bad'),
      buildRange('Normal', 18.5, 24.9, 'ok'),
      buildRange('Elevado', 25, 29.9, 'great'),
    ],
    description: 'Referência visual do IMC com base no valor atual.',
  },
  bmr: {
    min: 1000,
    max: 2500,
    ranges: [
      buildRange('Baixa', 1000, 1499, 'bad'),
      buildRange('Referência', 1500, 2099, 'ok'),
      buildRange('Alta', 2100, 2500, 'great'),
    ],
    description: 'Estimativa do metabolismo basal usando seus dados atuais.',
  },
  tdee: {
    min: 1400,
    max: 3500,
    ranges: [
      buildRange('Baixa', 1400, 2099, 'bad'),
      buildRange('Referência', 2100, 2799, 'ok'),
      buildRange('Alta', 2800, 3500, 'great'),
    ],
    description: 'Faixa de gasto diário estimado conforme sua rotina.',
  },
  bodyFat: {
    min: 5,
    max: 45,
    ranges: [
      buildRange('Insuficiente', 5, 13, 'bad'),
      buildRange('Normal', 14, 24, 'ok'),
      buildRange('Ótimo', 25, 45, 'great'),
    ],
    description: 'Estimativa visual de gordura corporal (não substitui avaliação clínica).',
  },
  fatMass: {
    min: 0,
    max: 80,
    ranges: [
      buildRange('Insuficiente', 0, 19, 'bad'),
      buildRange('Normal', 20, 39, 'ok'),
      buildRange('Ótimo', 40, 80, 'great'),
    ],
    description: 'Massa gorda derivada do peso e percentual estimado.',
  },
  leanMass: {
    min: 20,
    max: 120,
    ranges: [
      buildRange('Insuficiente', 20, 59, 'bad'),
      buildRange('Normal', 60, 89, 'ok'),
      buildRange('Ótimo', 90, 120, 'great'),
    ],
    description: 'Massa magra derivada do peso atual estimado.',
  },
};
