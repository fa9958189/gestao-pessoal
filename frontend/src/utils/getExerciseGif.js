const MUSCLE_FOLDER_ALIASES = {
  ombros: 'ombro',
  pernas: 'Quadríceps',
  posterior_coxa: 'posterior de coxa',
  posterior_de_coxa: 'posterior de coxa',
  gluteos: 'gluteo',
};

const EXERCISE_FILE_ALIASES = {
  'Abdominal reto': 'Abdominal reto (tradicional)',
  'Extensão tríceps deitado': 'Extensao triceps deitado',
  'Panturrilha': 'panturrilha 1',
  'Máquina adutora externa': 'Máquina Adutora Externa',
  'Elevação pélvica com peso': 'Elevação pélvica com peso',
};

export function getExerciseGif(muscle, exercise) {
  if (!muscle || !exercise) return null;

  const folder = MUSCLE_FOLDER_ALIASES[muscle] || muscle;
  const fileName = EXERCISE_FILE_ALIASES[exercise] || exercise;

  try {
    return new URL(
      `../assets/exercise/${folder}/${fileName}.gif`,
      import.meta.url
    ).href;
  } catch {
    return null;
  }
}
