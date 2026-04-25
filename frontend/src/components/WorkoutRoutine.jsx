import React, { useEffect, useMemo, useState } from 'react';
import PeitoImg from '../assets/muscles/Peito.png';
import CostasImg from '../assets/muscles/Costas.png';
import OmbrosImg from '../assets/muscles/Ombros.png';
import BicepsImg from '../assets/muscles/Biceps.png';
import TricepsImg from '../assets/muscles/Triceps.png';
import AbdomenImg from '../assets/muscles/Abdomen.png';
import QuadricepsImg from '../assets/muscles/quadriceps.png';
import GluteosImg from '../assets/muscles/Gluteos.png';
import PanturrilhaImg from '../assets/muscles/panturrilha.png';
import PosteriorCoxaImg from '../assets/muscles/posterior de coxa.png';
import NatacaoImg from '../assets/muscles/Natacao.png';
import VoleiImg from '../assets/muscles/Volei.png';
import BoxeImg from '../assets/muscles/Boxe.png';
import JiuJitsuImg from '../assets/muscles/Jiu-jitsu.png';
import FutebolImg from '../assets/muscles/Futebol.png';
import BeachTennisImg from '../assets/muscles/beach tennis.png';
import BicicletaImg from '../assets/muscles/bicicleta.png';
import CorridaAoArLivreImg from '../assets/muscles/Corrida ao ar livre.png';
import EscadaImg from '../assets/muscles/escada.png';
import EsteiraImg from '../assets/muscles/esteira.png';
import ProgressRing from './charts/ProgressRing.jsx';
import GoalBar from './charts/GoalBar.jsx';
import WeightLineChart from './charts/WeightLineChart.jsx';
import MuscleDonut from './charts/MuscleDonut.jsx';
import TrainingHeatmap from './charts/TrainingHeatmap.jsx';
import MiniStats from './charts/MiniStats.jsx';
import { exercises } from '../data/exercises.js';
import getExerciseGif from '../utils/getExerciseGif';
import { normalizeKey } from '../utils/normalize';

const muscleGroups = [
  { id: 'peito', name: 'Peito', image: PeitoImg },
  { id: 'costas', name: 'Costas', image: CostasImg },
  { id: 'ombros', name: 'Ombros', image: OmbrosImg },
  { id: 'biceps', name: 'Bíceps', image: BicepsImg },
  { id: 'triceps', name: 'Tríceps', image: TricepsImg },
  { id: 'abdomen', name: 'Abdômen', image: AbdomenImg },
  { id: 'pernas', name: 'Quadríceps', image: QuadricepsImg },
  { id: 'panturrilha', name: 'Panturrilha', image: PanturrilhaImg },
  { id: 'posterior_coxa', name: 'Posterior de Coxa', image: PosteriorCoxaImg },
  { id: 'gluteos', name: 'Glúteos', image: GluteosImg },
  { id: 'ante braco', name: 'Antebraço', image: new URL('../assets/muscles/Antebraco.png', import.meta.url).href },

  // Esportes
  { id: 'natacao', name: 'Natação', image: NatacaoImg },
  { id: 'volei', name: 'Vôlei', image: VoleiImg },
  { id: 'boxe', name: 'Boxe', image: BoxeImg },
  { id: 'jiujitsu', name: 'Jiu-Jitsu', image: JiuJitsuImg },
  { id: 'futebol', name: 'Futebol', image: FutebolImg },
  { id: 'beachtennis', name: 'Beach Tennis', image: BeachTennisImg },
  { id: 'bicicleta', name: 'Bicicleta', image: BicicletaImg },
  { id: 'corrida_ao_ar_livre', name: 'Corrida ao ar livre', image: CorridaAoArLivreImg },
  { id: 'escada', name: 'Escada', image: EscadaImg },
  { id: 'esteira', name: 'Esteira', image: EsteiraImg },
];

const SPORT_IDS = new Set(['natacao', 'volei', 'boxe', 'jiujitsu', 'futebol', 'beachtennis', 'bicicleta', 'corrida_ao_ar_livre', 'escada', 'esteira']);

const MUSCLE_GROUPS = muscleGroups.filter(({ id }) => !SPORT_IDS.has(id)).map(({ id, name, image }) => ({
  value: id,
  label: name,
  image
}));

const SPORTS = muscleGroups.filter(({ id }) => SPORT_IDS.has(id)).map(({ id, name, image }) => ({
  value: id,
  label: name,
  image
}));

const CARDIO_ACTIVITIES = SPORTS.filter((item) => (
  ['bicicleta', 'corrida_ao_ar_livre', 'escada', 'esteira'].includes(item.value)
));

const MUSCLE_INFO = {
  peito: {
    title: 'Peito',
    description:
      'Grupo muscular responsável por empurrar carga à frente do corpo, muito usado em supino, flexões e movimentos de empurrar no dia a dia.',
    exercises: [
      'Supino inclinado com halteres',
      'Supino reto com barra',
      'Crossover com pegada alta',
      'Voador ou peck deck',
    ],
  },
  biceps: {
    title: 'Bíceps',
    description:
      'Músculo da parte da frente do braço, responsável por flexionar o cotovelo. Muito ativado em roscas e movimentos de puxar.',
    exercises: [
      'Rosca direta com halter',
      'Rosca concentrada',
      'Rosca inclinada',
      'Rosca martelo',
      'Rosca Scott',
    ],
  },
  costas: {
    title: 'Costas',
    description:
      'Grupo muscular importante para postura, estabilidade e movimentos de puxar, muito trabalhado em remadas, puxadas e exercícios de tração.',
    exercises: [
      'Pulley costas',
      'Remada baixa',
      'Remada serrote',
      'Voador invertido',
    ],
  },
  ombros: {
    title: 'Ombros',
    description:
      'Envolvidos em praticamente todos os movimentos de braço. Fortalecer ombros ajuda na estabilidade e evita lesões em outros exercícios.',
    exercises: [
      'Arnold press',
      'Crucifixo inverso',
      'Elevação frontal',
      'Elevação lateral',
    ],
  },
  triceps: {
    title: 'Tríceps',
    description:
      'Músculo responsável pela extensão do cotovelo, muito ativado em empurrões, mergulho na máquina, polia alta e movimentos de coice.',
    exercises: [
      'Extensão de tríceps deitado',
      'Mergulho na máquina',
      'Polia alta com corda',
      'Tríceps coice',
    ],
  },
  abdomen: {
    title: 'Abdômen',
    description:
      'Grupo muscular responsável pela estabilização do tronco e postura. Muito ativado em exercícios de flexão do tronco, máquinas, polias e movimentos de suspensão.',
    exercises: [
      'Abdominal infra nas paralelas',
      'Abdominal na máquina',
      'Abdominal na polia',
      'Abdominal reto (tradicional)',
    ],
  },
  quadriceps: {
    title: 'Quadríceps',
    description:
      'Grupo muscular da parte da frente da coxa, muito ativado em agachamentos, leg press, cadeira extensora e movimentos de extensão do joelho.',
    exercises: [
      'Agachamento búlgaro',
      'Agachamento hack',
      'Cadeira extensora',
      'Leg press',
    ],
  },
  panturrilha: {
    title: 'Panturrilha',
    description:
      'Fundamental para estabilidade do tornozelo, impulsão em corridas, subidas e saltos. Trabalhada em elevações em pé ou sentado.',
    exercises: [
      'Elevação de panturrilha em pé',
      'Panturrilha Sentado na Máquina',
    ],
  },
  posterior_coxa: {
    title: 'Posterior de Coxa',
    description:
      'Grupo muscular responsável por flexão do joelho e extensão do quadril. Muito acionado em levantamento terra, stiff e exercícios de flexora.',
    exercises: [
      'Levantamento terra',
      'Cadeira flexora',
      'Flexora deitada',
      'Stiff',
    ],
  },
  gluteos: {
    title: 'Glúteos',
    description:
      'Músculos fortes que estabilizam o quadril e ajudam em agachamentos, subidas, corridas e levantamento terra. Importantes para força, potência e proteção da coluna.',
    exercises: [
      'Elevação de quadril com peso',
      'Levantamento terra',
      'Abdução de quadril na máquina',
      'Stiff',
    ],
  },
  'ante braco': {
    title: 'Antebraço',
    description:
      'Região que auxilia na força de pegada e na estabilidade de punhos e cotovelos, muito exigida em exercícios de tração e roscas.',
    exercises: [
      'Rosca martelo',
      'Rosca de Punho',
      'Rosca de Punho Invertida',
    ],
  },
};

const SPORT_INFO = {
  natacao: {
    title: 'Natação',
    description:
      'Exercício de baixo impacto para articulações, ótimo para condicionamento cardiorrespiratório, fortalecimento geral e controle de peso.'
  },
  volei: {
    title: 'Vôlei',
    description:
      'Trabalha impulsão, coordenação e agilidade, além de fortalecer pernas, ombros e core com saltos e movimentos rápidos.'
  },
  boxe: {
    title: 'Boxe',
    description:
      'Atividade intensa que mistura condicionamento, velocidade e força. Queima muitas calorias e melhora reflexos e coordenação.'
  },
  jiujitsu: {
    title: 'Jiu-Jitsu',
    description:
      'Arte marcial focada em alavancas e controle no solo. Desenvolve força, resistência, flexibilidade e raciocínio estratégico.'
  },
  futebol: {
    title: 'Futebol',
    description:
      'Esporte completo para pernas e condicionamento. Trabalha corrida, mudanças rápidas de direção e coordenação com a bola.'
  },
  beachtennis: {
    title: 'Beach Tennis',
    description:
      'Esporte de areia que exige pernas, core e braços. Ótimo para resistência, agilidade e queima calórica com baixo impacto.'
  },
};

const getMuscleGroupByLabel = (label) => {
  const normalized = normalizeKey(label);
  return MUSCLE_GROUPS.find(
    (group) =>
      normalizeKey(group.label) === normalized ||
      normalizeKey(group.value) === normalized
  );
};

const getSportByLabel = (label) => {
  const normalized = normalizeKey(label);
  return SPORTS.find(
    (sport) => normalizeKey(sport.label) === normalized || normalizeKey(sport.value) === normalized
  );
};

const getExercisesKey = (muscleGroup) => {
  const normalized = normalizeKey(muscleGroup);

  if (normalized === 'ombros' || normalized === 'ombro') return 'ombro';
  if (normalized === 'gluteos' || normalized === 'gluteo') return 'gluteo';
  if (normalized === 'posterior de coxa' || normalized === 'posterior_coxa' || normalized === 'posterior' || normalized === 'posterior_de_coxa') return 'posterior_de_coxa';
  if (normalized === 'quadriceps' || normalized === 'quadricep') return 'quadriceps';
  if (normalized === 'pernas') return 'quadriceps';
  if (normalized === 'abdomen') return 'abdomen';
  if (normalized === 'biceps') return 'biceps';
  if (normalized === 'costas') return 'costas';
  if (normalized === 'peito') return 'peito';
  if (normalized === 'triceps') return 'triceps';
  if (normalized === 'panturrilha') return 'panturrilha';
  if (
    normalized.includes('ante')
    && normalized.includes('braco')
  ) return 'ante braco';

  return normalized.replace(/\s+/g, '_');
};

const normalizeGroupedExercisesPayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((acc, [groupKey, exerciseList]) => {
    const normalizedKey = getExercisesKey(groupKey);
    const normalizedExercises = Array.isArray(exerciseList)
      ? exerciseList.filter(Boolean)
      : [];

    if (!normalizedKey || normalizedExercises.length === 0) return acc;

    return {
      ...acc,
      [normalizedKey]: normalizedExercises,
    };
  }, {});
};

const formatGroupName = (groupKey, muscleMap = {}) => {
  const normalizedKey = getExercisesKey(groupKey);
  const directLabel = muscleMap[groupKey]?.label || muscleMap[normalizedKey]?.label;
  if (directLabel) return directLabel;

  const fallbackLabelMap = {
    quadriceps: 'Quadríceps',
    gluteo: 'Glúteo',
    ombro: 'Ombro',
    posterior_de_coxa: 'Posterior de Coxa',
    panturrilha: 'Panturrilha',
    peito: 'Peito',
    costas: 'Costas',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    abdomen: 'Abdômen',
    'ante braco': 'Antebraço',
  };

  return fallbackLabelMap[normalizedKey] || groupKey;
};

const WEEK_DAYS = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo'
];

const WEEKDAY_NAME = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
  7: 'Domingo',
};

const defaultSchedule = WEEK_DAYS.map((day) => ({
  day,
  workout_id: '',
  time: '',
  reminder: false
}));

const QUICK_MUSCLE_CONFIG_OPTIONS = ['3x10', '4x12', '3x15'];
const DEFAULT_MUSCLE_CONFIG = '3x10';


function getLocalDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseWorkoutDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatWorkoutDatePtBr(value) {
  const d = parseWorkoutDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('pt-BR');
}

const getLocalDateOnlyFromDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatExerciseResume = (exercise) => {
  const base = `${exercise.name || 'Exercício'} ${exercise.sets || 0}x${exercise.reps || 0}`;
  const weightPart = exercise.weight ? ` – ${exercise.weight}kg` : '';
  return `${base}${weightPart}`;
};

const normalizeExerciseDisplayName = (exercise) => {
  const value = String(exercise || '').trim();

  if (['Bíceps', 'Biceps', 'bíceps', 'biceps'].includes(value)) {
    return 'Rosca Direta com Halter';
  }

  if (value === 'RoscadePunho') return 'Rosca de Punho';
  if (value === 'RoscadePunhoInvertida') return 'Rosca de Punho Invertida';

  return value;
};

const formatMuscleConfigValue = (entry) => {
  if (!entry || typeof entry !== 'object') return DEFAULT_MUSCLE_CONFIG;
  if (entry.type === 'custom') {
    const series = Number(entry.series) || 0;
    const reps = Number(entry.reps) || 0;
    return series > 0 && reps > 0 ? `${series}x${reps}` : DEFAULT_MUSCLE_CONFIG;
  }
  if (entry.type === 'preset' && entry.value) return entry.value;
  return DEFAULT_MUSCLE_CONFIG;
};

const parseMuscleConfigPayload = (input) => {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
};

const buildMuscleConfigState = (selectedMuscles = [], payload = []) => {
  const payloadMap = new Map(
    (Array.isArray(payload) ? payload : [])
      .filter((item) => item?.muscle)
      .map((item) => [String(item.muscle), item])
  );

  return selectedMuscles.reduce((acc, muscle) => {
    const rawEntry = payloadMap.get(muscle) || null;
    const raw = rawEntry?.config
      || (Number(rawEntry?.sets) > 0 && Number(rawEntry?.reps) > 0
        ? `${rawEntry.sets}x${rawEntry.reps}`
        : DEFAULT_MUSCLE_CONFIG);
    const [seriesRaw, repsRaw] = String(raw).split('x');
    const series = Number(seriesRaw);
    const reps = Number(repsRaw);
    if (
      Number.isFinite(series)
      && Number.isFinite(reps)
      && !QUICK_MUSCLE_CONFIG_OPTIONS.includes(raw)
    ) {
      return {
        ...acc,
        [muscle]: { type: 'custom', series, reps },
      };
    }

    return {
      ...acc,
      [muscle]: { type: 'preset', value: raw },
    };
  }, {});
};

const buildSelectedExercisesState = (selectedMuscles = [], payload = [], selectedMap = {}) => {
  const normalizedSelectedMap = normalizeGroupedExercisesPayload(selectedMap);
  const payloadMap = new Map(
    (Array.isArray(payload) ? payload : [])
      .filter((item) => item?.muscle)
      .map((item) => [getExercisesKey(item.muscle), Array.isArray(item.exercises) ? item.exercises : []])
  );

  return selectedMuscles.reduce((acc, muscle) => {
    const muscleKey = getExercisesKey(muscle);
    return {
      ...acc,
      [muscleKey]: Array.isArray(normalizedSelectedMap[muscleKey])
        ? normalizedSelectedMap[muscleKey]
        : (payloadMap.get(muscleKey) || []),
    };
  }, {});
};

const ViewWorkoutModal = ({
  open,
  workout,
  onClose,
  onCompleteToday,
  muscleMap,
  sportsMap,
}) => {
  // novo estado para o “detalhe” selecionado
  const [infoTarget, setInfoTarget] = useState(null);

  // Modal de visualização de treino
  if (!open || !workout) return null;

  const muscleGroups = Array.isArray(workout.muscleGroups) ? workout.muscleGroups : [];
  const sportsActivities = Array.isArray(workout.sportsActivities)
    ? workout.sportsActivities
    : [];
  const muscleConfigEntries = parseMuscleConfigPayload(workout.muscleConfig ?? workout.muscle_config);
  const muscleConfigMap = new Map(
    muscleConfigEntries
      .filter((item) => item?.muscle)
      .map((item) => [String(item.muscle), item])
  );
  const groupedExercises = normalizeGroupedExercisesPayload(
    workout.exercisesByGroup || workout.exercises || workout.exercicios || {}
  );
  const hasWorkoutExercisesPayload = Boolean(
    workout.exercises || workout.exercisesByGroup || workout.exercicios
  );
  const hasAnySelectedExercise = Object.keys(groupedExercises).some(
    (grupo) => groupedExercises[grupo]?.length > 0
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        className="workout-view-modal"
        style={{
          background: '#0f131c',
          borderRadius: 16,
          padding: 24,
          width: 'min(720px, 90vw)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Detalhes do treino</h4>
          <button
            className="ghost"
            onClick={() => {
              setInfoTarget(null);
              onClose();
            }}
          >
            Fechar
          </button>
        </div>

        <div className="sep" style={{ margin: '12px 0' }}></div>

        <section className="modal-body">
          <div className="workout-details-content">
            <div className="field">
              <label>Nome do treino</label>
              <div className="value" style={{ fontWeight: 600 }}>
                {workout.name || 'Treino sem nome'}
              </div>
            </div>

            <div className="field">
              <label>Grupos musculares</label>
              <div className="chips chips-with-image">
                {muscleGroups.length > 0 ? (
                  muscleGroups.map((mg) => {
                    const def = getMuscleGroupByLabel(mg) || muscleMap[mg];
                    const key = getExercisesKey(def?.value || mg);
                    const info = MUSCLE_INFO[key];

                    return (
                      <div
                        key={mg}
                        className="chip chip-with-image"
                        style={{ cursor: info ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (!info) return;
                          const selectedMuscleExercises = groupedExercises[getExercisesKey(key)] || [];
                          setInfoTarget({
                            type: 'muscle',
                            id: key,
                            label: def?.label || mg,
                            description: info.description,
                            exercises: selectedMuscleExercises,
                          });
                        }}
                      >
                        {def?.image && (
                          <img
                            src={def.image}
                            alt={def.label || mg}
                            className="chip-icon"
                          />
                        )}
                        <span>{def?.label || mg}</span>
                      </div>
                    );
                  })
                ) : (
                  <span className="muted">Nenhum grupo selecionado</span>
                )}
              </div>
            </div>

            <div className="field">
              <label>Esportes / atividades</label>
              <div className="chips chips-with-image">
                {sportsActivities.length > 0 ? (
                  sportsActivities.map((act) => {
                    const def = getSportByLabel(act) || sportsMap[act];
                    const key = (def?.value || act || '').toString().toLowerCase();
                    const info = SPORT_INFO[key];

                    return (
                      <div
                        key={act}
                        className="chip chip-with-image"
                        style={{ cursor: info ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (!info) return;
                          setInfoTarget({
                            type: 'sport',
                            id: key,
                            label: def?.label || act,
                            description: info.description,
                          });
                        }}
                      >
                        {def?.image && (
                          <img
                            src={def.image}
                            alt={def.label || act}
                            className="chip-icon"
                          />
                        )}
                        <span>{def?.label || act}</span>
                      </div>
                    );
                  })
                ) : (
                  <span className="muted">Nenhuma atividade selecionada</span>
                )}
              </div>
            </div>

            {muscleGroups.length > 0 && (
              <div className="field">
                <label>Exercícios por músculo</label>
                {!hasWorkoutExercisesPayload && (
                  <p className="muted" style={{ marginBottom: 8 }}>
                    Nenhum exercício selecionado
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {muscleGroups.map((group) => {
                    const normalizedGroup = getExercisesKey(group);
                    const exerciseList = groupedExercises[normalizedGroup] || [];
                    if (!exerciseList?.length) return null;
                    const configEntry = muscleConfigMap.get(group) || muscleConfigMap.get(normalizedGroup) || {};
                    const config = configEntry?.config
                      || (Number(configEntry?.sets) > 0 && Number(configEntry?.reps) > 0
                        ? `${configEntry.sets}x${configEntry.reps}`
                        : DEFAULT_MUSCLE_CONFIG);

                    return (
                      <div key={`${group}-exs`}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                          {formatGroupName(group, muscleMap)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {exerciseList.map((exercise) => (
                            <div
                              key={`${group}-${exercise}`}
                              style={{
                                background: '#0f172a',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                              }}
                            >
                              <span>{normalizeExerciseDisplayName(exercise)}</span>
                              <strong>{config}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!hasAnySelectedExercise && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Nenhum exercício selecionado.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {Array.isArray(workout.exercises) && workout.exercises.length > 0 && (
            <div className="field">
              <label>Exercícios</label>
              <ul className="exercise-list" style={{ paddingLeft: 18 }}>
                {workout.exercises.map((ex) => (
                  <li key={ex.id || ex.name} style={{ marginBottom: 6 }}>
                    <strong>{ex.name}</strong>{' '}
                    {ex.sets && ex.reps && (
                      <span>
                        {ex.sets} x {ex.reps}
                      </span>
                    )}
                    {typeof ex.weight === 'number' && <span> – {ex.weight} kg</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {infoTarget && (
            <div
              className="info-panel"
              style={{
                marginTop: 16,
                marginBottom: 24,
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#101522',
              }}
            >
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
              >
                <div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08 }}
                  >
                    {infoTarget.type === 'muscle'
                      ? 'Grupo muscular selecionado'
                      : 'Esporte / atividade selecionada'}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{infoTarget.label}</div>
                </div>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => setInfoTarget(null)}
                >
                  Fechar descrição
                </button>
              </div>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                {infoTarget.description}
              </p>
              {infoTarget.exercises && infoTarget.exercises.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  {infoTarget.exercises.map((exercise) => {
                    const displayExercise = normalizeExerciseDisplayName(exercise);
                    const gifSrc = getExerciseGif(infoTarget.id, displayExercise);

                    return (
                      <div key={exercise} style={{ marginBottom: '30px' }}>
                        <h3 style={{ marginBottom: '10px' }}>{displayExercise}</h3>
                        {gifSrc ? (
                          <img
                            src={gifSrc}
                            alt={displayExercise}
                            style={{ width: '100%', borderRadius: '12px' }}
                          />
                        ) : (
                          <div className="muted" style={{ marginBottom: 12 }}>
                            GIF deste exercício não encontrado.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="workout-timer-section">
            <div className="complete-today-wrapper" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="primary"
                onClick={() => onCompleteToday?.(workout)}
              >
                Concluir treino de hoje
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const WorkoutRoutine = ({
  pushToast,
  currentUserRole = '',
  currentUserIsAffiliate = false,
  currentAffiliateId = null
}) => {
  const API_URL = 'https://api.gestao-pessoal.com';
  const [treinoTab, setTreinoTab] = useState('treinos');
  const [etapaTreino, setEtapaTreino] = useState('tipo');
  const [openTreinoModal, setOpenTreinoModal] = useState(false);
  const [step, setStep] = useState(1);
  const [tipoTreino, setTipoTreino] = useState(null);
  const [selecionados, setSelecionados] = useState([]);
  const [nomeTreino, setNomeTreino] = useState('');
  const [muscleConfigs, setMuscleConfigs] = useState({});
  const [selectedExercises, setSelectedExercises] = useState({});
  const [previewExercise, setPreviewExercise] = useState(null);
  const [previewMuscle, setPreviewMuscle] = useState(null);
  const gif = getExerciseGif(previewMuscle, previewExercise);
  const [workoutForm, setWorkoutForm] = useState({
    id: null,
    name: '',
    muscleGroups: [],
    sportsActivities: [],
    exercises: [],
    muscleConfig: [],
    exercisesByGroup: {},
    exercicios: {},
  });
  const [routines, setRoutines] = useState([]);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(null);
  const [openWorkoutSelectDay, setOpenWorkoutSelectDay] = useState(null);
  const [userId, setUserId] = useState('');
  const [viewWorkout, setViewWorkout] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [historyRange, setHistoryRange] = useState({ from: '', to: '' });
  const [progress, setProgress] = useState({ totalSessions: 0, byMuscleGroup: {} });
  const [createReminder, setCreateReminder] = useState(false);
  const [sessionReminder, setSessionReminder] = useState(false);
  const [transferWorkoutModalOpen, setTransferWorkoutModalOpen] = useState(false);
  const [workoutToTransfer, setWorkoutToTransfer] = useState(null);
  const [transferUserSearch, setTransferUserSearch] = useState('');
  const [selectedTransferUser, setSelectedTransferUser] = useState(null);
  const [transferringWorkout, setTransferringWorkout] = useState(false);
  const [affiliateTransferUsers, setAffiliateTransferUsers] = useState([]);

  const muscleMap = useMemo(
    () =>
      MUSCLE_GROUPS.reduce(
        (acc, group) => ({
          ...acc,
          [group.value]: group,
        }),
        {}
      ),
    []
  );

  const progressStats = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return {
        daysTrained: 0,
        daysInMonth,
        mostPerformedWorkoutName: null,
        mostPerformedWorkoutCount: 0,
        mostWorkedMuscleKey: null,
        mostWorkedMuscleLabel: null,
        mostWorkedMuscleCount: 0,
        weeklySummary: [],
        bestWeekdayKey: null,
        bestWeekdayLabel: null,
        bestWeekdayCount: 0,
      };
    }

    // Filtrar sessões do mês atual
    const sessionsThisMonth = sessions.filter((session) => {
      if (!session.date) return false;
      const d = parseWorkoutDate(session.date);
      if (!d) return false;
      return d.getFullYear() === year && d.getMonth() === month;
    });

    // Dias treinados (dias únicos no mês)
    const uniqueDays = new Set(
      sessionsThisMonth
        .map((s) => parseWorkoutDate(s.date))
        .filter(Boolean)
        .map((date) => getLocalDateOnlyFromDate(date))
    );
    const daysTrained = uniqueDays.size;

    // Treino mais realizado (por nome)
    const workoutCount = {};
    sessionsThisMonth.forEach((s) => {
      if (!s.name) return;
      workoutCount[s.name] = (workoutCount[s.name] || 0) + 1;
    });

    let mostPerformedWorkoutName = null;
    let mostPerformedWorkoutCount = 0;
    Object.entries(workoutCount).forEach(([name, count]) => {
      if (count > mostPerformedWorkoutCount) {
        mostPerformedWorkoutCount = count;
        mostPerformedWorkoutName = name;
      }
    });

    // Músculo mais trabalhado (usa progress.byMuscleGroup e muscleMap)
    let mostWorkedMuscleKey = null;
    let mostWorkedMuscleLabel = null;
    let mostWorkedMuscleCount = 0;
    Object.entries(progress.byMuscleGroup || {}).forEach(([muscleKey, count]) => {
      if (count > mostWorkedMuscleCount) {
        mostWorkedMuscleCount = count;
        mostWorkedMuscleKey = muscleKey;
        mostWorkedMuscleLabel = muscleMap[muscleKey]?.label || muscleKey;
      }
    });

    // Evolução semanal (4 semanas no mês)
    const weeklyBuckets = [0, 0, 0, 0];
    sessionsThisMonth.forEach((s) => {
      if (!s.date) return;
      const d = parseWorkoutDate(s.date);
      if (!d) return;
      const dayOfMonth = d.getDate(); // 1..31
      const weekIndex = Math.min(Math.floor((dayOfMonth - 1) / 7), weeklyBuckets.length - 1);
      weeklyBuckets[weekIndex] += 1;
    });

    const weeklySummary = weeklyBuckets.map((count, index) => ({
      label: `Semana ${index + 1}`,
      count,
    }));

    // Melhor dia da semana
    const weekdayMap = {
      0: 'Domingo',
      1: 'Segunda-feira',
      2: 'Terça-feira',
      3: 'Quarta-feira',
      4: 'Quinta-feira',
      5: 'Sexta-feira',
      6: 'Sábado',
    };
    const weekdayCount = {};
    sessionsThisMonth.forEach((s) => {
      if (!s.date) return;
      const d = parseWorkoutDate(s.date);
      if (!d) return;
      const wd = d.getDay();
      weekdayCount[wd] = (weekdayCount[wd] || 0) + 1;
    });

    let bestWeekdayKey = null;
    let bestWeekdayLabel = null;
    let bestWeekdayCount = 0;
    Object.entries(weekdayCount).forEach(([wdKey, count]) => {
      const wdNum = Number(wdKey);
      if (count > bestWeekdayCount) {
        bestWeekdayCount = count;
        bestWeekdayKey = wdNum;
        bestWeekdayLabel = weekdayMap[wdNum] || '';
      }
    });

    return {
      daysTrained,
      daysInMonth,
      mostPerformedWorkoutName,
      mostPerformedWorkoutCount,
      mostWorkedMuscleKey,
      mostWorkedMuscleLabel,
      mostWorkedMuscleCount,
      weeklySummary,
      bestWeekdayKey,
      bestWeekdayLabel,
      bestWeekdayCount,
    };
  }, [sessions, progress, muscleMap]);

  const dailyTrainingCounts = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 29);

    const buckets = {};
    sessions.forEach((session) => {
      if (!session.date) return;
      const date = parseWorkoutDate(session.date);
      if (!date) return;
      if (date < start || date > today) return;
      const key = getLocalDateOnlyFromDate(date);
      buckets[key] = (buckets[key] || 0) + 1;
    });

    return Array.from({ length: 30 }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = getLocalDateOnlyFromDate(day);
      return { date: key, count: buckets[key] || 0 };
    });
  }, [sessions]);

  const muscleChartData = useMemo(
    () =>
      Object.entries(progress.byMuscleGroup || {}).map(([muscleKey, value]) => ({
        label: muscleMap[muscleKey]?.label || muscleKey,
        value,
      })),
    [progress, muscleMap]
  );

  const heatmapMatrix = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 27);

    const matrix = Array.from({ length: 4 }).map((_, idx) => ({
      weekLabel: `Semana ${idx + 1}`,
      values: Array(7).fill(0),
    }));

    sessions.forEach((session) => {
      if (!session.date) return;
      const date = parseWorkoutDate(session.date);
      if (!date) return;
      if (date < start || date > today) return;

      const diffDays = Math.floor((date - start) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > 27) return;
      const weekIndex = Math.floor(diffDays / 7);
      const weekday = (date.getDay() + 6) % 7;
      matrix[weekIndex].values[weekday] += 1;
    });

    return matrix;
  }, [sessions]);

  const miniStatsItems = useMemo(() => {
    const {
      mostPerformedWorkoutName,
      mostPerformedWorkoutCount,
      mostWorkedMuscleLabel,
      mostWorkedMuscleCount,
      bestWeekdayLabel,
      bestWeekdayCount,
      daysTrained,
      daysInMonth,
    } = progressStats;

    return [
      {
        label: 'Frequência registrada',
        value: `${daysTrained || 0}/${daysInMonth || 0} dias`,
        helper: daysInMonth ? `${Math.round(((daysTrained || 0) / daysInMonth) * 100)}% do mês` : null,
      },
      {
        label: 'Treino mais realizado',
        value: mostPerformedWorkoutName || '—',
        helper: mostPerformedWorkoutCount ? `${mostPerformedWorkoutCount} treino(s)` : null,
      },
      {
        label: 'Músculo mais trabalhado',
        value: mostWorkedMuscleLabel || '—',
        helper: mostWorkedMuscleCount ? `${mostWorkedMuscleCount} treino(s)` : null,
      },
      {
        label: 'Dia com mais treinos',
        value: bestWeekdayLabel || '—',
        helper: bestWeekdayCount ? `${bestWeekdayCount} sessão(ões)` : null,
      },
    ];
  }, [progressStats]);

  const sportsMap = useMemo(
    () =>
      SPORTS.reduce(
        (acc, sport) => ({
          ...acc,
          [sport.value]: sport,
        }),
        {}
      ),
    []
  );

  const supabase = useMemo(() => {
    const { supabaseUrl, supabaseAnonKey, authSchema } = window.APP_CONFIG || {};
    if (!supabaseUrl || !supabaseAnonKey || !window.supabase) return null;

    return window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: 'gp-react-session',
        schema: authSchema || 'public'
      }
    });
  }, []);

  const hasRoutines = useMemo(() => routines.length > 0, [routines]);
  const canTransferWorkout = useMemo(() => {
    const normalizedRole = String(currentUserRole || '').trim().toLowerCase();
    return normalizedRole === 'admin' || normalizedRole === 'affiliate' || currentUserIsAffiliate === true;
  }, [currentUserRole, currentUserIsAffiliate]);
  const filteredTransferUsers = useMemo(() => {
    const normalizedSearch = String(transferUserSearch || '').trim().toLowerCase();
    if (!normalizedSearch) return affiliateTransferUsers;

    return (affiliateTransferUsers || []).filter((user) => {
      const searchableText = [user?.name, user?.email, user?.username, user?.whatsapp]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return searchableText.includes(normalizedSearch);
    });
  }, [affiliateTransferUsers, transferUserSearch]);

  const nextWorkout = useMemo(() => {
    const normalizedSchedule = Array.isArray(schedule) ? schedule : [];
    const activeWorkouts = normalizedSchedule
      .filter((slot) => (slot?.is_active ?? slot?.reminder) === true && slot?.workout_id)
      .map((slot, idx) => ({
        ...slot,
        weekday: Number(slot?.weekday || slot?.dayIndex || idx + 1),
      }))
      .sort((a, b) => a.weekday - b.weekday);

    if (activeWorkouts.length === 0) {
      return null;
    }

    const currentJsDay = new Date().getDay();
    const today = currentJsDay === 0 ? 7 : currentJsDay;
    const upcoming = activeWorkouts.find((slot) => slot.weekday >= today) || activeWorkouts[0];
    const workoutName =
      routines.find((routine) => String(routine.id) === String(upcoming.workout_id))?.name ||
      'Treino sem nome';

    return {
      ...upcoming,
      workoutName,
    };
  }, [schedule, routines]);

  const notify = (message, variant = 'info') => {
    if (typeof pushToast === 'function') {
      pushToast(message, variant);
    }
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao comunicar com o servidor.');
    }
    return data;
  };

  const fetchAffiliateTransferUsers = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Usuário não autenticado. Faça login novamente.');
      }


      const response = await fetch(`${API_URL}/supervisor/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar usuários supervisionados');
      }

      const responseData = await response.json();
      setAffiliateTransferUsers(Array.isArray(responseData) ? responseData : []);
    } catch (error) {
      console.error('Erro ao buscar usuários supervisionados:', error);
      notify(error.message || 'Erro ao buscar usuários supervisionados.', 'danger');
      setAffiliateTransferUsers([]);
    }
  };

  async function openTransferWorkoutModal(workout) {
    setWorkoutToTransfer(workout);
    setTransferWorkoutModalOpen(true);
    setTransferUserSearch('');
    setSelectedTransferUser(null);
    await fetchAffiliateTransferUsers();
  }

  const closeTransferWorkoutModal = () => {
    setTransferWorkoutModalOpen(false);
    setWorkoutToTransfer(null);
    setSelectedTransferUser(null);
    setTransferUserSearch('');
  };

  async function handleTransferWorkout() {
    const workoutId =
      workoutToTransfer?.id ||
      workoutToTransfer?.workout_id ||
      workoutToTransfer?.routine_id;

    console.log('🔥 ID ENVIADO:', workoutId);
    console.log('🔥 OBJETO COMPLETO:', workoutToTransfer);

    if (!workoutId) {
      alert('Erro: treino sem ID');
      return;
    }

    if (!selectedTransferUser?.id) {
      notify('Selecione um usuário para receber o treino.', 'danger');
      return;
    }

    try {
      setTransferringWorkout(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Usuário não autenticado. Faça login novamente.');
      }

      const response = await fetch(`${API_URL}/workouts/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workoutId,
          targetUserId: selectedTransferUser.id
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData?.error || 'Erro ao transferir treino.');
      }

      notify('Treino transferido com sucesso.', 'success');
      alert('Treino transferido com sucesso!');
      await loadRoutines();
      closeTransferWorkoutModal();
    } catch (error) {
      console.error('Erro ao transferir treino:', error);
      notify(error.message || 'Erro ao transferir treino.', 'danger');
    } finally {
      setTransferringWorkout(false);
    }
  }

  const updateWeeklyPlan = async (day, { workoutId, time, reminderEnabled }) => {
    await fetchJson(`${API_URL}/weekly-plan/${day}`, {
      method: 'PATCH',
      body: JSON.stringify({
        userId,
        workoutId,
        time,
        reminderEnabled,
      }),
    });
  };

  const autoSavePlan = async (day, data) => {
    try {
      setSavingSchedule(true);
      await updateWeeklyPlan(day, data);
      setAutoSaveStatus('salvo');
      setTimeout(() => setAutoSaveStatus(null), 1500);
    } catch (err) {
      console.error('Erro ao salvar planejamento', err);
    } finally {
      setSavingSchedule(false);
    }
  };

  const normalizeRoutineFromApi = (item) => {
    const normalizeList = (value, fallback = []) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value.split(',').map((g) => g.trim()).filter(Boolean);
      }
      if (typeof fallback === 'string') {
        return fallback.split(',').map((g) => g.trim()).filter(Boolean);
      }
      return Array.isArray(fallback) ? fallback : [];
    };

    const muscleGroups = normalizeList(item?.muscleGroups, item?.muscle_group);
    const sportsActivities = normalizeList(
      item?.sportsActivities,
      item?.sports_list || item?.sports
    );
    const muscleConfig = parseMuscleConfigPayload(item?.muscleConfig ?? item?.muscle_config);
    const exercisesByGroup = normalizeGroupedExercisesPayload(
      item?.exercisesByGroup || item?.exercises_by_group || item?.exercicios || {}
    );
    const exercicios = Object.keys(exercisesByGroup).length > 0
      ? exercisesByGroup
      : muscleConfig.reduce((acc, entry) => {
          if (!entry?.muscle) return acc;
          return {
            ...acc,
            [getExercisesKey(entry.muscle)]: Array.isArray(entry.exercises) ? entry.exercises : [],
          };
        }, {});

    return {
      ...item,
      muscleGroups,
      sports: sportsActivities,
      sportsActivities,
      exercises:
        item?.exercises && typeof item.exercises === 'object' && !Array.isArray(item.exercises)
          ? normalizeGroupedExercisesPayload(item.exercises)
          : exercicios,
      exercisesByGroup: exercicios,
      muscleConfig,
      exercicios,
    };
  };

  const loadRoutines = async () => {
    try {
      if (!userId) {
        notify('Perfil do usuário não carregado.', 'warning');
        return;
      }
      setLoading(true);
      const response = await fetch(`${API_URL}/api/workout/routines?userId=${userId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar os treinos.');
      }
      const raw = Array.isArray(data) ? data : data?.items || [];
      const normalized = raw.map(normalizeRoutineFromApi);
      setRoutines(normalized);
    } catch (err) {
      console.error('Erro ao carregar rotinas', err);
      notify('Não foi possível carregar os treinos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyPlan = async () => {
    try {
      if (!userId) {
        return;
      }

      const data = await fetchJson(`${API_URL}/weekly-plan?user_id=${userId}`);

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      // cria um mapa por weekday pra não depender de índice
      const byWeekday = new Map(
        rows
          .filter((r) => r && r.weekday)
          .map((r) => [
            Number(r.weekday),
            {
              ...r,
              // padroniza o toggle no formato do front
              reminder: r.is_active ?? r.isActive ?? true,
              is_active: r.is_active ?? r.isActive ?? true,
            },
          ])
      );

      const merged = defaultSchedule.map((slot, idx) => {
        const weekday = Number(slot.weekday || slot.dayIndex || idx + 1);
        const fromDb = byWeekday.get(weekday);

        return {
          ...slot,
          weekday,
          // traz do banco o que existir
          workout_id: fromDb?.workout_id ?? slot.workout_id ?? null,
          time: fromDb?.time ?? slot.time ?? null,
          reminder: fromDb?.reminder ?? slot.reminder ?? true,
          is_active: fromDb?.is_active ?? slot.is_active ?? slot.reminder ?? true,
        };
      });

      setSchedule(merged);
    } catch (err) {
      console.error('Erro ao carregar semana de treino', err);
      notify('Não foi possível carregar a semana de treino.');
    }
  };

  const loadSessions = async () => {
    try {
      if (!userId) return;
      const query = new URLSearchParams({ userId });
      if (historyRange.from) query.append('from', `${historyRange.from}T00:00:00`);
      if (historyRange.to) query.append('to', `${historyRange.to}T23:59:59.999`);
      const data = await fetchJson(`${API_URL}/api/workouts/sessions?${query.toString()}`);
      const raw = Array.isArray(data) ? data : data?.items || [];
      const normalized = raw.map((session) => {
        const normalizedSports = syncSportsFromTemplate(
          session.sportsActivities,
          session.sports || session.sports_activities
        );

        const normalizedGroups = Array.isArray(session.muscleGroups)
          ? session.muscleGroups
          : typeof session.muscle_groups === 'string'
            ? session.muscle_groups.split(',').map((g) => g.trim()).filter(Boolean)
            : [];

        return {
          ...session,
          muscleGroups: normalizedGroups,
          sportsActivities: normalizedSports,
        };
      });
      setSessions(normalized);
    } catch (err) {
      console.error('Erro ao carregar histórico', err);
      notify('Não foi possível carregar o histórico de treinos.');
    }
  };

  const loadProgress = async () => {
    try {
      if (!userId) return;
      const data = await fetchJson(`${API_URL}/api/workouts/progress?userId=${userId}&period=month`);
      setProgress(data || { totalSessions: 0, byMuscleGroup: {} });
    } catch (err) {
      console.error('Erro ao carregar progresso', err);
      notify('Não foi possível carregar o progresso.');
    }
  };

  const toggleMuscleGroup = (group) => {
    setWorkoutForm((prev) => {
      const exists = prev.muscleGroups.includes(group);
      return {
        ...prev,
        muscleGroups: exists
          ? prev.muscleGroups.filter((item) => item !== group)
          : [...prev.muscleGroups, group]
      };
    });
  };

  const toggleSport = (sportValue) => {
    setWorkoutForm((prev) => ({
      ...prev,
      sportsActivities: prev.sportsActivities.includes(sportValue)
        ? prev.sportsActivities.filter((item) => item !== sportValue)
        : [...prev.sportsActivities, sportValue],
    }));
  };

  const syncSportsFromTemplate = (sportsActivities = [], sports = []) => {
    const raw = Array.isArray(sportsActivities) && sportsActivities.length
      ? sportsActivities
      : Array.isArray(sports)
        ? sports
        : [];

    return raw.map((item) => String(item).trim()).filter(Boolean);
  };

  const resetWorkoutForm = () => {
    setWorkoutForm({
      id: null,
      name: '',
      muscleGroups: [],
      sportsActivities: [],
      exercises: [],
      muscleConfig: [],
      exercisesByGroup: {},
      exercicios: {},
    });
  };

  const resetCreateFlow = () => {
    setStep(1);
    setTipoTreino(null);
    setSelecionados([]);
    setNomeTreino('');
    setMuscleConfigs({});
    setSelectedExercises({});
  };
  const handleStartCreateTreino = () => {
    resetWorkoutForm();
    setOpenTreinoModal(true);
    setStep(1);
    resetCreateFlow();
    setEtapaTreino('tipo');
    setTreinoTab('treinos');
  };

  const handleCancelCreateTreino = () => {
    setOpenTreinoModal(false);
    resetCreateFlow();
    resetWorkoutForm();
  };

  const toggleSelecionado = (value) => {
    setSelecionados((prev) => (
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    ));
  };

  const salvarTreino = async (nome, itensSelecionados, tipo) => {
    if (!nome || !String(nome).trim()) {
      alert('Digite um nome para o treino antes de salvar.');
      return;
    }
    const isMusculacao = tipo === 'musculacao';
    const exercicios = isMusculacao ? normalizeGroupedExercisesPayload(selectedExercises) : {};
    const muscleConfig = isMusculacao
      ? itensSelecionados.map((muscle) => ({
          muscle,
          config: formatMuscleConfigValue(muscleConfigs[muscle]),
          sets: Number(formatMuscleConfigValue(muscleConfigs[muscle]).split('x')?.[0]) || 0,
          reps: Number(formatMuscleConfigValue(muscleConfigs[muscle]).split('x')?.[1]) || 0,
          exercises: selectedExercises[getExercisesKey(muscle)] || [],
        }))
      : [];
    const payloadData = {
      name: nome,
      muscleGroups: isMusculacao ? itensSelecionados : [],
      sportsActivities: isMusculacao ? [] : itensSelecionados,
      muscleConfig,
      exercises: exercicios,
    };
    const novoTreino = {
      ...payloadData,
      exercisesByGroup: exercicios,
      exercicios,
    };

    await handleSaveRoutine(novoTreino);
  };

  const handleOpenViewWorkout = (template) => {
    const normalizedSports = syncSportsFromTemplate(
      template.sportsActivities,
      template.sports
    );
    setWorkoutForm({
      id: template.id || null,
      name: template.name || '',
      muscleGroups: template.muscleGroups || [],
      sportsActivities: normalizedSports,
      exercises: template.exercises || {},
      muscleConfig: template.muscleConfig || [],
      exercisesByGroup: template.exercisesByGroup || template.exercicios || {},
      exercicios: template.exercicios || {},
    });
    setMuscleConfigs(buildMuscleConfigState(template.muscleGroups || [], template.muscleConfig || []));
    setSelectedExercises(
      buildSelectedExercisesState(
        template.muscleGroups || [],
        template.muscleConfig || [],
        template.exercisesByGroup || template.exercicios
      )
    );
    setViewWorkout({ ...template, sportsActivities: normalizedSports });
    setIsViewModalOpen(true);
  };

  const handleCloseViewWorkout = () => {
    setIsViewModalOpen(false);
    setViewWorkout(null);
  };

  const handleSaveRoutine = async (overrideData = null) => {
    if (!nomeTreino || !nomeTreino.trim()) {
      alert('Digite um nome para o treino antes de salvar.');
      return;
    }

    const isMusculacao = tipoTreino === 'musculacao';
    const formData = {
      id: workoutForm.id,
      name: overrideData?.name ?? nomeTreino ?? workoutForm.name,
      muscleGroups: overrideData?.muscleGroups ?? workoutForm.muscleGroups,
      sportsActivities: overrideData?.sportsActivities ?? workoutForm.sportsActivities,
      muscleConfig: overrideData?.muscleConfig ?? workoutForm.muscleConfig ?? [],
      exercisesByGroup: normalizeGroupedExercisesPayload(
        overrideData?.exercisesByGroup
          || overrideData?.exercicios
          || overrideData?.exercises
          || workoutForm.exercisesByGroup
          || workoutForm.exercicios
          || selectedExercises
      ),
    };

    if (!formData.muscleGroups.length && !formData.sportsActivities.length) {
      notify('Selecione ao menos uma opção para o treino.', 'warning');
      return;
    }

    const payload = {
      userId,
      name: nomeTreino,
      muscleGroups: formData.muscleGroups,
      sportsActivities: formData.sportsActivities,
      muscleConfig: formData.muscleConfig,
      exercises: isMusculacao ? formData.exercisesByGroup : {},
      exercisesByGroup: isMusculacao ? formData.exercisesByGroup : {},
      exercicios: isMusculacao ? formData.exercisesByGroup : {},
    };

    try {
      setLoading(true);
      let response;
      if (formData.id) {
        response = await fetch(`${API_URL}/api/workout/routines/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${API_URL}/api/workout/routines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const saved = await response.json();
      const mergedSavedRoutine = normalizeRoutineFromApi({
        ...saved,
        name: saved?.name || formData.name,
        muscleGroups: saved?.muscleGroups || formData.muscleGroups,
        sportsActivities: saved?.sportsActivities || formData.sportsActivities,
        muscleConfig: saved?.muscleConfig || formData.muscleConfig,
        exercisesByGroup:
          saved?.exercisesByGroup ||
          saved?.exercises_by_group ||
          saved?.exercicios ||
          formData.exercisesByGroup,
        exercicios:
          saved?.exercicios ||
          saved?.exercisesByGroup ||
          saved?.exercises_by_group ||
          formData.exercisesByGroup,
      });

      if (!response.ok) {
        throw new Error(saved?.error || 'Não foi possível salvar o treino.');
      }

      resetWorkoutForm();
      setOpenTreinoModal(false);
      resetCreateFlow();

      setRoutines((prev) => {
        if (formData.id) {
          return prev.map((routine) => (routine.id === mergedSavedRoutine.id ? mergedSavedRoutine : routine));
        }
        return [...prev, mergedSavedRoutine];
      });

      if (createReminder) {
        const reminderPayload = {
          type: 'workout',
          workoutName: saved?.name || formData.name,
          date: getLocalDateOnly(),
        };
        await fetchJson(`${API_URL}/api/workouts/reminders`, {
          method: 'POST',
          body: JSON.stringify(reminderPayload),
        });
      }

      setEtapaTreino('tipo');
      setTreinoTab('treinos');
      notify('Treino salvo com sucesso!', 'success');
    } catch (err) {
      console.warn('Erro ao salvar treino', err);
      notify(err.message || 'Não foi possível salvar o treino.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoutine = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este treino?')) return;

    try {
      if (!userId) {
        notify('Perfil do usuário não carregado.', 'warning');
        return;
      }

      // Agora enviando o userId na query string para o backend
      const response = await fetch(
        `${API_URL}/api/workout/routines/${id}?userId=${userId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Não foi possível excluir o treino.');
      }

      // Remove o treino da lista em memória
      setRoutines((prev) => prev.filter((tpl) => tpl.id !== id));

      // Limpa o treino do cronograma (semana de treino)
      setSchedule((prev) =>
        prev.map((slot) =>
          slot.workout_id === id ? { ...slot, workout_id: '' } : slot
        )
      );
    } catch (err) {
      console.error('Erro ao excluir treino', err);
      notify(err.message || 'Não foi possível excluir o treino.', 'danger');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!userId) {
      notify('Perfil do usuário não carregado.', 'warning');
      return;
    }

    const ok = window.confirm('Excluir esse registro do histórico? Isso não pode ser desfeito.');
    if (!ok) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/workouts/sessions/${sessionId}?userId=${userId}`,
        { method: 'DELETE' }
      );

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Não foi possível excluir o registro.');
      }

      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      notify('Registro excluído com sucesso.');
    } catch (err) {
      console.error('Erro ao excluir registro', err);
      notify(err.message || 'Erro ao excluir registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleChange = (day, field, value) => {
    setSchedule((prev) => {
      const nextSchedule = prev.map((slot) => {
        if (slot.day !== day) return slot;

        if (field === 'reminder') {
          return { ...slot, reminder: value, is_active: value };
        }

        return { ...slot, [field]: value };
      });
      const updatedSlot = nextSchedule.find((slot) => slot.day === day);

      if (updatedSlot) {
        autoSavePlan(day, {
          workoutId: updatedSlot.workout_id || null,
          time: updatedSlot.time || null,
          reminderEnabled: !!updatedSlot.reminder,
        });
      }

      return nextSchedule;
    });
  };

  const completeWorkoutSession = async (template) => {
    const source = template || workoutForm;
    if (!source?.name) {
      notify('Selecione um treino para concluir.', 'warning');
      return null;
    }

    const sportsActivities = syncSportsFromTemplate(
      source.sportsActivities,
      source.sports || source.sports_activities
    );

    const sourceMuscleGroups = Array.isArray(source.muscleGroups)
      ? source.muscleGroups
      : Array.isArray(source.muscle_groups)
        ? source.muscle_groups
        : [];

    const sourceMuscleConfig = Array.isArray(source.muscleConfig)
      ? source.muscleConfig
      : Array.isArray(source.muscle_config)
        ? source.muscle_config
        : [];

    const sourceExercisesByGroup = normalizeGroupedExercisesPayload(
      source.exercisesByGroup ||
      source.exercises_by_group ||
      source.exercicios ||
      {}
    );

    const providedTemplateId = source.templateId || null;
    const fallbackRoutineId = source.id || null;
    const resolvedTemplateId = providedTemplateId || null;
    const templateIdSource = providedTemplateId
      ? 'workout_templates.id (source.templateId)'
      : fallbackRoutineId
        ? 'workout_routines.id (source.id)'
        : 'none';

    const sessionPayload = {
      userId,
      templateId: resolvedTemplateId,
      routineId: fallbackRoutineId,
      templateIdSource,
      date: getLocalDateOnly(),
      name: source.name,
      muscleGroups: sourceMuscleGroups,
      sportsActivities,
      sports: sportsActivities,
      sports_activities: sportsActivities,
      muscleConfig: sourceMuscleConfig,
      exercisesByGroup: sourceExercisesByGroup,
      completed: true,
    };

    try {
      console.info('[WorkoutRoutine] Conclusão de treino -> POST /api/workouts/sessions', {
        templateId: sessionPayload.templateId,
        templateIdSource: sessionPayload.templateIdSource,
        workoutName: sessionPayload.name,
        userId: sessionPayload.userId,
        date: sessionPayload.date,
      });

      const saved = await fetchJson(`${API_URL}/api/workouts/sessions`, {
        method: 'POST',
        body: JSON.stringify(sessionPayload),
      });

      const normalizedSaved = {
        ...saved,
        templateId: saved?.templateId || sessionPayload.templateId || null,
        exercisesByGroup: normalizeGroupedExercisesPayload(
          saved?.exercisesByGroup ||
          saved?.exercises_by_group ||
          sourceExercisesByGroup
        ),
        muscleConfig: Array.isArray(saved?.muscleConfig)
          ? saved.muscleConfig
          : Array.isArray(saved?.muscle_config)
            ? saved.muscle_config
            : sourceMuscleConfig,
        muscleGroups: Array.isArray(saved?.muscleGroups)
          ? saved.muscleGroups
          : sourceMuscleGroups,
        sportsActivities: syncSportsFromTemplate(
          saved?.sportsActivities,
          saved?.sports || saved?.sports_activities || sportsActivities
        ),
      };

      setSessions((prev) => [normalizedSaved, ...prev]);
      if (sessionReminder) {
        const reminderPayload = {
          type: 'workout',
          workoutName: normalizedSaved?.name || source.name,
          date: normalizedSaved?.date || sessionPayload.date,
        };
        await fetchJson(`${API_URL}/api/workouts/reminders`, {
          method: 'POST',
          body: JSON.stringify(reminderPayload),
        });
      }
      notify('Treino de hoje concluído!', 'success');
      return normalizedSaved;
    } catch (err) {
      console.error('Erro ao concluir treino', err);
      console.error('Payload enviado para /api/workouts/sessions', sessionPayload);
      notify('Não foi possível registrar o treino de hoje.', 'danger');
      return null;
    }
  };

  const handleCompleteTodayWorkout = async () => {
    await completeWorkoutSession(workoutForm);
  };

  const handleCompleteFromModal = async (template) => {
    const saved = await completeWorkoutSession(template);
    if (saved) {
      handleCloseViewWorkout();
    }
  };

  useEffect(() => {
    if (!supabase) return;

    const fetchUserId = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user?.id) {
          notify('Usuário não autenticado.', 'warning');
          return;
        }

        setUserId(user.id);
      } catch (err) {
        console.error('Erro ao buscar usuário autenticado', err);
        notify('Não foi possível carregar o usuário.', 'danger');
      }
    };

    fetchUserId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    fetchWeeklyPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadRoutines();
    fetchWeeklyPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (treinoTab === 'historico') {
      loadSessions();
    } else if (treinoTab === 'evolucao') {
      loadProgress();
      loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treinoTab, historyRange]);

  useEffect(() => {
    if (tipoTreino !== 'musculacao') {
      setMuscleConfigs({});
      setSelectedExercises({});
      return;
    }

    setMuscleConfigs((prev) => {
      const next = {};
      selecionados.forEach((muscle) => {
        next[muscle] = prev[muscle] || { type: 'preset', value: DEFAULT_MUSCLE_CONFIG };
      });
      return next;
    });
  }, [selecionados, tipoTreino]);

  useEffect(() => {
    setSelectedExercises((prev) => {
      const next = {};
      selecionados.forEach((muscle) => {
        const muscleKey = getExercisesKey(muscle);
        next[muscleKey] = prev[muscleKey] || [];
      });
      return next;
    });
  }, [selecionados]);

  const handleExerciseToggle = (muscle, exercise) => {
    setSelectedExercises((prev) => {
      const current = prev || {};
      const muscleKey = getExercisesKey(muscle);
      const muscleExercises = current[muscleKey] || [];

      const exists = muscleExercises.includes(exercise);

      const updated = exists
        ? muscleExercises.filter((e) => e !== exercise)
        : [...muscleExercises, exercise];

      return {
        ...prev,
        [muscleKey]: updated,
      };
    });
  };

  const canContinueStep = (
    (step === 1 && Boolean(tipoTreino))
    || (step === 2 && selecionados.length > 0)
    || step === 3
    || step === 4
  );

  const isMusculacao = tipoTreino === 'musculacao';
  const isEsporteOuCardio = tipoTreino === 'esporte' || tipoTreino === 'cardio';
  const totalSteps = isMusculacao ? 5 : 3;
  const isLastStep = step === totalSteps;

  const handleNextStep = async () => {
    if (step === 3) {
      if (!nomeTreino || !nomeTreino.trim()) {
        alert('Digite um nome para o treino antes de continuar.');
        return;
      }

      if (tipoTreino === 'esporte' || tipoTreino === 'cardio') {
        await salvarTreino(nomeTreino, selecionados, tipoTreino);
        return;
      }
    }

    setStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const {
    daysTrained,
    daysInMonth,
    mostPerformedWorkoutName,
    mostPerformedWorkoutCount,
    mostWorkedMuscleLabel,
    mostWorkedMuscleCount,
    weeklySummary,
    bestWeekdayLabel,
    bestWeekdayCount,
  } = progressStats;

  const treinosHistorico = sessions.map((session) => {
    const muscles = (session.muscleGroups || [])
      .map((group) => muscleMap[group]?.label || group)
      .join(', ');
    const sportsActivities = Array.isArray(session.sportsActivities)
      ? session.sportsActivities
          .map((sport) => sportsMap[sport]?.label || sport)
          .join(', ')
      : '';
    const exerciseResume = (session.exercises || []).map(formatExerciseResume).join('; ');

    return {
      id: session.id,
      date: session.date || session.performed_at,
      muscles: muscles || session.name || 'Treino realizado',
      activities: [sportsActivities, exerciseResume].filter(Boolean).join(' • '),
    };
  });

  return (
    <div className="workout-routine">
      {/* COLUNA ESQUERDA – Rotina de Treino (aba + config + histórico + progresso) */}
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <h2 style={{ margin: 0 }}>
            🏋️ Treinos
          </h2>

          <button
            className="btn-primary"
            onClick={handleStartCreateTreino}
            disabled={openTreinoModal}
            style={{
              cursor: openTreinoModal ? 'not-allowed' : 'pointer',
              opacity: openTreinoModal ? 0.6 : 1,
              display: openTreinoModal ? 'none' : 'inline-flex'
            }}
          >
            + Novo Treino
          </button>
        </div>

        <div className="sep" style={{ marginTop: 12 }}></div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            marginTop: '10px'
          }}
        >
          <button
            onClick={() => setTreinoTab('treinos')}
            className={treinoTab === 'treinos' ? 'subtab active' : 'subtab'}
          >
            📋 Treinos
          </button>
          <button
            onClick={() => setTreinoTab('planejamento')}
            className={treinoTab === 'planejamento' ? 'subtab active' : 'subtab'}
          >
            📅 Planejamento
          </button>
          <button
            onClick={() => setTreinoTab('evolucao')}
            className={treinoTab === 'evolucao' ? 'subtab active' : 'subtab'}
          >
            📊 Evolução
          </button>
          <button
            onClick={() => setTreinoTab('historico')}
            className={treinoTab === 'historico' ? 'subtab active' : 'subtab'}
          >
            🕓 Histórico
          </button>
        </div>

        {/* Aba CONFIG – manter apenas "Novo Template de Treino" + "Treinos cadastrados" aqui */}
        {treinoTab === 'treinos' && etapaTreino === 'tipo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!openTreinoModal && (
              <div>
                <h4 className="title" style={{ marginBottom: 12 }}>Treinos cadastrados</h4>
                {!routines.length && <div className="muted">Nenhum treino cadastrado.</div>}
                {routines.length > 0 && (
                  <div className="table workout-routines-scroll treinos-list">
                    {routines.map((template) => (
                      <div
                        key={template.id || template.name}
                        className="workout-template-item table-row treino-item card-padrao"
                      >
                        <div className="workout-template-header">
                          <strong className="text-blue-400 font-semibold">{template.name}</strong>
                          <div className="workout-template-subtitle">
                            {Array.isArray(template.muscleGroups) && template.muscleGroups.length > 0 && (
                              <span>
                                {(template.muscleGroups || [])
                                  .map((group) => muscleMap[group]?.label || group)
                                  .join(', ')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="workout-template-actions">
                          <button
                            type="button"
                            className="ghost btn-acao"
                            onClick={() => {
                              const sportsActivities = syncSportsFromTemplate(
                                template.sportsActivities,
                                template.sports
                              );

                              const normalizedMuscles = Array.isArray(template.muscleGroups)
                                ? template.muscleGroups
                                : template.muscle_groups || [];
                              const isCardioTemplate = sportsActivities.every((item) => (
                                ['bicicleta', 'corrida_ao_ar_livre', 'escada', 'esteira'].includes(item)
                              ));

                              setWorkoutForm({
                                ...template,
                                muscleGroups: normalizedMuscles,
                                sportsActivities,
                                sports: sportsActivities,
                                muscleConfig: template.muscleConfig || [],
                                exercisesByGroup: template.exercisesByGroup || template.exercicios || {},
                                exercicios: template.exercicios || {},
                              });
                              setTipoTreino(
                                normalizedMuscles.length ? 'musculacao' : (isCardioTemplate ? 'cardio' : 'esporte')
                              );
                              setSelecionados(normalizedMuscles.length ? normalizedMuscles : sportsActivities);
                              setNomeTreino(template.name || '');
                              setMuscleConfigs(
                                buildMuscleConfigState(normalizedMuscles, template.muscleConfig || [])
                              );
                              setSelectedExercises(
                                buildSelectedExercisesState(
                                  normalizedMuscles,
                                  template.muscleConfig || [],
                                  template.exercisesByGroup || template.exercicios
                                )
                              );
                              setOpenTreinoModal(true);
                              setStep(2);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="ghost btn-acao"
                            onClick={() => handleOpenViewWorkout({
                              ...template,
                              sportsActivities: syncSportsFromTemplate(
                                template.sportsActivities,
                                template.sports
                              )
                            })}
                          >
                            Ver treino
                          </button>
                          {canTransferWorkout && (
                            <button
                              type="button"
                              className="ghost btn-acao"
                              onClick={() => openTransferWorkoutModal(template)}
                            >
                              Transferir treino
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-acao"
                            onClick={() => handleDeleteRoutine(template.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {openTreinoModal && (
              <div className="modal-overlay">
                <div className="report-modal">
                  <h2>Novo treino</h2>
                  <p>Passo {step} de {totalSteps}</p>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(step / totalSteps) * 100}%` }}
                    />
                  </div>

                  {step === 1 && (
                    <div>
                      <h3>Qual tipo de treino?</h3>
                      <div className="tipo-grid">
                        <button
                          type="button"
                          className={`treino-option ${tipoTreino === 'musculacao' ? 'selected' : ''}`}
                          onClick={() => setTipoTreino('musculacao')}
                        >
                          💪 Musculação
                        </button>
                        <button
                          type="button"
                          className={`treino-option ${tipoTreino === 'esporte' ? 'selected' : ''}`}
                          onClick={() => setTipoTreino('esporte')}
                        >
                          🥊 Esporte
                        </button>
                        <button
                          type="button"
                          className={`treino-option ${tipoTreino === 'cardio' ? 'selected' : ''}`}
                          onClick={() => setTipoTreino('cardio')}
                        >
                          🏃 Cardio
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <h3>Escolher exercícios</h3>

                      {tipoTreino === 'musculacao' && (
                        <div className="muscle-grid">
                          {MUSCLE_GROUPS.map((group) => (
                            <button
                              key={group.value}
                              type="button"
                              className={selecionados.includes(group.value) ? 'card muscle-card active' : 'card muscle-card'}
                              onClick={() => toggleSelecionado(group.value)}
                            >
                              <div className="muscle-image-wrapper">
                                <img src={group.image} alt={group.label} className="muscle-image" />
                              </div>
                              <span className="muscle-label">{group.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {tipoTreino === 'esporte' && (
                        <div className="muscle-grid">
                          {SPORTS.map((sport) => (
                            <button
                              key={sport.value}
                              type="button"
                              className={selecionados.includes(sport.value) ? 'card muscle-card active' : 'card muscle-card'}
                              onClick={() => toggleSelecionado(sport.value)}
                            >
                              <div className="muscle-image-wrapper">
                                <img src={sport.image} alt={sport.label} className="muscle-image" />
                              </div>
                              <span className="muscle-label">{sport.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {tipoTreino === 'cardio' && (
                        <div className="muscle-grid">
                          {CARDIO_ACTIVITIES.map((cardio) => (
                            <button
                              key={cardio.value}
                              type="button"
                              className={selecionados.includes(cardio.value) ? 'card muscle-card active' : 'card muscle-card'}
                              onClick={() => toggleSelecionado(cardio.value)}
                            >
                              <div className="muscle-image-wrapper">
                                <img src={cardio.image} alt={cardio.label} className="muscle-image" />
                              </div>
                              <span className="muscle-label">{cardio.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <h3>Configuração do treino</h3>
                      <input
                        value={nomeTreino}
                        onChange={(e) => setNomeTreino(e.target.value)}
                        placeholder="Ex: Treino A - Peito e Tríceps"
                      />
                      {tipoTreino === 'musculacao' && selecionados.length > 0 && (
                        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {selecionados.map((muscle) => {
                            const muscleLabel = muscleMap[muscle]?.label || muscle;
                            const current = muscleConfigs[muscle] || {
                              type: 'preset',
                              value: DEFAULT_MUSCLE_CONFIG,
                            };
                            const customSeries = current.type === 'custom' ? Number(current.series) || 0 : 0;
                            const customReps = current.type === 'custom' ? Number(current.reps) || 0 : 0;

                            return (
                              <div key={muscle} className="card-padrao" style={{ padding: 12 }}>
                                <div style={{ fontWeight: 600, marginBottom: 8 }}>{muscleLabel}</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {QUICK_MUSCLE_CONFIG_OPTIONS.map((option) => {
                                    const isSelected = current.type === 'preset' && current.value === option;
                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        className={`treino-option muscle-config-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                          setMuscleConfigs((prev) => ({
                                            ...prev,
                                            [muscle]: { type: 'preset', value: option },
                                          }));
                                        }}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    className={`treino-option muscle-config-option ${current.type === 'custom' ? 'selected' : ''}`}
                                    onClick={() => {
                                      setMuscleConfigs((prev) => ({
                                        ...prev,
                                        [muscle]: {
                                          type: 'custom',
                                          series: customSeries || 3,
                                          reps: customReps || 10,
                                        },
                                      }));
                                    }}
                                  >
                                    Personalizar
                                  </button>
                                </div>
                                {current.type === 'custom' && (
                                  <div className="row" style={{ marginTop: 10, gap: 10 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <label>Séries</label>
                                      <input
                                        type="number"
                                        min="1"
                                        value={customSeries || ''}
                                        onChange={(e) => {
                                          const series = Number(e.target.value);
                                          setMuscleConfigs((prev) => ({
                                            ...prev,
                                            [muscle]: {
                                              type: 'custom',
                                              series,
                                              reps: customReps || 10,
                                            },
                                          }));
                                        }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <label>Reps</label>
                                      <input
                                        type="number"
                                        min="1"
                                        value={customReps || ''}
                                        onChange={(e) => {
                                          const reps = Number(e.target.value);
                                          setMuscleConfigs((prev) => ({
                                            ...prev,
                                            [muscle]: {
                                              type: 'custom',
                                              series: customSeries || 3,
                                              reps,
                                            },
                                          }));
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {step === 4 && tipoTreino === 'musculacao' && (
                    <div>
                      <h3>Selecionar exercícios</h3>
                      {tipoTreino === 'musculacao' && selecionados.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {selecionados.map((muscle) => (
                            <div key={muscle} className="card-padrao" style={{ padding: 12 }}>
                              <h4 style={{ marginTop: 0, marginBottom: 8 }}>{muscleMap[muscle]?.label || muscle}</h4>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(exercises[normalizeKey(getExercisesKey(muscle))] || []).map((exercise) => (
                                  <div
                                    key={`${muscle}-${exercise}`}
                                    onClick={() => handleExerciseToggle(muscle, exercise)}
                                    className={`exercise-item treino-option ${(selectedExercises[normalizeKey(getExercisesKey(muscle))] || []).includes(exercise) ? 'selected' : ''}`}
                                  >
                                    <span>{exercise}</span>
                                    <button
                                      type="button"
                                      className="preview-btn"
                                      aria-label={`Visualizar ${exercise}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewExercise(exercise);
                                        setPreviewMuscle(muscle);
                                      }}
                                    >
                                      👁
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {step === 5 && (
                    <div>
                      <h3>Confirmar treino</h3>
                      <p><strong>Tipo:</strong> {tipoTreino ? tipoTreino[0].toUpperCase() + tipoTreino.slice(1) : 'Não definido'}</p>
                      <p><strong>Nome:</strong> {nomeTreino || 'Sem nome'}</p>
                      <p><strong>Selecionados:</strong> {selecionados.length}</p>
                    </div>
                  )}

                  <div className="wizard-actions">
                    {step > 1 && (
                      <button type="button" onClick={() => setStep(step - 1)}>
                        ← Voltar
                      </button>
                    )}

                    {(step < totalSteps || (isEsporteOuCardio && isLastStep)) && (
                      isEsporteOuCardio && isLastStep ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={loading}
                          onClick={() => salvarTreino(nomeTreino, selecionados, tipoTreino)}
                        >
                          {loading ? 'Salvando...' : 'Salvar treino ✅'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleNextStep}
                          disabled={!canContinueStep}
                        >
                          Continuar →
                        </button>
                      )
                    )}

                    {step === 5 && (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={loading}
                        onClick={() => salvarTreino(nomeTreino, selecionados, tipoTreino)}
                      >
                        {loading ? 'Salvando...' : 'Salvar Treino'}
                      </button>
                    )}

                    <button type="button" onClick={handleCancelCreateTreino}>
                      Cancelar
                    </button>
                  </div>

                  {previewExercise && (
                    <div
                      className="exercise-modal-overlay"
                      onClick={() => {
                        setPreviewExercise(null);
                        setPreviewMuscle(null);
                      }}
                    >
                      <div className="exercise-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{previewExercise}</h3>
                        {gif ? (
                          <img
                            src={gif}
                            alt={previewExercise}
                            style={{ width: '100%', borderRadius: '12px' }}
                          />
                        ) : (
                          <div className="muted" style={{ marginBottom: 12 }}>
                            GIF deste exercício não encontrado.
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewExercise(null);
                            setPreviewMuscle(null);
                          }}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Aba HISTÓRICO */}
        {treinoTab === 'historico' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row" style={{ gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label>De</label>
                <input
                  type="date"
                  value={historyRange.from}
                  onChange={(e) => setHistoryRange((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label>Até</label>
                <input
                  type="date"
                  value={historyRange.to}
                  onChange={(e) => setHistoryRange((prev) => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>

            {!sessions.length && <div className="muted">Nenhum treino registrado no período.</div>}
            {sessions.length > 0 && (
              <div className="treinos-scroll-container">
                {treinosHistorico.map((treino) => (
                  <div key={treino.id} className="event-card card-padrao">

                    <div className="event-date">
                      {formatWorkoutDatePtBr(treino.date)}
                    </div>

                    <div className="event-content">
                      <div className="event-title">
                        💪 Treino realizado
                      </div>

                      <div className="event-subtitle">
                        {treino.muscles}
                      </div>

                      {treino.activities && (
                        <div className="event-subtitle">
                          {treino.activities}
                        </div>
                      )}
                    </div>

                    <div className="event-actions">
                      <button
                        type="button"
                        className="btn-delete btn-acao"
                        onClick={() => handleDeleteSession(treino.id)}
                        aria-label={`Excluir treino de ${formatWorkoutDatePtBr(treino.date)}`}
                        title="Excluir treino"
                      >
                        🗑️
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba EVOLUÇÃO */}
        {treinoTab === 'evolucao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="muted" style={{ fontSize: 14 }}>
              Total de treinos no mês: <strong>{progress.totalSessions || 0}</strong>
            </div>

            {/* Resumo do mês: dias treinados + mini progress bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {/* Card – Dias treinados vs dias do mês */}
              <div
                className="card-padrao"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>Frequência no mês</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Você treinou <strong>{daysTrained}</strong> dia(s) de{' '}
                  <strong>{daysInMonth}</strong>.
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 2,
                      fontSize: 12,
                    }}
                  >
                    {Array.from({ length: 10 }).map((_, index) => {
                      const filledSegments = daysInMonth
                        ? Math.round((daysTrained / Math.max(daysInMonth, 1)) * 10)
                        : 0;
                      const active = index < filledSegments;
                      return (
                        <span
                          key={index}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: active
                              ? '#50be78'
                              : 'rgba(255,255,255,0.12)',
                          }}
                        ></span>
                      );
                    })}
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {daysTrained}/{daysInMonth}
                  </span>
                </div>
              </div>

              {/* Card – Treino mais realizado + músculo mais trabalhado */}
              <div
                className="card-padrao"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 600 }}>Highlights do mês</div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 6 }}>🏆</span>
                  Treino mais realizado:{' '}
                  <strong>{mostPerformedWorkoutName || '—'}</strong>
                  {mostPerformedWorkoutCount > 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}
                      ({mostPerformedWorkoutCount}x)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 6 }}>🔥</span>
                  Músculo mais trabalhado:{' '}
                  <strong>{mostWorkedMuscleLabel || '—'}</strong>
                  {mostWorkedMuscleCount > 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {' '}
                      ({mostWorkedMuscleCount} treino(s))
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Evolução semanal + melhor dia da semana */}
            <div
              className="card-padrao"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontWeight: 600 }}>Evolução semanal</div>
                {bestWeekdayLabel && (
                  <div
                    style={{
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    <span>📅 Dia que você mais treina:</span>
                    <span>
                      <strong>{bestWeekdayLabel}</strong>{' '}
                      {bestWeekdayCount > 0 && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          ({bestWeekdayCount} treino(s))
                        </span>
                      )}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      A {bestWeekdayLabel.split('-')[0].toLowerCase()} é seu dia brabo!
                    </span>
                  </div>
                )}
              </div>

              {(!weeklySummary || weeklySummary.length === 0) && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Nenhum treino registrado neste mês ainda.
                </div>
              )}

              {weeklySummary && weeklySummary.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const maxWeekCount = Math.max(
                      ...weeklySummary.map((w) => w.count || 0),
                      1
                    );
                    return weeklySummary.map((week) => (
                      <div key={week.label}>
                        <div
                          className="row"
                          style={{
                            justifyContent: 'space-between',
                            fontSize: 12,
                            marginBottom: 2,
                          }}
                        >
                          <span>{week.label}</span>
                          <span className="muted">{week.count} treino(s)</span>
                        </div>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(
                                ((week.count || 0) / maxWeekCount) * 100,
                                100
                              )}%`,
                              height: '100%',
                            }}
                            className="progress-evolucao"
                          ></div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Progresso por grupo muscular (bloco original, mantido) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(progress.byMuscleGroup || {}).map(([muscle, count]) => (
                <div key={muscle} className="card-padrao" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{muscleMap[muscle]?.label || muscle}</span>
                    <span className="muted">{count} treino(s)</span>
                  </div>
                  <div
                    style={{
                      height: 10,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(
                          (count / Math.max(progress.totalSessions, 1)) * 100,
                          100
                        )}%`,
                        height: '100%',
                      }}
                      className="progress-evolucao"
                    ></div>
                  </div>
                </div>
              ))}
              {Object.keys(progress.byMuscleGroup || {}).length === 0 && (
                <div className="muted">Nenhum progresso registrado ainda.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {treinoTab === 'planejamento' && (
        <section className="card card-padrao" style={{ marginTop: 16 }}>
          <h4 className="title" style={{ marginBottom: 12 }}>Semana de Treino</h4>

          <div
            className="next-workout-card card-padrao"
            style={{
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: '0 0 6px 0' }}>📅 Próximo Treino</h3>

            {nextWorkout ? (
              <>
                <p style={{ margin: 0 }}>💪 {nextWorkout.workoutName}</p>
                <p style={{ margin: '4px 0 0 0' }}>📆 {WEEKDAY_NAME[nextWorkout.weekday]}</p>
                <p style={{ margin: '4px 0 0 0' }}>⏰ {nextWorkout.time || 'Horário não definido'}</p>
              </>
            ) : (
              <p style={{ margin: 0 }}>Nenhum treino programado</p>
            )}
          </div>

          {/* usar exatamente o mesmo conteúdo que hoje está dentro do comentário "SEMANA DE TREINO" */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {schedule.map((slot) => (
              <div
                key={slot.day}
                className="card-padrao"
                style={{
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      📅
                    </span>
                    {slot.day.toUpperCase()}
                  </div>
                  {slot.workout_id && (
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        background: 'rgba(80, 190, 120, 0.15)',
                        color: '#50be78',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Treino ativo
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, color: '#9ba4b5' }}>Treino</label>
                  <div
                    className="custom-select"
                    style={{
                      background: '#0f131c',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      position: 'relative',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenWorkoutSelectDay((prev) => (prev === slot.day ? null : slot.day))}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      <span>
                        {routines.find((item) => String(item.id) === String(slot.workout_id))?.name || 'Selecione um treino'}
                      </span>
                      <span style={{ opacity: 0.8 }}>▾</span>
                    </button>

                    {openWorkoutSelectDay === slot.day && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          background: '#131722',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 10,
                          boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
                          overflow: 'hidden',
                        }}
                      >
                        {[{ id: '', name: 'Selecione um treino' }, ...routines].map((item) => (
                          <button
                            key={`${slot.day}-${item.id || 'none'}-${item.name}`}
                            type="button"
                            onClick={() => {
                              handleScheduleChange(slot.day, 'workout_id', item.id);
                              setOpenWorkoutSelectDay(null);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              background: String(item.id) === String(slot.workout_id) ? 'rgba(80, 190, 120, 0.15)' : 'transparent',
                              color: '#fff',
                              padding: '10px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, color: '#9ba4b5' }}>Horário</label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#0f131c',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: '8px 12px',
                    }}
                  >
                    <span role="img" aria-label="Relógio">
                      🕒
                    </span>
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(e) => handleScheduleChange(slot.day, 'time', e.target.value)}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        color: '#fff',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, color: '#9ba4b5' }}>Lembrete</label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#0f131c',
                      borderRadius: 12,
                      padding: '10px 12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: '#d3d8e6' }}>Ativar lembrete</span>
                      <span style={{ fontSize: 12, color: '#9ba4b5' }}>
                        {slot.reminder
                          ? `🟢 Lembrete ativo às ${slot.time || '--:--'}`
                          : '⚪ Lembrete desativado'}
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        width: 56,
                        height: 28,
                        borderRadius: 20,
                        background: slot.reminder ? '#4ade80' : 'rgba(255,255,255,0.12)',
                        transition: 'all 0.2s ease',
                        boxShadow: slot.reminder
                          ? '0 10px 20px rgba(74, 222, 128, 0.35)'
                          : 'inset 0 1px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!slot.reminder}
                        onChange={(e) => {
                          const value = e.target.checked;

                          setSchedule((prev) =>
                            prev.map((item) =>
                              item.day === slot.day ? { ...item, reminder: value, is_active: value } : item
                            )
                          );

                          autoSavePlan(slot.day, {
                            workoutId: slot.workout_id || null,
                            time: slot.time || null,
                            reminderEnabled: value,
                          });
                        }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          cursor: 'pointer',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: 3,
                          left: slot.reminder ? 30 : 4,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#fff',
                          boxShadow: '0 6px 12px rgba(0,0,0,0.25)',
                          transition: 'all 0.2s ease',
                        }}
                      ></span>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {autoSaveStatus && (
            <div className="muted" style={{ marginTop: 12, color: '#50be78' }}>
              Alterações salvas automaticamente.
            </div>
          )}

          {!hasRoutines && (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Cadastre ao menos um treino para montar a semana.
            </div>
          )}
        </section>
      )}

      {treinoTab === 'evolucao' && (
        <section className="card card-padrao" style={{ marginTop: 16 }}>
          <h4 className="title" style={{ marginBottom: 12 }}>Visão analítica</h4>
          <div className="grid" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <ProgressRing
                  value={daysTrained}
                  max={daysInMonth}
                  label="Frequência no mês"
                />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <GoalBar
                  current={progress.totalSessions || 0}
                  goal={12} // meta fixa por enquanto
                  label="Meta mensal de treinos"
                />
              </div>
            </div>

            <div>
              <MiniStats items={miniStatsItems} />
            </div>

            <div>
              <MuscleDonut title="Grupos musculares mais treinados" data={muscleChartData} />
            </div>

            <div>
              <WeightLineChart dailyCounts={dailyTrainingCounts} />
            </div>

            <div>
              <TrainingHeatmap title="Treinos por dia da semana" matrix={heatmapMatrix} />
            </div>
          </div>
        </section>
      )}

      {/* Modal continua funcionando normalmente, fora dos cards */}
      <ViewWorkoutModal
        open={isViewModalOpen}
        workout={viewWorkout}
        onClose={handleCloseViewWorkout}
        onCompleteToday={handleCompleteFromModal}
        muscleMap={muscleMap}
        sportsMap={sportsMap}
      />
      {transferWorkoutModalOpen && (
        <div className="modal-overlay" onClick={closeTransferWorkoutModal}>
          <div className="report-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Transferir treino</h2>
            <p>Escolha um usuário supervisionado para receber uma cópia deste treino.</p>
            <p className="muted" style={{ marginTop: 4 }}>
              Treino selecionado: <strong>{workoutToTransfer?.name || '-'}</strong>
            </p>

            <input
              type="text"
              placeholder="🔍 Buscar usuário por nome, email ou WhatsApp..."
              value={transferUserSearch}
              onChange={(event) => setTransferUserSearch(event.target.value)}
              style={{ marginTop: 12, marginBottom: 12 }}
            />

            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!filteredTransferUsers.length && (
                <div className="muted">Nenhum usuário supervisionado encontrado.</div>
              )}
              {filteredTransferUsers.map((user) => (
                <div
                  key={user.id}
                  className="card-padrao"
                  style={{
                    border: selectedTransferUser?.id === user.id ? '1px solid #50be78' : '1px solid #2f2f2f',
                    padding: 10,
                    borderRadius: 10,
                  }}
                >
                  <strong>{user.name || 'Usuário sem nome'}</strong>
                  <div className="muted">{user.email || user.username || '-'}</div>
                  <div className="muted">WhatsApp: {user.whatsapp || '-'}</div>
                  <button
                    type="button"
                    className="ghost btn-acao"
                    style={{ marginTop: 8 }}
                    onClick={() => setSelectedTransferUser(user)}
                  >
                    Selecionar
                  </button>
                </div>
              ))}
            </div>

            {selectedTransferUser && (
              <p style={{ marginTop: 12 }}>
                Você vai transferir uma cópia do treino "{workoutToTransfer?.name || '-'}" para "{selectedTransferUser?.name || '-'}".
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="ghost" onClick={closeTransferWorkoutModal} disabled={transferringWorkout}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleTransferWorkout}
                disabled={transferringWorkout || !selectedTransferUser?.id}
              >
                {transferringWorkout ? 'Transferindo...' : 'Confirmar transferência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutRoutine;
