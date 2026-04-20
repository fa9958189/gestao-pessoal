import { normalizeKey } from './normalize';

const MUSCLE_FOLDER_ALIASES = {
  ombros: 'ombro',
  ombro: 'ombro',
  pernas: 'Quadríceps',
  quadriceps: 'Quadríceps',
  quadricep: 'Quadríceps',
  posterior_coxa: 'posterior de coxa',
  posterior_de_coxa: 'posterior de coxa',
  posterior: 'posterior de coxa',
  gluteos: 'gluteo',
  gluteo: 'gluteo',
  'ante braco': 'ante braco',
};

const EXERCISE_FILE_ALIASES = {
  'Abdominal reto': 'Abdominal reto (tradicional)',
  'Extensão de tríceps deitado': 'Extensao triceps deitado',
  'Extensão tríceps deitado': 'Extensao triceps deitado',
  Panturrilha: 'panturrilha1',
  'Máquina adutora externa': 'Máquina Adutora Externa',
  'Elevação pélvica com peso': 'Elevação pélvica com peso',
  'Elevação de quadril com peso': 'Elevação pélvica com peso',
  'Panturrilha sentado na máquina': 'Panturrilha Sentado na Máquina',
  'Rosca de Punho': 'RoscadePunho',
  'Rosca de Punho Invertida': 'RoscadePunhoInvertida',
};

export function normalizeFileName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const resolveMuscleFolder = (muscle) => {
  const normalizedMuscle = normalizeFileName(normalizeKey(muscle));
  if (normalizedMuscle.includes('ante') && normalizedMuscle.includes('braco')) {
    return 'ante braco';
  }

  for (const [alias, folder] of Object.entries(MUSCLE_FOLDER_ALIASES)) {
    if (normalizeFileName(alias) === normalizedMuscle) return folder;
  }

  return muscle;
};

const resolveExerciseName = (exercise) => {
  const normalizedExercise = normalizeFileName(exercise);

  for (const [alias, canonical] of Object.entries(EXERCISE_FILE_ALIASES)) {
    if (normalizeFileName(alias) === normalizedExercise) return canonical;
  }

  return exercise;
};

export function getExerciseGif(muscle, exercise) {
  if (!muscle || !exercise) return null;

  const folder = resolveMuscleFolder(muscle);
  const exerciseName = resolveExerciseName(exercise);
  const fileName = normalizeFileName(exerciseName);

  try {
    return new URL(`../assets/exercise/${folder}/${fileName}.gif`, import.meta.url).href;
  } catch {
    try {
      return new URL(`../assets/exercise/${folder}/${exerciseName}.gif`, import.meta.url).href;
    } catch {
      return null;
    }
  }
}

export default getExerciseGif;
