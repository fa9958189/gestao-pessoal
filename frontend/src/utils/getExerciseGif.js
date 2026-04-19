export function getExerciseGif(muscle, exerciseName) {
  if (!muscle || !exerciseName) return null;

  const normalize = (text) => text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const muscleMap = {
    ombros: 'ombro',
    ombro: 'ombro',
    costas: 'costas',
    peito: 'peito',
    biceps: 'biceps',
    bíceps: 'biceps',
    triceps: 'triceps',
    tríceps: 'triceps',
    abdomen: 'abdomen',
    abdômen: 'abdomen',
    quadriceps: 'Quadríceps',
    panturrilha: 'panturrilha',
    'posterior de coxa': 'posterior de coxa',
    gluteos: 'gluteo',
    glúteos: 'gluteo',
  };

  const normalizedMuscle = muscleMap[normalize(muscle)] || normalize(muscle);
  const normalizedName = exerciseName.trim();

  return `/assets/exercise/${normalizedMuscle}/${normalizedName}.gif`;
}
