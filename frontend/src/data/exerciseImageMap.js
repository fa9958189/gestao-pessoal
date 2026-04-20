import getExerciseGif from '../utils/getExerciseGif';

export const exerciseImageMap = {
  biceps: {
    'Rosca direta com halter': getExerciseGif('biceps', 'Rosca direta com halter'),
    'Rosca concentrada': getExerciseGif('biceps', 'Rosca concentrada'),
    'Rosca inclinada': getExerciseGif('biceps', 'Rosca inclinada'),
    'Rosca Scott': getExerciseGif('biceps', 'Rosca Scott'),
    'Rosca martelo': getExerciseGif('biceps', 'Rosca martelo'),
  },
  costas: {
    'Pulley costas': getExerciseGif('costas', 'Pulley costas'),
    'Remada baixa': getExerciseGif('costas', 'Remada baixa'),
    'Remada serrote': getExerciseGif('costas', 'Remada serrote'),
    'Voador invertido': getExerciseGif('costas', 'Voador invertido'),
  },
};
