import React, { useEffect, useMemo, useState } from 'react';
import PeitoImg from '../assets/muscles/Peito.png';
import CostasImg from '../assets/muscles/Costas.png';
import OmbrosImg from '../assets/muscles/Ombros.png';
import BicepsImg from '../assets/muscles/Biceps.png';
import TricepsImg from '../assets/muscles/Triceps.png';
import AbdomenImg from '../assets/muscles/Abdomen.png';
import PernasImg from '../assets/muscles/Pernas.png';
import GluteosImg from '../assets/muscles/Gluteos.png';
import NatacaoImg from '../assets/muscles/Natacao.png';
import VoleiImg from '../assets/muscles/Volei.png';
import BoxeImg from '../assets/muscles/Boxe.png';
import JiuJitsuImg from '../assets/muscles/Jiu-jitsu.png';
import FutebolImg from '../assets/muscles/Futebol.png';
import BeachTennisImg from '../assets/muscles/beach tennis.png';
import PeitoCrossoverGif from '../assets/exercise/peito/Crossover com pegada alta.gif';
import PeitoSupinoInclinadoGif from '../assets/exercise/peito/Supino inclinado com halteres.gif';
import PeitoSupinoRetoGif from '../assets/exercise/peito/Supino reto com barra.gif';
import PeitoVoadorGif from '../assets/exercise/peito/Voador ou peck deck.gif';
import BicepsBasicoGif from '../assets/exercise/biceps/bíceps.gif';
import BicepsRoscaConcentradaGif from '../assets/exercise/biceps/Rosca concentrada.gif';
import BicepsRoscaInclinadaGif from '../assets/exercise/biceps/Rosca inclinada.gif';
import BicepsRoscaMarteloGif from '../assets/exercise/biceps/Rosca martelo.gif';
import BicepsRoscaScottGif from '../assets/exercise/biceps/Rosca Scott.gif';
import CostasPulleyGif from '../assets/exercise/costas/Pulley costas.gif';
import CostasRemadaBaixaGif from '../assets/exercise/costas/Remada baixa.gif';
import CostasRemadaSerroteGif from '../assets/exercise/costas/Remada serrote.gif';
import CostasVoadorInvertidoGif from '../assets/exercise/costas/Voador invertido.gif';
import OmbroArnoldPressGif from '../assets/exercise/ombro/Arnold press.gif';
import OmbroCrucifixoInversoGif from '../assets/exercise/ombro/Crucifixo inverso.gif';
import OmbroElevacaoFrontalGif from '../assets/exercise/ombro/Elevação frontal.gif';
import OmbroElevacaoLateralGif from '../assets/exercise/ombro/Elevação lateral.gif';
import TricepsExtensaoGif from "../assets/exercise/triceps/Extensao triceps deitado.gif";
import TricepsMergulhoGif from "../assets/exercise/triceps/Mergulho na máquina.gif";
import TricepsPoliaAltaGif from "../assets/exercise/triceps/Polia alta com corda.gif";
import TricepsCoiceGif from "../assets/exercise/triceps/Tríceps coice.gif";
import AbdomenInfraGif from "../assets/exercise/abdomen/Abdominal infra nas paralelas.gif";
import AbdomenMaquinaGif from "../assets/exercise/abdomen/Abdominal na máquina.gif";
import AbdomenPoliaGif from "../assets/exercise/abdomen/Abdominal na polia.gif";
import AbdomenRetoGif from "../assets/exercise/abdomen/Abdominal reto (tradicional).gif";
import PernasAgachamentoBulgaroGif from "../assets/exercise/Quadríceps/Agachamento búlgaro.gif";
import PernasAgachamentoHackGif from "../assets/exercise/Quadríceps/Agachamento hack.gif";
import PernasCadeiraExtensoraGif from "../assets/exercise/Quadríceps/Cadeira extensora.gif";
import PernasLegPressGif from "../assets/exercise/Quadríceps/Leg press.gif";
import PernasPanturrilhaMaquinaGif from "../assets/exercise/Quadríceps/Panturrilha Sentado na Máquina.gif";
import GluteoFlexoraDeitadaGif from "../assets/exercise/gluteo/Flexora deitada.gif";
import GluteoNoCaboGif from "../assets/exercise/gluteo/Glúteos no Cabo.gif";
import GluteoLevantamentoTerraGif from "../assets/exercise/gluteo/Levantamento terra.gif";
import GluteoStiffGif from "../assets/exercise/gluteo/Stiff.gif";
import ProgressRing from './charts/ProgressRing.jsx';
import GoalBar from './charts/GoalBar.jsx';
import WeightLineChart from './charts/WeightLineChart.jsx';
import MuscleDonut from './charts/MuscleDonut.jsx';
import TrainingHeatmap from './charts/TrainingHeatmap.jsx';
import MiniStats from './charts/MiniStats.jsx';

const muscleGroups = [
  { id: 'peito', name: 'Peito', image: PeitoImg },
  { id: 'costas', name: 'Costas', image: CostasImg },
  { id: 'ombros', name: 'Ombros', image: OmbrosImg },
  { id: 'biceps', name: 'Bíceps', image: BicepsImg },
  { id: 'triceps', name: 'Tríceps', image: TricepsImg },
  { id: 'abdomen', name: 'Abdômen', image: AbdomenImg },
  { id: 'pernas', name: 'Pernas', image: PernasImg },
  { id: 'gluteos', name: 'Glúteos', image: GluteosImg },

  // Esportes
  { id: 'natacao', name: 'Natação', image: NatacaoImg },
  { id: 'volei', name: 'Vôlei', image: VoleiImg },
  { id: 'boxe', name: 'Boxe', image: BoxeImg },
  { id: 'jiujitsu', name: 'Jiu-Jitsu', image: JiuJitsuImg },
  { id: 'futebol', name: 'Futebol', image: FutebolImg },
  { id: 'beachtennis', name: 'Beach Tennis', image: BeachTennisImg },
];

const MUSCLE_GROUPS = muscleGroups.slice(0, 8).map(({ id, name, image }) => ({
  value: id,
  label: name,
  image
}));

const SPORTS = muscleGroups.slice(8).map(({ id, name, image }) => ({
  value: id,
  label: name,
  image
}));

const MUSCLE_INFO = {
  peito: {
    title: 'Peito',
    description:
      'Grupo muscular responsável por empurrar carga à frente do corpo, muito usado em supino, flexões e movimentos de empurrar no dia a dia.',
    exercises: [
      {
        name: 'Supino inclinado com halteres',
        gif: PeitoSupinoInclinadoGif,
      },
      {
        name: 'Supino reto com barra',
        gif: PeitoSupinoRetoGif,
      },
      {
        name: 'Crossover com pegada alta',
        gif: PeitoCrossoverGif,
      },
      {
        name: 'Voador ou peck deck',
        gif: PeitoVoadorGif,
      },
    ],
  },
  biceps: {
    title: 'Bíceps',
    description:
      'Músculo da parte da frente do braço, responsável por flexionar o cotovelo. Muito ativado em roscas e movimentos de puxar.',
    exercises: [
      { name: 'Bíceps', gif: BicepsBasicoGif },
      { name: 'Rosca concentrada', gif: BicepsRoscaConcentradaGif },
      { name: 'Rosca inclinada', gif: BicepsRoscaInclinadaGif },
      { name: 'Rosca martelo', gif: BicepsRoscaMarteloGif },
      { name: 'Rosca Scott', gif: BicepsRoscaScottGif },
    ],
  },
  costas: {
    title: 'Costas',
    description:
      'Grupo muscular importante para postura, estabilidade e movimentos de puxar, muito trabalhado em remadas, puxadas e exercícios de tração.',
    exercises: [
      {
        name: 'Pulley costas',
        gif: CostasPulleyGif,
      },
      {
        name: 'Remada baixa',
        gif: CostasRemadaBaixaGif,
      },
      {
        name: 'Remada serrote',
        gif: CostasRemadaSerroteGif,
      },
      {
        name: 'Voador invertido',
        gif: CostasVoadorInvertidoGif,
      },
    ],
  },
  ombros: {
    title: 'Ombros',
    description:
      'Envolvidos em praticamente todos os movimentos de braço. Fortalecer ombros ajuda na estabilidade e evita lesões em outros exercícios.',
    exercises: [
      {
        name: 'Arnold press',
        gif: OmbroArnoldPressGif,
      },
      {
        name: 'Crucifixo inverso',
        gif: OmbroCrucifixoInversoGif,
      },
      {
        name: 'Elevação frontal',
        gif: OmbroElevacaoFrontalGif,
      },
      {
        name: 'Elevação lateral',
        gif: OmbroElevacaoLateralGif,
      },
    ],
  },
  triceps: {
    title: 'Tríceps',
    description:
      'Músculo responsável pela extensão do cotovelo, muito ativado em empurrões, mergulho na máquina, polia alta e movimentos de coice.',
    exercises: [
      { name: 'Extensão de tríceps deitado', gif: TricepsExtensaoGif },
      { name: 'Mergulho na máquina', gif: TricepsMergulhoGif },
      { name: 'Polia alta com corda', gif: TricepsPoliaAltaGif },
      { name: 'Tríceps coice', gif: TricepsCoiceGif },
    ],
  },
  abdomen: {
    title: 'Abdômen',
    description:
      'Grupo muscular responsável pela estabilização do tronco e postura. Muito ativado em exercícios de flexão do tronco, máquinas, polias e movimentos de suspensão.',
    exercises: [
      { name: 'Abdominal infra nas paralelas', gif: AbdomenInfraGif },
      { name: 'Abdominal na máquina', gif: AbdomenMaquinaGif },
      { name: 'Abdominal na polia', gif: AbdomenPoliaGif },
      { name: 'Abdominal reto (tradicional)', gif: AbdomenRetoGif },
    ],
  },
  pernas: {
    title: 'Pernas',
    description:
      'Inclui coxas e panturrilhas. Suportam o peso do corpo, ajudam na circulação e são muito exigidas em agachamentos, leg press e corridas.',
    exercises: [
      { name: 'Agachamento búlgaro', gif: PernasAgachamentoBulgaroGif },
      { name: 'Agachamento hack', gif: PernasAgachamentoHackGif },
      { name: 'Cadeira extensora', gif: PernasCadeiraExtensoraGif },
      { name: 'Leg press', gif: PernasLegPressGif },
      { name: 'Panturrilha Sentado na Máquina', gif: PernasPanturrilhaMaquinaGif },
    ],
  },
  gluteos: {
    title: 'Glúteos',
    description:
      'Músculos fortes que estabilizam o quadril e ajudam em agachamentos, subidas, corridas e levantamento terra. Importantes para força, potência e proteção da coluna.',
    exercises: [
      { name: 'Flexora deitada', gif: GluteoFlexoraDeitadaGif },
      { name: 'Glúteos no cabo', gif: GluteoNoCaboGif },
      { name: 'Levantamento terra', gif: GluteoLevantamentoTerraGif },
      { name: 'Stiff', gif: GluteoStiffGif },
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
  const normalized = String(label || '').toLowerCase();
  return MUSCLE_GROUPS.find(
    (group) =>
      group.label.toLowerCase() === normalized ||
      group.value.toLowerCase() === normalized
  );
};

const getSportByLabel = (label) => {
  const normalized = String(label || '').toLowerCase();
  return SPORTS.find(
    (sport) => sport.label.toLowerCase() === normalized || sport.value.toLowerCase() === normalized
  );
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

const defaultSchedule = WEEK_DAYS.map((day) => ({
  day,
  workout_id: '',
  time: '',
  reminder: false
}));

const formatExerciseResume = (exercise) => {
  const base = `${exercise.name || 'Exercício'} ${exercise.sets || 0}x${exercise.reps || 0}`;
  const weightPart = exercise.weight ? ` – ${exercise.weight}kg` : '';
  return `${base}${weightPart}`;
};

const formatSessionDate = (rawDate) => {
  if (!rawDate) return '';

  const value = String(rawDate);

  // Pega só YYYY-MM-DD (formato do Supabase)
  const isoDate = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  // Fallback para Date normal
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('pt-BR');
  }

  return value;
};

const WorkoutRestTimer = ({
  restDuration,
  restCountdown,
  restFinished,
  onChangeDuration,
  onStart,
}) => (
  <div
    style={{
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}
  >
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 600 }}>Timer de descanso</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Escolha um tempo e inicie para contar o descanso do exercício.
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {[30, 45, 60, 90].map((sec) => (
          <button
            key={sec}
            className={restDuration === sec ? 'primary small' : 'ghost small'}
            onClick={() => onChangeDuration(sec)}
          >
            {sec}s
          </button>
        ))}
      </div>
    </div>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        {restCountdown || restDuration}s
      </div>
      <button className="primary" onClick={onStart}>
        Iniciar descanso
      </button>
    </div>
    {restFinished && (
      <div style={{ color: '#50be78', fontWeight: 600 }}>Descanso finalizado!</div>
    )}
  </div>
);

const ViewWorkoutModal = ({
  open,
  workout,
  onClose,
  onCompleteToday,
  muscleMap,
  sportsMap,
  restDuration,
  restCountdown,
  restFinished,
  onChangeDuration,
  onStart,
}) => {
  // novo estado para o “detalhe” selecionado
  const [infoTarget, setInfoTarget] = useState(null);

  // Modal de visualização de treino
  if (!open || !workout) return null;

  const muscleGroups = Array.isArray(workout.muscleGroups) ? workout.muscleGroups : [];
  const sportsActivities = Array.isArray(workout.sportsActivities)
    ? workout.sportsActivities
    : [];

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
          <button className="ghost" onClick={onClose}>
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
                    const key = (def?.value || mg || '').toString().toLowerCase();
                    const info = MUSCLE_INFO[key];

                    return (
                      <div
                        key={mg}
                        className="chip chip-with-image"
                        style={{ cursor: info ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (!info) return;
                          setInfoTarget({
                            type: 'muscle',
                            id: key,
                            label: def?.label || mg,
                            description: info.description,
                            exercises: info.exercises || [],
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
                  {infoTarget.exercises.map((ex, index) => {
                    const gifSrc = ex.gif || (ex.file ? `/src/assets/exercise/Quadríceps/${ex.file}` : '');

                    return (
                      <div key={index} style={{ marginBottom: '30px' }}>
                        <h3 style={{ marginBottom: '10px' }}>{ex.name}</h3>
                        <img
                          src={gifSrc}
                          alt={ex.name}
                          style={{
                            width: '100%',
                            maxWidth: '320px',
                            height: 'auto',
                            borderRadius: '10px',
                            display: 'block',
                            margin: '0 auto'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="workout-timer-section">
            <div className="field">
              <label>Timer de descanso</label>
              <WorkoutRestTimer
                restDuration={restDuration}
                restCountdown={restCountdown}
                restFinished={restFinished}
                onChangeDuration={onChangeDuration}
                onStart={onStart}
              />
            </div>
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

const WorkoutRoutine = ({ apiBaseUrl = import.meta.env.VITE_API_BASE_URL, pushToast }) => {
  const [activeTab, setActiveTab] = useState('config');
  const [workoutForm, setWorkoutForm] = useState({
    id: null,
    name: '',
    muscleGroups: [],
    sportsActivities: [],
    exercises: [],
  });
  const [routines, setRoutines] = useState([]);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [userId, setUserId] = useState('');
  const [viewWorkout, setViewWorkout] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [restDuration, setRestDuration] = useState(60);
  const [restCountdown, setRestCountdown] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restFinished, setRestFinished] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [historyRange, setHistoryRange] = useState({ from: '', to: '' });
  const [progress, setProgress] = useState({ totalSessions: 0, byMuscleGroup: {} });
  const [createReminder, setCreateReminder] = useState(false);
  const [sessionReminder, setSessionReminder] = useState(false);

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
      const d = new Date(session.date);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === year && d.getMonth() === month;
    });

    // Dias treinados (dias únicos no mês)
    const uniqueDays = new Set(
      sessionsThisMonth
        .map((s) => s.date)
        .filter(Boolean)
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
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime())) return;
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
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime())) return;
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
      const date = new Date(session.date);
      if (Number.isNaN(date.getTime())) return;
      if (date < start || date > today) return;
      const key = date.toISOString().slice(0, 10);
      buckets[key] = (buckets[key] || 0) + 1;
    });

    return Array.from({ length: 30 }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = day.toISOString().slice(0, 10);
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
      const date = new Date(session.date);
      if (Number.isNaN(date.getTime())) return;
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

    return {
      ...item,
      muscleGroups,
      sports: sportsActivities,
      sportsActivities,
      exercises: Array.isArray(item?.exercises) ? item.exercises : [],
    };
  };

  const loadRoutines = async () => {
    try {
      if (!userId) {
        notify('Perfil do usuário não carregado.', 'warning');
        return;
      }
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/workout/routines?userId=${userId}`);
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

  const loadSchedule = async () => {
    try {
      if (!userId) {
        notify('Perfil do usuário não carregado.', 'warning');
        return;
      }

      const data = await fetchJson(`${apiBaseUrl}/workout-schedule?user_id=${userId}`);

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
      if (historyRange.from) query.append('from', historyRange.from);
      if (historyRange.to) query.append('to', historyRange.to);
      const data = await fetchJson(`${apiBaseUrl}/api/workouts/sessions?${query.toString()}`);
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
      const data = await fetchJson(`${apiBaseUrl}/api/workouts/progress?userId=${userId}&period=month`);
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
      exercises: template.exercises || [],
    });
    setViewWorkout({ ...template, sportsActivities: normalizedSports });
    setIsViewModalOpen(true);
  };

  const handleCloseViewWorkout = () => {
    setIsViewModalOpen(false);
    setViewWorkout(null);
  };

  const handleSaveRoutine = async () => {
    if (!workoutForm.name.trim()) {
      notify('Informe o nome do treino.', 'warning');
      return;
    }
    if (!workoutForm.muscleGroups.length) {
      notify('Selecione pelo menos um grupo muscular.', 'warning');
      return;
    }

    const payload = {
      userId,
      name: workoutForm.name,
      muscleGroups: workoutForm.muscleGroups,
      sportsActivities: workoutForm.sportsActivities,
    };

    try {
      setLoading(true);
      let response;
      if (workoutForm.id) {
        response = await fetch(`${apiBaseUrl}/api/workout/routines/${workoutForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`${apiBaseUrl}/api/workout/routines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const saved = await response.json();

      if (!response.ok) {
        throw new Error(saved?.error || 'Não foi possível salvar o treino.');
      }

      setWorkoutForm({ id: null, name: '', muscleGroups: [], sportsActivities: [], exercises: [] });

      setRoutines((prev) => {
        if (workoutForm.id) {
          return prev.map((routine) => (routine.id === saved.id ? normalizeRoutineFromApi(saved) : routine));
        }
        return [...prev, normalizeRoutineFromApi(saved)];
      });

      if (createReminder) {
        const reminderPayload = {
          type: 'workout',
          workoutName: saved?.name || workoutForm.name,
          date: new Date().toISOString().slice(0, 10),
        };
        await fetchJson(`${apiBaseUrl}/api/workouts/reminders`, {
          method: 'POST',
          body: JSON.stringify(reminderPayload),
        });
      }

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
        `${apiBaseUrl}/api/workout/routines/${id}?userId=${userId}`,
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

  const handleScheduleChange = (day, field, value) => {
    setSchedule((prev) =>
      prev.map((slot) => (slot.day === day ? { ...slot, [field]: value } : slot))
    );
  };

  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true);

      const normalizedSchedule = (Array.isArray(schedule) ? schedule : []).map((item, index) => {
        const weekday = Number(item.weekday || item.dayIndex || index + 1);
        return {
          weekday,
          workout_id: item.workout_id || item.workoutId || null,
          time: item.time || null,
          reminder: item.reminder !== undefined ? !!item.reminder : true,
        };
      });

      const payload = { schedule: normalizedSchedule, userId, user_id: userId };

      await fetchJson(`${apiBaseUrl}/workout-schedule`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify('Semana de treino salva!', 'success');
    } catch (err) {
      console.warn('Erro ao salvar semana de treino', err);
      notify(err.message || 'Não foi possível salvar a semana.', 'danger');
    } finally {
      setSavingSchedule(false);
    }
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

    const sessionPayload = {
      userId,
      templateId: source.id || null,
      date: new Date().toISOString().slice(0, 10),
      name: source.name,
      muscleGroups: source.muscleGroups || source.muscle_groups || [],
      sportsActivities,
      sports: sportsActivities,
      sports_activities: sportsActivities,
      exercises: (source.exercises || []).map((ex) => ({
        ...ex,
        completed: true,
      })),
      completed: true,
    };

    try {
      const saved = await fetchJson(`${apiBaseUrl}/api/workouts/sessions`, {
        method: 'POST',
        body: JSON.stringify(sessionPayload),
      });

      const normalizedSaved = {
        ...saved,
        muscleGroups: Array.isArray(saved?.muscleGroups)
          ? saved.muscleGroups
          : Array.isArray(source.muscleGroups)
            ? source.muscleGroups
            : [],
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
        await fetchJson(`${apiBaseUrl}/api/workouts/reminders`, {
          method: 'POST',
          body: JSON.stringify(reminderPayload),
        });
      }
      notify('Treino de hoje concluído!', 'success');
      return normalizedSaved;
    } catch (err) {
      console.error('Erro ao concluir treino', err);
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
    if (!userId) return;
    loadRoutines();
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadSessions();
    } else if (activeTab === 'progress') {
      loadProgress();
      loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, historyRange]);

  useEffect(() => {
    if (!restRunning) return;
    if (restCountdown <= 0) {
      setRestRunning(false);
      setRestFinished(true);
      return;
    }
    const timer = setTimeout(() => setRestCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [restRunning, restCountdown]);

  const startRestTimer = () => {
    setRestFinished(false);
    setRestCountdown(restDuration);
    setRestRunning(true);
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

  return (
    <div className="workout-card">
      {/* COLUNA ESQUERDA – Rotina de Treino (aba + config + histórico + progresso) */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="title" style={{ margin: 0 }}>Rotina de Treino</h3>
          <div className="muted" style={{ fontSize: 13 }}>
            Monte templates detalhados, salve o histórico e acompanhe o progresso.
          </div>
        </div>

        <div className="sep" style={{ marginTop: 12 }}></div>

        <div className="row" style={{ gap: 12, margin: '10px 0 18px' }}>
          <button
            className={activeTab === 'config' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('config')}
          >
            Configuração
          </button>
          <button
            className={activeTab === 'history' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('history')}
          >
            Histórico
          </button>
          <button
            className={activeTab === 'progress' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('progress')}
          >
            Progresso
          </button>
        </div>

        {/* Aba CONFIG – manter apenas "Novo Template de Treino" + "Treinos cadastrados" aqui */}
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* NOVO TREINO */}
            <div>
              <h4 className="title" style={{ marginBottom: 12 }}>Novo Template de Treino</h4>
              <label>Nome do treino</label>
              <input
                value={workoutForm.name}
                onChange={(e) => setWorkoutForm({ ...workoutForm, name: e.target.value })}
                placeholder="Ex.: Treino A – Peito e Tríceps"
              />

              <div className="sep" style={{ margin: '12px 0 6px' }}></div>
              <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>Grupos musculares</div>
              <div className="muscle-grid">
                {MUSCLE_GROUPS.map((group) => {
                  const active = workoutForm.muscleGroups.includes(group.value);
                  return (
                    <button
                      key={group.value}
                      type="button"
                      className={active ? 'muscle-card active' : 'muscle-card'}
                      onClick={() => toggleMuscleGroup(group.value)}
                    >
                      <div className="muscle-image-wrapper">
                        <img src={group.image} alt={group.label} className="muscle-image" />
                      </div>
                      <span className="muscle-label">{group.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="muted" style={{ margin: '14px 0 6px', fontSize: 13 }}>
                Esportes / atividades
              </div>
              <div className="muscle-grid">
                {SPORTS.map((sport) => {
                  const active = workoutForm.sportsActivities.includes(sport.value);
                  return (
                    <button
                      key={sport.value}
                      type="button"
                      className={active ? 'muscle-card active' : 'muscle-card'}
                      onClick={() => toggleSport(sport.value)}
                    >
                      <div className="muscle-image-wrapper">
                        <img src={sport.image} alt={sport.label} className="muscle-image" />
                      </div>
                      <span className="muscle-label">{sport.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                <div className="row" style={{ gap: 8 }}>
                  <button className="primary" onClick={handleSaveRoutine} disabled={loading}>
                    {loading ? 'Salvando...' : workoutForm.id ? 'Cadastrar treino' : 'Salvar template'}
                  </button>
                </div>
              </div>
            </div>

            {/* TREINOS CADASTRADOS */}
            <div>
              <h4 className="title" style={{ marginBottom: 12 }}>Treinos cadastrados</h4>
              {!routines.length && <div className="muted">Nenhum treino cadastrado.</div>}
              {routines.length > 0 && (
                <div className="table workout-routines-scroll">
                  {routines.map((template) => (
                    <div
                      key={template.id || template.name}
                      className="workout-template-item table-row"
                    >
                      <div className="workout-template-header">
                        <strong>{template.name}</strong>
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
                          className="ghost"
                          onClick={() => {
                            const sportsActivities = syncSportsFromTemplate(
                              template.sportsActivities,
                              template.sports
                            );

                            setWorkoutForm({
                              ...template,
                              muscleGroups: Array.isArray(template.muscleGroups)
                                ? template.muscleGroups
                                : template.muscle_groups || [],
                              sportsActivities,
                              sports: sportsActivities,
                            });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="ghost"
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
                        <button
                          type="button"
                          className="ghost small btn-danger-outline"
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
          </div>
        )}

        {/* Aba HISTÓRICO – copiar exatamente o conteúdo atual do bloco activeTab === 'history' */}
        {activeTab === 'history' && (
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
              <div className="table history-list workout-history-scroll">
                {sessions.map((session) => (
                  <details key={session.id} className="table-row" open>
                    <summary style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 600 }}>{session.name}</div>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {formatSessionDate(session.date || session.performed_at)}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {(session.muscleGroups || []).map((g) => muscleMap[g]?.label || g).join(', ')}
                      </div>
                      {Array.isArray(session.sportsActivities) && session.sportsActivities.length > 0 && (
                        <div className="muted" style={{ fontSize: 13 }}>
                          Esportes/atividades:{' '}
                          {session.sportsActivities
                            .map((sport) => sportsMap[sport]?.label || sport)
                            .join(', ')}
                        </div>
                      )}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {(session.exercises || []).map(formatExerciseResume).join('; ')}
                      </div>
                    </summary>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(session.exercises || []).map((ex) => (
                        <div
                          key={ex.id}
                          style={{
                            border: '1px solid rgba(255,255,255,0.08)',
                            padding: 12,
                            borderRadius: 10,
                            background: '#0f131c',
                          }}
                        >
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <strong>{ex.name}</strong>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {muscleMap[ex.muscleGroupId]?.label || ex.muscleGroupId}
                            </span>
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            Séries: {ex.sets} · Repetições: {ex.reps} · Peso: {ex.weight || '--'}kg · Descanso: {ex.restSeconds}s
                          </div>
                          {ex.notes && (
                            <div style={{ marginTop: 6, fontSize: 13 }}>
                              <strong>Anotações:</strong> {ex.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba PROGRESSO – copiar exatamente o conteúdo atual do bloco activeTab === 'progress' */}
        {activeTab === 'progress' && (
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
                style={{
                  borderRadius: 12,
                  background: '#131722',
                  padding: 16,
                  border: '1px solid rgba(255,255,255,0.08)',
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
                style={{
                  borderRadius: 12,
                  background: '#131722',
                  padding: 16,
                  border: '1px solid rgba(255,255,255,0.08)',
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
              style={{
                borderRadius: 12,
                background: '#131722',
                padding: 16,
                border: '1px solid rgba(255,255,255,0.08)',
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
                              background: '#50be78',
                            }}
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
                <div key={muscle}>
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
                        background: '#50be78',
                      }}
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
      </section>

      {/* COLUNA DIREITA – Semana de Treino (só aparece na aba de configuração) */}
      {activeTab === 'config' && (
        <section className="card" style={{ marginTop: 16 }}>
          <h4 className="title" style={{ marginBottom: 12 }}>Semana de Treino</h4>

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
                style={{
                  borderRadius: 12,
                  background: '#131722',
                  padding: 16,
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
                  border: '1px solid rgba(255,255,255,0.08)',
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
                  <select
                    value={slot.workout_id}
                    onChange={(e) => handleScheduleChange(slot.day, 'workout_id', e.target.value)}
                    style={{
                      background: '#0f131c',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                    }}
                  >
                    <option value="">Selecione um treino</option>
                    {routines.map((item) => (
                      <option key={item.id || item.name} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
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
                    <span style={{ color: '#d3d8e6' }}>Ativar lembrete</span>
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
                        onChange={(e) => handleScheduleChange(slot.day, 'reminder', e.target.checked)}
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

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              className="primary"
              onClick={handleSaveSchedule}
              disabled={savingSchedule || !hasRoutines}
            >
              {savingSchedule ? 'Salvando...' : 'Salvar semana de treino'}
            </button>
          </div>

          {!hasRoutines && (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Cadastre ao menos um treino para montar a semana.
            </div>
          )}
        </section>
      )}

      {/* COLUNA DIREITA – Gráficos de Progresso (só aparece na aba de progresso) */}
      {activeTab === 'progress' && (
        <section className="card" style={{ marginTop: 16 }}>
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
        restDuration={restDuration}
        restCountdown={restCountdown}
        restFinished={restFinished}
        onChangeDuration={setRestDuration}
        onStart={startRestTimer}
      />
    </div>
  );
};

export default WorkoutRoutine;
