import { exerciseImageMap } from '../data/exerciseImageMap';

export function getExerciseGif(muscle, exerciseName) {
  if (!muscle || !exerciseName) return null;

  const normalize = (text) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const normalizedMuscle = normalize(muscle);
  const normalizedName = exerciseName.trim();

  const muscleData = exerciseImageMap[normalizedMuscle];

  if (!muscleData) return null;

  return muscleData[normalizedName] || null;
}
