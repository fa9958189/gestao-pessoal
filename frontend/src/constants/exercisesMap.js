const EXERCISE_FOLDER_BY_MUSCLE = {
  peito: 'peito',
  costas: 'costas',
  ombros: 'ombro',
  biceps: 'biceps',
  triceps: 'triceps',
  abdomen: 'abdomen',
  pernas: 'Quadríceps',
  quadriceps: 'Quadríceps',
  posterior_coxa: 'posterior de coxa',
  posterior: 'posterior de coxa',
  gluteos: 'gluteo',
  panturrilha: 'panturrilha',
};

export const EXERCISES_BY_MUSCLE = {
  peito: [
    'Supino reto com barra',
    'Supino inclinado com halteres',
    'Voador ou peck deck',
    'Crossover com pegada alta',
  ],
  costas: [
    'Pulley costas',
    'Remada baixa',
    'Remada serrote',
    'Voador invertido',
  ],
  ombros: [
    'Arnold press',
    'Crucifixo inverso',
    'Elevação lateral',
    'Elevação frontal',
  ],
  biceps: [
    'bíceps',
    'Rosca concentrada',
    'Rosca inclinada',
    'Rosca martelo',
    'Rosca Scott',
  ],
  triceps: [
    'Extensao triceps deitado',
    'Mergulho na máquina',
    'Polia alta com corda',
    'Tríceps coice',
  ],
  abdomen: [
    'Abdominal infra nas paralelas',
    'Abdominal na máquina',
    'Abdominal na polia',
    'Abdominal reto (tradicional)',
  ],
  pernas: [
    'Agachamento búlgaro',
    'Agachamento hack',
    'Cadeira extensora',
    'Leg press',
    'Panturrilha Sentado na Máquina',
  ],
  posterior_coxa: [
    'Levantamento terra',
    'Cadeira flexora',
    'Flexora deitada',
    'Stiff',
  ],
  gluteos: [
    'Elevação pélvica com peso',
    'Levantamento terra',
    'Máquina Adutora Externa',
    'Stiff',
  ],
  panturrilha: ['panturrilha 1'],
};

export const formatFileName = (name = '') => (
  String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
);

const EXERCISE_GIFS = import.meta.glob('../assets/exercise/*/*.gif', {
  eager: true,
  import: 'default',
});

const EXERCISE_GIF_INDEX = Object.entries(EXERCISE_GIFS).reduce((acc, [path, src]) => {
  const match = path.match(/\.\.\/assets\/exercise\/([^/]+)\/([^/]+)\.gif$/i);
  if (!match) return acc;

  const [, folder, exerciseFileName] = match;
  acc[`${formatFileName(folder)}/${formatFileName(exerciseFileName)}`] = src;
  return acc;
}, {});

export const getExerciseGif = (muscle, exerciseName) => {
  const folder = EXERCISE_FOLDER_BY_MUSCLE[muscle] || muscle;
  const key = `${formatFileName(folder)}/${formatFileName(exerciseName)}`;

  return EXERCISE_GIF_INDEX[key] || null;
};
