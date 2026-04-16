import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkoutRoutine from './components/WorkoutRoutine.jsx';
import FoodDiary from './components/FoodDiary.jsx';
import GeneralReport from './components/GeneralReport.jsx';
import FinanceReports from './components/FinanceReports.jsx';
import './styles.css';
import { loadGoals } from './services/foodDiaryProfile';
import { supabase as sharedSupabase } from './supabaseClient';
import Agenda from './pages/Agenda';
import Supervisor from './pages/Supervisor';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});
const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const defaultTxForm = {
  type: 'income',
  amount: '',
  date: '',
  description: '',
  category: ''
};

const defaultTxFilters = {
  from: '',
  to: '',
  type: '',
  category: '',
  description: ''
};

const getTodayMonth = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
};

const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);

  const toISO = (dt) => {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return { from: toISO(first), to: toISO(last) };
};

const defaultGeneralReportGoals = {
  calories: 2000,
  protein: 120,
  water: 2.5,
};

const defaultEventForm = {
  title: '',
  date: '',
  start: '',
  end: '',
  notes: ''
};

const defaultEventFilters = {
  from: '',
  to: '',
  search: ''
};

const defaultUserForm = {
  name: '',
  username: '',
  password: '',
  whatsapp: '',
  role: 'user',
  affiliate_id: '',
  plan_type: ''
};

const defaultEditUserForm = {
  name: '',
  email: '',
  whatsapp: '',
  affiliate_id: '',
  plan_type: '',
};

const createDefaultAffiliateForm = () => ({
  name: '',
  whatsapp: '',
  email: '',
  pix_key: '',
});

const createDefaultAffiliatePromotionDraft = () => ({
  linkedUserId: '',
  name: '',
  email: '',
  whatsapp: '',
  code: '',
  status: 'active',
});

const normalizeAffiliateCodeBase = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .toUpperCase();

const generateAffiliateCodeSuggestion = (name = '') => {
  const base = normalizeAffiliateCodeBase(name)
    .split(/\s+/)
    .filter(Boolean)
    .join('')
    .slice(0, 4)
    .padEnd(3, 'AFI');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${base}${suffix}`;
};

const normalizeBaseUrl = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
};

const LOCAL_STORAGE_KEY = 'gp-react-data';
const OWNER_EMAIL = 'gestaopessoaloficial@gmail.com';
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isOwnerUser = (user) => normalizeEmail(user?.email || user?.username) === OWNER_EMAIL;

const getLocalSnapshot = () => {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { transactions: [], events: [] };
    const parsed = JSON.parse(raw);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch (err) {
    console.warn('Erro ao ler cache local', err);
    return { transactions: [], events: [] };
  }
};

const persistLocalSnapshot = (partial) => {
  const current = getLocalSnapshot();
  const merged = { ...current, ...partial };
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
};

const formatCurrency = (value) => currencyFormatter.format(Number(value || 0));
const formatPercent = (value) => percentFormatter.format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch (err) {
    return value;
  }
};

const formatMetricValue = (value, unit = '', decimals = 1) => {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const formatted = numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${formatted} ${unit}` : formatted;
};

const resolveUserCurrentWeight = (user) => {
  const candidate =
    user?.latest_weight_kg ??
    user?.current_weight ??
    user?.weight ??
    user?.weight_kg ??
    null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDateSafe = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getTrialEnd = (user) => {
  if (!user) return null;
  const explicitEnd = parseDateSafe(user.trial_end_at || user.trialEndAt);
  if (explicitEnd) return explicitEnd;
  const createdAt = parseDateSafe(user.created_at || user.createdAt);
  if (!createdAt) return null;
  const end = new Date(createdAt);
  end.setDate(end.getDate() + 30);
  return end;
};

const formatDateBR = (value) => {
  const parsed = parseDateSafe(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('pt-BR');
};

const isTrialPlan = (user) => String(user?.plan_type || '').toLowerCase() === USER_PLAN_TYPES.TRIAL;

const isTrialActive = (user) => {
  if (!isTrialPlan(user)) return false;
  const trialEnd = getTrialEnd(user);
  return Boolean(trialEnd && Date.now() < trialEnd.getTime());
};

const getDaysLeft = (endDate) => {
  if (!endDate) return null;
  const diffMs = endDate.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
};

const formatTrialLabel = (daysLeft) => {
  if (daysLeft === null || Number.isNaN(daysLeft)) return '-';
  if (daysLeft <= 0) return 'Teste acabou';
  if (daysLeft === 1) return 'Falta 1 dia';
  return `Faltam ${daysLeft} dias`;
};

const getTrialDaysLeft = (user) => {
  if (!isTrialPlan(user)) return null;
  return getDaysLeft(getTrialEnd(user));
};

const getUserHeaderTrialMessage = (user) => {
  if (!isTrialPlan(user)) return '';
  const daysLeft = getTrialDaysLeft(user);
  if (daysLeft === null || Number.isNaN(daysLeft) || daysLeft <= 0) return 'Seu teste grátis terminou';
  if (daysLeft === 1) return 'Falta 1 dia para acabar o teste grátis';
  return `Faltam ${daysLeft} dias para acabar o teste grátis`;
};

const formatTimeRange = (start, end) => {
  if (!start && !end) return '-';
  return [start, end].filter(Boolean).join(' – ');
};

const BILLING_DUE_DAY = 20;
const USER_PLAN_TYPES = Object.freeze({
  TRIAL: 'trial',
  NORMAL: 'normal',
  PROMO: 'promo',
});

const USER_PLAN_OPTIONS = [
  { value: USER_PLAN_TYPES.TRIAL, label: '🟢 Teste grátis (30 dias)' },
  { value: USER_PLAN_TYPES.NORMAL, label: '🔵 Plano normal — R$120/mês' },
  { value: USER_PLAN_TYPES.PROMO, label: '🟣 Plano promocional — R$80/mês (fidelidade de 4 meses)' },
];
const PLAN_MONTHLY_VALUES = Object.freeze({
  [USER_PLAN_TYPES.TRIAL]: 0,
  [USER_PLAN_TYPES.NORMAL]: 120,
  [USER_PLAN_TYPES.PROMO]: 80,
  vip: 200,
});

const getPlanMonthlyValue = (planType) => {
  const normalized = String(planType || '').toLowerCase();
  return PLAN_MONTHLY_VALUES[normalized] ?? PLAN_MONTHLY_VALUES[USER_PLAN_TYPES.NORMAL];
};

const getPlanVisual = (planType) => {
  const normalized = String(planType || '').toLowerCase();
  if (normalized === USER_PLAN_TYPES.TRIAL) {
    return { label: 'TESTE', className: 'badge-plan-trial' };
  }
  if (normalized === USER_PLAN_TYPES.PROMO) {
    return { label: 'PROMO', className: 'badge-plan-promo' };
  }
  return { label: 'NORMAL', className: 'badge-plan-normal' };
};

const getCurrentCycleStart = (today = new Date()) => {
  const cursor = new Date(today);
  const referenceMonth = cursor.getDate() >= BILLING_DUE_DAY
    ? cursor.getMonth()
    : cursor.getMonth() - 1;
  const referenceYear = referenceMonth >= 0 ? cursor.getFullYear() : cursor.getFullYear() - 1;
  const month = referenceMonth >= 0 ? referenceMonth : 11;
  const cycleStart = new Date(referenceYear, month, BILLING_DUE_DAY);
  cycleStart.setHours(0, 0, 0, 0);
  return cycleStart;
};

const isUserPaidForCurrentCycle = (user, today = new Date()) => {
  if (!user) return false;
  if (isTrialActive(user)) return true;
  const lastPayment = user.last_payment_at || user.last_paid_at || user.billing_last_paid_at;
  if (!lastPayment) return false;
  const parsed = new Date(lastPayment);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= getCurrentCycleStart(today);
};

const computeEffectiveSubscriptionStatus = (user, today = new Date()) => {
  if (!user) return 'active';
  if (isTrialActive(user)) return 'active';

  if (user.subscription_status === 'inactive') return 'inactive';
  if (!isUserPaidForCurrentCycle(user, today)) return 'pending';

  return 'active';
};

const renderFinancialStatus = (user) => {
  switch (user?.financial_status) {
    case 'TRIAL':
      return <span className="financial-status financial-status-green">🟢 Teste ativo</span>;
    case 'TRIAL_EXPIRED':
      return <span className="financial-status financial-status-red">🔴 Teste encerrado</span>;
    case 'PAID':
      return <span className="financial-status financial-status-green">🟢 Pago</span>;
    case 'DUE_TODAY':
      return <span className="financial-status financial-status-yellow">🟡 Vence hoje</span>;
    case 'OVERDUE':
      return <span className="financial-status financial-status-red">🔴 Atrasado</span>;
    default:
      return <span className="financial-status financial-status-gray">⚪ Pendente</span>;
  }
};

const getCurrentPeriodMonth = (today = new Date()) => {
  const cursor = new Date(today);
  return new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString().slice(0, 10);
};

const randomId = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

const useSupabaseClient = () => {
  const [client, setClient] = useState(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    try {
      setClient(sharedSupabase);
      setConfigError('');
    } catch (err) {
      console.error('Erro ao iniciar Supabase', err);
      setConfigError('Não foi possível iniciar o cliente do Supabase.');
    }
  }, []);

  return { client, configError };
};

const useAuth = (client) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [supabaseChecked, setSupabaseChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('gp-session');
      if (!raw) {
        setLocalLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw);
      setSession(parsed);

      // se existir profile_id, usa ele; senão cai pro id normal
      setProfile({
        id: parsed.user.profile_id || parsed.user.id,
        name: parsed.user.name,
        role: parsed.user.role,
      });
    } catch (err) {
      console.warn('Erro ao carregar sessão local', err);
    } finally {
      setLocalLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!client) {
      setSupabaseChecked(true);
      return;
    }

    let isMounted = true;
    const apiBase = normalizeBaseUrl(
      window.APP_CONFIG?.apiBaseUrl ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_BACKEND_URL
    );

    const buildSessionFromSupabase = async (supabaseSession) => {
      if (!supabaseSession?.user) return null;

      let profileRow = null;
      try {
        const accessToken = supabaseSession?.access_token;
        if (accessToken && apiBase && /^https?:\/\//i.test(apiBase)) {
          const response = await fetch(`${apiBase}/auth/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (response.ok) {
            const payload = await response.json();
            profileRow = payload?.profile || null;
          }
        }
      } catch (err) {
        console.warn('Erro ao restaurar perfil do Supabase', err);
      }

      return {
        user: {
          id: supabaseSession.user.id,
          profile_id: profileRow?.id,
          name:
            profileRow?.name ||
            supabaseSession.user.user_metadata?.name ||
            supabaseSession.user.email ||
            'Usuário',
          role: profileRow?.role || 'user',
          email: profileRow?.email || supabaseSession.user.email,
        },
      };
    };

    const syncSupabaseSession = async () => {
      try {
        const { data } = await client.auth.getSession();
        const supabaseSession = data?.session;
        if (!supabaseSession?.user) {
          setSupabaseChecked(true);
          return;
        }

        const nextSession = await buildSessionFromSupabase(supabaseSession);
        if (!nextSession || !isMounted) return;

        setSession(nextSession);
        setProfile({
          id: nextSession.user.profile_id || nextSession.user.id,
          name: nextSession.user.name,
          role: nextSession.user.role,
        });
        window.localStorage.setItem('gp-session', JSON.stringify(nextSession));
      } catch (err) {
        console.warn('Erro ao restaurar sessão do Supabase', err);
      } finally {
        if (isMounted) {
          setSupabaseChecked(true);
        }
      }
    };

    syncSupabaseSession();

    const { data: authListener } = client.auth.onAuthStateChange(
      async (_event, supabaseSession) => {
        if (!isMounted) return;

        if (!supabaseSession?.user) {
          setSession(null);
          setProfile(null);
          window.localStorage.removeItem('gp-session');
          return;
        }

        const nextSession = await buildSessionFromSupabase(supabaseSession);
        if (!nextSession || !isMounted) return;

        setSession(nextSession);
        setProfile({
          id: nextSession.user.profile_id || nextSession.user.id,
          name: nextSession.user.name,
          role: nextSession.user.role,
        });
        window.localStorage.setItem('gp-session', JSON.stringify(nextSession));
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (localLoaded && supabaseChecked) {
      setLoadingSession(false);
    }
  }, [localLoaded, supabaseChecked]);

  return { session, profile, loadingSession, setSession, setProfile };
};


const Toast = ({ toast, onClose }) => {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.variant}`}>
      <div>{toast.message}</div>
      <button className="ghost small" onClick={onClose}>Fechar</button>
    </div>
  );
};

const LoginScreen = ({ form, onChange, onSubmit, loading, error, configError }) => (
  <div className="login-screen">
    <div className="login-card">
      <div className="login-brand">
        <div className="logo-dot"></div>
        <div>
          <h1>Gestão Pessoal</h1>
        </div>
      </div>
      {configError && <div className="login-error">{configError}</div>}
      {error && <div className="login-error">{error}</div>}
      <label>E-mail</label>
      <input
        type="email"
        placeholder="voce@email.com"
        value={form.email}
        onChange={(e) => onChange({ ...form, email: e.target.value })}
      />
      <label>Senha</label>
      <input
        type="password"
        placeholder="••••••••"
        value={form.password}
        onChange={(e) => onChange({ ...form, password: e.target.value })}
      />
      <button className="primary full" onClick={onSubmit} disabled={loading || !form.email || !form.password}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
      {import.meta.env.DEV && (
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Configure o arquivo <strong>env.js</strong> com os dados do seu projeto no Supabase.
        </p>
      )}
    </div>
  </div>
);

const DashboardHeader = ({ apiUrl, profile, onLogout, profileDetails }) => {
  const trialMessage = getUserHeaderTrialMessage(profileDetails || profile);

  return (
    <header>
      <div className="header-info">
        <h1>Gestão Pessoal – Dashboard</h1>
        <div
          className="muted"
          style={{ visibility: import.meta.env.DEV ? 'visible' : 'hidden' }}
        >
          Supabase: <span id="apiUrl">{apiUrl || 'não configurado'}</span>
        </div>
      </div>
      <div className="user-session">
        <div className="user-info">
          <strong>{profile?.name || 'Usuário'}</strong>
          <span className="badge" id="userRole">{(profile?.role || 'user').toUpperCase()}</span>
          {trialMessage ? (
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {trialMessage}
            </div>
          ) : null}
        </div>
        <button className="ghost small" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
};

const SummaryKpis = ({ totals }) => (
  <div className="summary">
    <div className="kpi card-resumo">
      <small>Total Receitas</small>
      <strong id="kpiIncome">{formatCurrency(totals.income)}</strong>
    </div>
    <div className="kpi card-resumo">
      <small>Total Despesas</small>
      <strong id="kpiExpense">{formatCurrency(totals.expense)}</strong>
    </div>
    <div className="kpi card-resumo">
      <small>Saldo</small>
      <strong id="kpiBalance">{formatCurrency(totals.balance)}</strong>
    </div>
  </div>
);

const TransactionsTable = ({ items, onEdit, onDelete }) => (
  <div className="transacoes-scroll-container">
    <table className="transactions-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th>Categoria</th>
          <th className="right">Valor</th>
          <th className="right">Ações</th>
        </tr>
      </thead>
      <tbody id="txTable">
        {items.length === 0 && (
          <tr>
            <td colSpan="6" style={{ textAlign: 'center', padding: '24px 0' }} className="muted">
              Nenhuma transação encontrada para este filtro.
            </td>
          </tr>
        )}
        {items.map((tx) => (
          <tr key={tx.id} className="transacao-item">
            <td>{formatDate(tx.date)}</td>
            <td>
              <span className={`badge badge-${tx.type} ${tx.type === 'income' ? 'receita' : 'despesa'}`}>
                {tx.type === 'income' ? '💵 Receita' : '💸 Despesa'}
              </span>
            </td>
            <td>{tx.description}</td>
            <td>{tx.category || '-'}</td>
            <td className={`right ${tx.type === 'income' ? 'receita' : 'despesa'}`}>{formatCurrency(tx.amount)}</td>
            <td className="right">
              <div className="table-actions">
                <button className="icon-button" onClick={() => onEdit(tx)} title="Editar">
                  ✏️
                </button>
                <button className="icon-button" onClick={() => onDelete(tx)} title="Excluir">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const EventsTable = ({ items, onEdit, onDelete }) => (
  <div className="events-table-container">
    <table className="events-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Título</th>
          <th>Horário</th>
          <th>Notas</th>
          <th className="right">Ações</th>
        </tr>
      </thead>
      <tbody id="evTable">
        {items.length === 0 && (
          <tr>
            <td colSpan="5" style={{ textAlign: 'center', padding: '24px 0' }} className="muted">
              Nenhum evento encontrado para este filtro.
            </td>
          </tr>
        )}
        {items.map((ev) => (
          <tr key={ev.id}>
            <td>{formatDate(ev.date)}</td>
            <td>{ev.title}</td>
            <td>{formatTimeRange(ev.start, ev.end)}</td>
            <td>{ev.notes || '-'}</td>
            <td className="right">
              <div className="table-actions">
                <button className="icon-button" onClick={() => onEdit(ev)} title="Editar">
                  ✏️
                </button>
                <button className="icon-button" onClick={() => onDelete(ev)} title="Excluir">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const UsersTable = ({
  items,
  onEdit,
  onDelete,
  onPromoteToAffiliate,
  affiliateNameById,
  currentUser,
  onOpenBodyModal,
  onOpenDailyWeightModal,
  onOpenWeightHistoryModal,
  onOpenGoalsModal,
}) => {
  const safeItems = items || [];

  // 🔐 FILTRO DE SEGURANÇA - ADMIN VE TUDO / USUÁRIO VE SÓ ELE
  const filteredUsers = currentUser?.role === 'admin'
    ? safeItems
    : safeItems.filter((u) => u.id === currentUser?.id);

  return (
    <div className="user-list-wrapper">
      {filteredUsers.length === 0 ? (
        <div className="muted user-empty">Nenhum usuário cadastrado além de você.</div>
      ) : (
        <div className="user-list-scrollless">
          {filteredUsers.map((user) => {
            const isOwner = isOwnerUser(user);
            const isAdminUser = user.role === 'admin' || isOwner;
            const isAffiliate = isOwner || Boolean(user.is_affiliate || user.affiliate_id || user.affiliate_code);
            const canPromoteToAffiliate = !isOwner && !isAdminUser && !isAffiliate;
            const canManageBodyGoals = currentUser?.id === user.id;
            const status = isOwner ? 'active' : (isAdminUser ? 'active' : (user.derived_status || user.subscription_status || 'active'));
            const labelMap = { active: 'ATIVO', pending: 'PENDENTE', inactive: 'INATIVO' };
            const trialEnd = getTrialEnd(user);
            const daysLeft = getDaysLeft(trialEnd);
            const isTrial = isTrialPlan(user);
            const isTrialStillActive = isTrialActive(user);
            const trialEndLabel = formatDateBR(trialEnd);
            const planVisual = getPlanVisual(user.plan_type);
            const affiliateName = affiliateNameById?.[user.affiliate_id] || user.affiliate_name || '-';
            const currentWeight = resolveUserCurrentWeight(user);
            const targetWeight = user?.goal_weight ?? user?.weight_goal ?? user?.target_weight_kg ?? null;
            const goalMode = user?.goal_mode || '-';
            const weightVariation = Number(user?.weight_variation_kg);
            const hasVariation = Number.isFinite(weightVariation);

            return (
              <div key={user.id} className={`event-card user-event-card card-ui ${user._editing ? 'is-editing' : ''}`}>
                <div className="event-date user-event-email">
                  {user.email || user.username || '-'}
                </div>

                <div className="event-content">
                  <div className="event-title">{user.name || user.username || 'Sem nome'}</div>

                  <div className="event-subtitle">{user.whatsapp || 'WhatsApp não informado'}</div>
                  <div className="event-subtitle user-event-meta">
                    <span className="badge">{isOwner ? 'ADMIN' : user.role}</span>
                    {isAffiliate && <span className="badge">AFILIADO</span>}
                    {!isOwner && (
                      <>
                        <span className={`badge badge-${status}`}>
                          {labelMap[status] || status.toUpperCase()}
                        </span>
                        {isAdminUser ? (
                          <span className="financial-status financial-status-green">🟢 Pago</span>
                        ) : (
                          renderFinancialStatus(user)
                        )}
                      </>
                    )}
                  </div>
                  {!isOwner && (
                    <div className="event-subtitle user-event-details">
                      <span>
                        Plano: <span className={`badge ${planVisual.className}`}>{planVisual.label}</span>
                      </span>
                      <span>Afiliado: {affiliateName}</span>
                      {isTrial ? (
                        <>
                          <span>Vencimento do teste: {trialEndLabel}</span>
                          <span>Teste: {isTrialStillActive ? formatTrialLabel(daysLeft) : 'Teste acabou'}</span>
                        </>
                      ) : (
                        <>
                          <span>Vencimento: dia {user.due_day || BILLING_DUE_DAY}</span>
                          <span>Último pagamento: {formatDate(user.last_payment_at || user.last_paid_at)}</span>
                          <span>Teste: {formatTrialLabel(daysLeft)}</span>
                        </>
                      )}
                      <span>Criado em: {formatDate(user.created_at)}</span>
                    </div>
                  )}

                  <div className="sep" style={{ margin: '10px 0' }}></div>
                  <div className="user-body-grid">
                    <div className="body-card">
                      <h3>💪 Corpo</h3>
                      <div className="user-event-details user-card-details-grid">
                        <p>Peso atual: <strong>{formatMetricValue(currentWeight, 'kg')}</strong></p>
                        <p>Meta de peso: <strong>{formatMetricValue(targetWeight, 'kg')}</strong></p>
                        <p>Altura: <strong>{formatMetricValue(user?.height_cm ?? user?.height, 'cm', 0)}</strong></p>
                        <p>Sexo: <strong>{user?.sex || '-'}</strong></p>
                        <p>Idade: <strong>{user?.age || '-'}</strong></p>
                        <p>
                          Variação de peso:{' '}
                          <strong>
                            {hasVariation
                              ? `${weightVariation > 0 ? '+' : ''}${weightVariation.toLocaleString('pt-BR', {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })} kg`
                              : '-'}
                          </strong>
                        </p>
                      </div>
                      {canManageBodyGoals && (
                        <div className="body-actions">
                          <button type="button" className="btn-primary" onClick={() => onOpenDailyWeightModal?.(user)}>
                            Registrar peso
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => onOpenBodyModal?.(user)}>
                            Atualizar corpo
                          </button>
                          <button type="button" className="btn-outline" onClick={() => onOpenWeightHistoryModal?.(user)}>
                            Ver histórico
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="goals-card">
                      <h3>🎯 Metas</h3>
                      <div className="user-event-details user-card-details-grid">
                        <p>Meta de calorias: <strong>{formatMetricValue(user?.calorie_goal, 'kcal', 0)}</strong></p>
                        <p>Meta de proteína: <strong>{formatMetricValue(user?.protein_goal, 'g', 0)}</strong></p>
                        <p>Meta de água: <strong>{formatMetricValue(user?.water_goal_l, 'L')}</strong></p>
                        <p>Modo atual: <strong>{goalMode}</strong></p>
                      </div>
                      {canManageBodyGoals && (
                        <div className="body-actions">
                          <button type="button" className="btn-primary" onClick={() => onOpenGoalsModal?.(user)}>
                            Definir metas
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="event-actions">
                  {(currentUser?.role === 'admin' || currentUser?.id === user.id) && (
                    <button className="btn-edit btn-ui" onClick={() => onEdit(user)} title="Editar usuário">
                      ✏️
                    </button>
                  )}

                  {currentUser?.role === 'admin' && !isOwner && (
                    <button className="btn-delete btn-ui" onClick={() => onDelete(user)} title="Excluir usuário">
                      🗑️
                    </button>
                  )}

                  <div className="user-actions-extra">
                    {!isOwner && canPromoteToAffiliate && (
                      <button
                        type="button"
                        className="btn-ui"
                        onClick={() => onPromoteToAffiliate(user)}
                        title="Tornar afiliado"
                      >
                        🤝
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FinanceHistoryModal = ({ user, history, onClose }) => {
  if (!user) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Histórico financeiro — {user.name}</h2>
        <div className="usuarios-scroll-container" style={{ maxHeight: 320 }}>
          {history.length === 0 && <p className="muted">Nenhum histórico financeiro registrado.</p>}
          {history.map((item) => (
            <div key={item.id} className="event-subtitle">
              <strong>{item.action}</strong> • {formatDate(item.created_at)}
              <div className="muted">Criado por: {item.created_by || '-'}</div>
              {item.notes ? <div className="muted">{item.notes}</div> : null}
            </div>
          ))}
        </div>
        <div className="wizard-actions">
          <button className="btn-ui" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

const FinanceTable = ({ items, affiliateNameById, onMarkPaid, onBlock, onUnblock, onHistory }) => {
  const chargeUser = (message, phone) => {
    const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, '_blank', 'noopener,noreferrer');
  };

  // ⏳ CALCULAR DIAS RESTANTES PARA VENCIMENTO
  const calcularDiasRestantes = (dataVencimento) => {
    if (!dataVencimento) return null;

    const hoje = new Date();
    const vencimento = new Date(dataVencimento);

    // Zera horário pra evitar bug de 1 dia a menos
    hoje.setHours(0, 0, 0, 0);
    vencimento.setHours(0, 0, 0, 0);

    const diffTime = vencimento - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  return (
  <div className="events-table-container finance-table-scroll scroll-container">
    <table className="finance-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Email</th>
          <th>WhatsApp</th>
          <th>Plano</th>
          <th>Afiliado</th>
          <th>Status financeiro</th>
          <th>Acesso</th>
          <th>Último pagamento</th>
          <th>Próximo vencimento</th>
          <th>⏳ Dias restantes</th>
          <th>Valor</th>
          <th>Dias atraso</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={13} className="muted">Nenhum usuário encontrado.</td>
          </tr>
        )}
        {items.map((user) => {
          const dueDay = user.billing_due_day || BILLING_DUE_DAY;
          const isOverdue = user.finance_status === 'overdue';
          const message = isOverdue
            ? `Olá, ${user.name}! Identificamos que sua mensalidade do Gestão Pessoal está em atraso.\nVencimento: dia ${dueDay}.\nPara evitar bloqueio do acesso, pedimos a regularização o quanto antes.\nSe já pagou, desconsidere esta mensagem.`
            : `Olá, ${user.name}! Passando para lembrar que a mensalidade do Gestão Pessoal está em aberto.\nVencimento: dia ${dueDay}.\nCaso já tenha realizado o pagamento, por favor desconsidere esta mensagem.\nSe precisar de suporte, estou à disposição.`;
          const phone = String(user.whatsapp || '').replace(/\D/g, '');
          const isBlocked =
            user.access === 'Inativo' ||
            user.status_acesso === 'Inativo' ||
            user.access === false;
          const isInactive = isBlocked;
          const isTrialExpired = String(user?.trial_status || '').toLowerCase() === 'expired';

          return (
            <tr key={user.id} className={isTrialExpired ? 'finance-row-trial-expired' : ''}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.whatsapp || '-'}</td>
              <td>
                {getPlanVisual(user.plan_type).label}
                {isTrialExpired ? <span className="badge badge-trial-expired">Teste encerrado</span> : null}
              </td>
              <td>{affiliateNameById[user.affiliate_id] || user.affiliate_name || '-'}</td>
              <td>{user.finance_status}</td>
              <td>{isInactive ? 'Inativo' : 'Ativo'}</td>
              <td>{formatDate(user.last_paid_at)}</td>
              <td>{formatDate(user.billing_next_date)}</td>
              <td>
                {(() => {
                  const dias = calcularDiasRestantes(user.trial_end_at || user.billing_next_date);

                  if (dias === null) return '-';

                  if (dias > 1) {
                    return <span style={{ color: '#22c55e' }}>Faltam {dias} dias</span>;
                  }

                  if (dias === 1) {
                    return <span style={{ color: '#facc15' }}>Vence amanhã</span>;
                  }

                  if (dias === 0) {
                    return <span style={{ color: '#facc15' }}>Vence hoje</span>;
                  }

                  return (
                    <span style={{ color: '#ef4444' }}>
                      Venceu há {Math.abs(dias)} dias
                    </span>
                  );
                })()}
              </td>
              <td>{formatCurrency(getPlanMonthlyValue(user.plan_type))}</td>
              <td>{user.overdue_days || 0}</td>
              <td>
                <div className="finance-actions">
                  <button
                    type="button"
                    className="finance-action-btn finance-action-paid botao-pagar"
                    title="Marcar como pago"
                    aria-label="Marcar como pago"
                    onClick={() => onMarkPaid(user.id)}
                  >
                    💰
                  </button>
                  <button
                    type="button"
                    className="finance-action-btn finance-action-block botao-bloquear"
                    title="Bloquear usuário"
                    aria-label="Bloquear usuário"
                    onClick={() => onBlock(user.id)}
                  >
                    🚫
                  </button>
                  <button
                    type="button"
                    className="finance-action-btn finance-action-unblock botao-desbloquear"
                    title="Desbloquear usuário"
                    aria-label="Desbloquear usuário"
                    onClick={() => onUnblock(user.id)}
                  >
                    🔓
                  </button>
                  <button
                    type="button"
                    className="finance-action-btn finance-action-charge botao-cobrar"
                    title="Cobrar no WhatsApp"
                    aria-label="Cobrar no WhatsApp"
                    onClick={() => chargeUser(message, phone)}
                  >
                    📲
                  </button>
                  <button
                    type="button"
                    className="finance-action-btn finance-action-history botao-historico"
                    title="Ver histórico financeiro"
                    aria-label="Ver histórico financeiro"
                    onClick={() => onHistory(user)}
                  >
                    🕘
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
};


const AffiliateCards = ({
  items,
  expandedAffiliateId,
  affiliateUsers,
  affiliateUsersLoadingId,
  onToggleAffiliate,
}) => (
  <div className="user-list-wrapper">
    {items.length === 0 ? (
      <div className="muted user-empty">Nenhum afiliado cadastrado.</div>
    ) : (
      <div className="usuarios-scroll-container">
        {items.map((affiliate) => {
          const isExpanded = expandedAffiliateId === affiliate.id;
          const users = affiliateUsers[affiliate.id] || [];
          const totalUsers = users.length;
          const activeUsers = users.filter((user) => computeEffectiveSubscriptionStatus(user) === 'active').length;
          const inactiveUsers = users.filter((user) => computeEffectiveSubscriptionStatus(user) === 'inactive').length;
          const paidUsers = users.filter((user) => String(user?.billing_status || '').toLowerCase() === 'paid').length;
          const pendingUsers = totalUsers - paidUsers;

          return (
            <div key={affiliate.id} className="event-card user-event-card card-ui">
              <div className="event-date user-event-email">
                {affiliate.email || affiliate.code || '-'}
              </div>

              <div className="event-content">
                <div className="event-title">{affiliate.name || 'Sem nome'}</div>

                <div className="event-subtitle">{affiliate.whatsapp || 'WhatsApp não informado'}</div>
                <div className="event-subtitle user-event-meta">
                  <span className={`badge-${affiliate.is_active ? 'green' : 'red'} affiliate-status-button`}>
                    {affiliate.is_active ? 'ATIVO' : 'INATIVO'}
                  </span>
                </div>
                <div className="event-subtitle user-event-details">
                  <span>Código: {affiliate.code || '-'}</span>
                  <span>Comissão: {formatCurrency((affiliate.commission_cents || 0) / 100)}</span>
                  <span>Criado em: {formatDate(affiliate.created_at)}</span>
                </div>
                <div className="event-subtitle user-event-details">
                  <button type="button" className="btn-ui" onClick={() => onToggleAffiliate(affiliate.id)}>
                    {isExpanded ? 'Ocultar usuários' : 'Ver usuários'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="affiliate-inline-users">
                    {affiliateUsersLoadingId === affiliate.id && (
                      <p className="muted">Carregando usuários...</p>
                    )}

                    {affiliateUsersLoadingId !== affiliate.id && (
                      <>
                        <div className="event-subtitle user-event-details">
                          <span>Total usuários: {totalUsers}</span>
                          <span>Ativos: {activeUsers}</span>
                          <span>Inativos: {inactiveUsers}</span>
                          <span>Pagos: {paidUsers}</span>
                          <span>Pendentes: {pendingUsers}</span>
                        </div>
                        {totalUsers === 0 && <p className="muted">Nenhum usuário vinculado.</p>}
                        {totalUsers > 0 && (
                          <div className="affiliate-inline-users-list">
                            {users.map((user) => {
                              const userStatus =
                                computeEffectiveSubscriptionStatus(user) === 'active' ? 'Ativo' : 'Inativo';
                              const paymentStatus =
                                String(user?.billing_status || '').toLowerCase() === 'paid' ? 'Pago' : 'Pendente';
                              const planLabel = getPlanVisual(user?.plan_type).label;
                              return (
                                <div key={user.id} className="event-subtitle">
                                  {(user.name || 'Sem nome')} — {userStatus} — {paymentStatus} — Plano {planLabel}
                                  {user.whatsapp ? ` — WhatsApp: ${user.whatsapp}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const useChart = (canvasId, config) => {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!window.Chart) return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    chartRef.current?.destroy?.();
    chartRef.current = new window.Chart(ctx, config);
    return () => {
      chartRef.current?.destroy?.();
    };
  }, [JSON.stringify(config)]);
};

const Reports = ({ transactions }) => {
  const today = useMemo(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    return current;
  }, []);

  const toISODate = (date) => date.toISOString().slice(0, 10);

  const buildPresetRange = (preset) => {
    const end = new Date(today);
    let start = new Date(today);

    switch (preset) {
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end.setFullYear(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last-7':
        start.setDate(start.getDate() - 6);
        break;
      case 'last-30':
      default:
        start.setDate(start.getDate() - 29);
        break;
    }

    return { from: toISODate(start), to: toISODate(end) };
  };

  const [reportPreset, setReportPreset] = useState('last-30');
  const [reportRange, setReportRange] = useState(() => buildPresetRange('last-30'));
  const [selectedDay, setSelectedDay] = useState('');

  useEffect(() => {
    if (reportPreset === 'custom') return;
    setReportRange(buildPresetRange(reportPreset));
  }, [reportPreset, today]);

  const normalizedRange = useMemo(() => {
    if (!reportRange.from || !reportRange.to) return reportRange;
    if (reportRange.from <= reportRange.to) return reportRange;
    return { from: reportRange.to, to: reportRange.from };
  }, [reportRange]);

  const reportRangeStart = useMemo(() => {
    const parsed = parseDateSafe(normalizedRange.from);
    if (!parsed) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }, [normalizedRange.from]);

  const reportRangeEnd = useMemo(() => {
    const parsed = parseDateSafe(normalizedRange.to);
    if (!parsed) return null;
    parsed.setHours(23, 59, 59, 999);
    return parsed;
  }, [normalizedRange.to]);

  const reportTransactions = useMemo(() => {
    if (!reportRangeStart || !reportRangeEnd) return transactions;
    return transactions.filter((tx) => {
      const parsed = parseDateSafe(tx.date);
      if (!parsed) return false;
      return parsed >= reportRangeStart && parsed <= reportRangeEnd;
    });
  }, [transactions, reportRangeStart, reportRangeEnd]);

  const daysInRange = useMemo(() => {
    if (!reportRangeStart || !reportRangeEnd) return [];
    const days = [];
    const cursor = new Date(reportRangeStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= reportRangeEnd) {
      days.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [reportRangeStart, reportRangeEnd]);

  const dailyMap = useMemo(() => {
    const map = {};
    reportTransactions.forEach((tx) => {
      const key = (tx.date || '').slice(0, 10);
      if (!key) return;
      if (!map[key]) {
        map[key] = { income: 0, expense: 0 };
      }
      map[key][tx.type] += Number(tx.amount || 0);
    });
    return map;
  }, [reportTransactions]);

  const dailySeries = useMemo(() => {
    let acc = 0;
    return daysInRange.map((date) => {
      const dayData = dailyMap[date] || { income: 0, expense: 0 };
      const net = dayData.income - dayData.expense;
      acc += net;
      return {
        date,
        income: dayData.income,
        expense: dayData.expense,
        net,
        balance: acc,
      };
    });
  }, [daysInRange, dailyMap]);

  const reportTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    reportTransactions.forEach((tx) => {
      if (tx.type === 'income') income += Number(tx.amount || 0);
      if (tx.type === 'expense') expense += Number(tx.amount || 0);
    });
    return { income, expense, balance: income - expense };
  }, [reportTransactions]);

  const averageDailyExpense = useMemo(() => {
    if (!daysInRange.length) return 0;
    return reportTotals.expense / daysInRange.length;
  }, [reportTotals.expense, daysInRange.length]);

  const maxDailyExpense = useMemo(() => {
    if (!dailySeries.length) return null;
    return dailySeries.reduce((max, day) => {
      if (!max || day.expense > max.expense) {
        return { date: day.date, expense: day.expense };
      }
      return max;
    }, null);
  }, [dailySeries]);

  const previousPeriod = useMemo(() => {
    if (!reportRangeStart || !daysInRange.length) return null;
    const prevEnd = new Date(reportRangeStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(reportRangeStart);
    prevStart.setDate(prevStart.getDate() - daysInRange.length);
    prevStart.setHours(0, 0, 0, 0);
    prevEnd.setHours(23, 59, 59, 999);
    return { start: prevStart, end: prevEnd };
  }, [reportRangeStart, daysInRange.length]);

  const previousExpenseTotal = useMemo(() => {
    if (!previousPeriod) return null;
    return transactions.reduce((sum, tx) => {
      if (tx.type !== 'expense') return sum;
      const parsed = parseDateSafe(tx.date);
      if (!parsed) return sum;
      if (parsed >= previousPeriod.start && parsed <= previousPeriod.end) {
        return sum + Number(tx.amount || 0);
      }
      return sum;
    }, 0);
  }, [transactions, previousPeriod]);

  const expenseComparison = useMemo(() => {
    if (previousExpenseTotal === null) return null;
    if (previousExpenseTotal === 0) {
      if (reportTotals.expense === 0) return null;
      return { label: 'sem histórico', value: null };
    }
    const diff = (reportTotals.expense - previousExpenseTotal) / previousExpenseTotal;
    return { label: formatPercent(diff), value: diff };
  }, [previousExpenseTotal, reportTotals.expense]);

  const categoryRanking = useMemo(() => {
    const map = {};
    reportTransactions.forEach((tx) => {
      if (tx.type !== 'expense') return;
      const cat = tx.category || 'Sem categoria';
      const amount = Number(tx.amount || 0);
      map[cat] = (map[cat] || 0) + amount;
    });

    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [reportTransactions]);

  const topCategories = useMemo(() => categoryRanking.slice(0, 5), [categoryRanking]);

  const heatmapDays = useMemo(() => {
    if (!dailySeries.length) return [];
    return dailySeries.slice(-30).map((day) => ({
      date: day.date,
      total: day.net,
    }));
  }, [dailySeries]);

  const maxAbsDaily = useMemo(
    () =>
      heatmapDays.reduce(
        (max, day) => Math.max(max, Math.abs(day.total)),
        0
      ) || 1,
    [heatmapDays]
  );

  const heatmapWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < heatmapDays.length; i += 7) {
      weeks.push(heatmapDays.slice(i, i + 7));
    }
    return weeks;
  }, [heatmapDays]);

  const monthlyData = useMemo(() => {
    const map = {};
    reportTransactions.forEach((tx) => {
      const month = (tx.date || '').slice(0, 7); // YYYY-MM
      if (!month) return;
      if (!map[month]) map[month] = { income: 0, expense: 0 };
      map[month][tx.type] += Number(tx.amount || 0);
    });
    const entries = Object.entries(map).sort();
    return {
      labels: entries.map(([month]) => month),
      income: entries.map(([, values]) => values.income),
      expense: entries.map(([, values]) => values.expense),
    };
  }, [reportTransactions]);

  const expenseByCat = useMemo(() => {
    const map = {};
    reportTransactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        const key = tx.category || 'Sem categoria';
        map[key] = (map[key] || 0) + Number(tx.amount || 0);
      });
    return map;
  }, [reportTransactions]);

  const incomeByCat = useMemo(() => {
    const map = {};
    reportTransactions
      .filter((tx) => tx.type === 'income')
      .forEach((tx) => {
        const key = tx.category || 'Sem categoria';
        map[key] = (map[key] || 0) + Number(tx.amount || 0);
      });
    return map;
  }, [reportTransactions]);

  const balancePoints = useMemo(() => {
    const sorted = [...reportTransactions].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    let acc = 0;
    return sorted.map((tx) => {
      acc += tx.type === 'income'
        ? Number(tx.amount || 0)
        : -Number(tx.amount || 0);
      return {
        date: tx.date,
        balance: acc,
      };
    });
  }, [reportTransactions]);

  // ---------------- NOVO BLOCO: resumo mensal + comparação ----------------
  const [selectedMonth, setSelectedMonth] = useState('');

  const monthStats = useMemo(() => {
    if (!monthlyData.labels.length) return null;

    const entries = monthlyData.labels.map((monthKey, index) => {
      const income = monthlyData.income[index] || 0;
      const expense = monthlyData.expense[index] || 0;
      return {
        monthKey,
        income,
        expense,
        balance: income - expense,
      };
    });

    let maxExpense = entries[0];
    let minExpense = entries[0];
    let maxIncome = entries[0];

    entries.forEach((item) => {
      if (item.expense > maxExpense.expense) maxExpense = item;
      if (item.expense < minExpense.expense) minExpense = item;
      if (item.income > maxIncome.income) maxIncome = item;
    });

    return { entries, maxExpense, minExpense, maxIncome };
  }, [monthlyData]);

  useEffect(() => {
    if (!selectedMonth && monthlyData.labels.length) {
      // por padrão, seleciona o mês mais recente
      setSelectedMonth(monthlyData.labels[monthlyData.labels.length - 1]);
    }
  }, [selectedMonth, monthlyData.labels]);

  const selectedMonthEntry = useMemo(() => {
    if (!monthStats || !selectedMonth) return null;
    return (
      monthStats.entries.find((item) => item.monthKey === selectedMonth) || null
    );
  }, [monthStats, selectedMonth]);

  const formatMonthLabel = (monthKey) => {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  };

  // ------------------------------------------------------------------------

  // GRÁFICOS JÁ EXISTENTES (mantidos)
  useChart('chartLine', {
    type: 'line',
    data: {
      labels: monthlyData.labels,
      datasets: [
        {
          label: 'Receitas',
          data: monthlyData.income,
          borderColor: '#4ade80',
          tension: 0.3,
        },
        {
          label: 'Despesas',
          data: monthlyData.expense,
          borderColor: '#ef4444',
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: {
        x: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
        y: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
      },
    },
  });

  useChart('chartPie', {
    type: 'doughnut',
    data: {
      labels: Object.keys(expenseByCat),
      datasets: [
        {
          data: Object.values(expenseByCat),
          backgroundColor: [
            '#f87171',
            '#fb923c',
            '#facc15',
            '#34d399',
            '#38bdf8',
            '#a78bfa',
          ],
        },
      ],
    },
  });

  useChart('chartIncomeCat', {
    type: 'bar',
    data: {
      labels: Object.keys(incomeByCat),
      datasets: [
        {
          data: Object.values(incomeByCat),
          backgroundColor: '#4ade80',
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
        y: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
      },
    },
  });

  useChart('chartBalance', {
    type: 'line',
    data: {
      labels: balancePoints.map((point) => point.date),
      datasets: [
        {
          data: balancePoints.map((point) => point.balance),
          borderColor: '#60a5fa',
          fill: false,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
        y: { ticks: { color: '#aab2c0' }, grid: { color: '#1f2434' } },
      },
    },
  });

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    return reportTransactions.filter(
      (tx) => (tx.date || '').slice(0, 10) === selectedDay
    );
  }, [reportTransactions, selectedDay]);

  const chartMetrics = useMemo(() => {
    if (!dailySeries.length) return null;
    const width = 640;
    const height = 240;
    const padding = { top: 24, right: 20, bottom: 28, left: 36 };
    const maxBalance = Math.max(...dailySeries.map((day) => day.balance), 0);
    const minBalance = Math.min(...dailySeries.map((day) => day.balance), 0);
    const maxDaily = Math.max(
      ...dailySeries.map((day) => Math.max(day.income, day.expense)),
      0
    );
    const yMax = Math.max(maxBalance, maxDaily);
    const yMin = Math.min(minBalance, 0);
    const range = yMax - yMin || 1;
    const xSpan = width - padding.left - padding.right;
    const ySpan = height - padding.top - padding.bottom;
    const toX = (index) =>
      padding.left +
      xSpan * (dailySeries.length === 1 ? 0 : index / (dailySeries.length - 1));
    const toY = (value) =>
      padding.top + ((yMax - value) / range) * ySpan;

    const points = dailySeries.map((day, index) => ({
      x: toX(index),
      y: toY(day.balance),
      incomeY: toY(day.income),
      expenseY: toY(day.expense),
      date: day.date,
      balance: day.balance,
      income: day.income,
      expense: day.expense,
    }));

    const buildPath = (key) =>
      points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point[key]}`)
        .join(' ');

    return {
      width,
      height,
      padding,
      points,
      balancePath: buildPath('y'),
      incomePath: buildPath('incomeY'),
      expensePath: buildPath('expenseY'),
      yZero: toY(0),
      yMin,
      yMax,
    };
  }, [dailySeries]);

  const handleExportCsv = () => {
    const header = [
      'Data',
      'Tipo',
      'Descrição',
      'Categoria',
      'Valor'
    ];

    const escapeCsv = (value) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = reportTransactions.map((tx) => [
      tx.date || '',
      tx.type === 'income' ? 'Receita' : 'Despesa',
      tx.description || '',
      tx.category || '',
      Number(tx.amount || 0).toFixed(2)
    ]);

    const csvContent = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transacoes_${normalizedRange.from || 'inicio'}_${normalizedRange.to || 'fim'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="tab-reports">
      <div className="reports-header">
        <div>
          <h3 className="title">Relatórios do período</h3>
          <p className="muted">
            Selecione o período para recalcular KPIs, gráficos e categorias.
          </p>
        </div>
        <button className="ghost" onClick={handleExportCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="reports-filters">
        <div>
          <label>Período</label>
          <select
            value={reportPreset}
            onChange={(e) => setReportPreset(e.target.value)}
          >
            <option value="this-month">Este mês</option>
            <option value="last-month">Mês passado</option>
            <option value="last-7">Últimos 7 dias</option>
            <option value="last-30">Últimos 30 dias</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div>
          <label>De</label>
          <input
            type="date"
            value={normalizedRange.from}
            onChange={(e) =>
              setReportRange((prev) => ({ ...prev, from: e.target.value }))
            }
            disabled={reportPreset !== 'custom'}
          />
        </div>
        <div>
          <label>Até</label>
          <input
            type="date"
            value={normalizedRange.to}
            onChange={(e) =>
              setReportRange((prev) => ({ ...prev, to: e.target.value }))
            }
            disabled={reportPreset !== 'custom'}
          />
        </div>
        <div className="reports-filters-meta muted">
          {normalizedRange.from && normalizedRange.to
            ? `${formatDate(normalizedRange.from)} • ${formatDate(
                normalizedRange.to
              )}`
            : 'Selecione um período válido'}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <small>Receitas do período</small>
          <strong>{formatCurrency(reportTotals.income)}</strong>
          <span className="muted">Total somado no intervalo</span>
        </div>
        <div className="kpi-card">
          <small>Despesas do período</small>
          <strong>{formatCurrency(reportTotals.expense)}</strong>
          <span className="muted">Total somado no intervalo</span>
        </div>
        <div className="kpi-card">
          <small>Saldo do período</small>
          <strong>{formatCurrency(reportTotals.balance)}</strong>
          <span className="muted">Receitas - despesas</span>
        </div>
        <div className="kpi-card">
          <small>Média diária de despesas</small>
          <strong>{formatCurrency(averageDailyExpense)}</strong>
          <span className="muted">Considerando {daysInRange.length || 0} dias</span>
        </div>
        <div className="kpi-card">
          <small>Maior despesa em um dia</small>
          <strong>{formatCurrency(maxDailyExpense?.expense || 0)}</strong>
          <span className="muted">
            {maxDailyExpense?.date
              ? `Em ${formatDate(maxDailyExpense.date)}`
              : 'Sem despesas no período'}
          </span>
        </div>
        <div className="kpi-card">
          <small>Comparativo com período anterior</small>
          <strong>
            {expenseComparison?.label || 'Sem histórico'}
          </strong>
          <span
            className={`muted ${
              expenseComparison?.value !== null
                ? expenseComparison?.value < 0
                  ? 'trend-down'
                  : 'trend-up'
                : ''
            }`}
          >
            {expenseComparison?.value !== null
              ? `${expenseComparison?.value < 0 ? 'Redução' : 'Aumento'} nas despesas`
              : 'Sem dados suficientes'}
          </span>
        </div>
      </div>

      <div className="card report-chart-card">
        <div className="report-chart-header">
          <div>
            <h3 className="title">Saldo acumulado por dia</h3>
            <p className="muted">
              Clique em um ponto para ver as transações do dia.
            </p>
          </div>
          <div className="report-chart-legend">
            <span className="legend-item">
              <i className="legend-dot balance"></i> Saldo acumulado
            </span>
            <span className="legend-item">
              <i className="legend-dot income"></i> Receitas diárias
            </span>
            <span className="legend-item">
              <i className="legend-dot expense"></i> Despesas diárias
            </span>
          </div>
        </div>
        {chartMetrics ? (
          <div className="report-chart">
            <svg viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}>
              <line
                x1={chartMetrics.padding.left}
                x2={chartMetrics.width - chartMetrics.padding.right}
                y1={chartMetrics.yZero}
                y2={chartMetrics.yZero}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="4 6"
              />
              <path
                d={chartMetrics.balancePath}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2.5"
              />
              <path
                d={chartMetrics.incomePath}
                fill="none"
                stroke="#4ade80"
                strokeWidth="1.5"
                strokeDasharray="6 6"
              />
              <path
                d={chartMetrics.expensePath}
                fill="none"
                stroke="#f87171"
                strokeWidth="1.5"
                strokeDasharray="6 6"
              />
              {chartMetrics.points.map((point) => (
                <g
                  key={point.date}
                  onClick={() => setSelectedDay(point.date)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={point.x} cy={point.y} r="4" fill="#93c5fd" />
                </g>
              ))}
            </svg>
            <div className="report-chart-axis">
              <span>{formatDate(daysInRange[0])}</span>
              <span>{formatDate(daysInRange[daysInRange.length - 1])}</span>
            </div>
          </div>
        ) : (
          <p className="muted">Nenhum dado disponível para o período selecionado.</p>
        )}
      </div>

      {/* NOVO: resumo mensal + seletor de mês + comparação entre meses */}
      {monthStats && (
        <>
          <div className="summary" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <small>Mês selecionado</small>
              <strong>{formatMonthLabel(selectedMonth) || '-'}</strong>
              {selectedMonthEntry && (
                <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  Receitas: {formatCurrency(selectedMonthEntry.income)} •{' '}
                  Despesas: {formatCurrency(selectedMonthEntry.expense)} •{' '}
                  Saldo: {formatCurrency(selectedMonthEntry.balance)}
                </p>
              )}
            </div>

            <div className="kpi">
              <small>Mês com MAIOR despesa</small>
              <strong>{formatMonthLabel(monthStats.maxExpense.monthKey)}</strong>
              <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Total de despesas:{' '}
                {formatCurrency(monthStats.maxExpense.expense)}
              </p>
            </div>

            <div className="kpi">
              <small>Mês com MAIOR receita</small>
              <strong>{formatMonthLabel(monthStats.maxIncome?.monthKey)}</strong>
              <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Total de receitas: {formatCurrency(monthStats.maxIncome?.income || 0)}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label>Mudar mês para detalhar</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ maxWidth: 260 }}
            >
              {monthlyData.labels.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {formatMonthLabel(monthKey)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* GRÁFICOS ORIGINAIS (mantidos) */}
      <div className="row">
        <div className="card" style={{ flex: 1 }}>
          <h3 className="title">Receitas x Despesas (por mês)</h3>
          <canvas id="chartLine"></canvas>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="title">Despesas por Categoria</h3>
          <canvas id="chartPie"></canvas>
        </div>
      </div>
      <div className="row">
        <div className="card" style={{ flex: 1 }}>
          <h3 className="title">Receitas por Categoria</h3>
          <canvas id="chartIncomeCat"></canvas>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="title">Saldo Acumulado</h3>
          <canvas id="chartBalance"></canvas>
        </div>
      </div>

      {Boolean(categoryRanking.length || heatmapDays.length) && (
        <>
          <h2 className="section-title" style={{ marginTop: 24 }}>
            Visão detalhada das finanças
          </h2>

          <div className="row">
            <div className="card" style={{ flex: 1 }}>
              <h3 className="title">Ranking de categorias (por despesa)</h3>
              {topCategories.length === 0 ? (
                <p className="muted">
                  Nenhuma despesa encontrada para o período selecionado.
                </p>
              ) : (
                <div className="category-bars">
                  {topCategories.map((item, index) => {
                    const percent = reportTotals.expense
                      ? (item.total / reportTotals.expense) * 100
                      : 0;
                    return (
                      <div key={item.category} className="category-bar">
                        <div className="category-bar-header">
                          <strong>
                            {index + 1}. {item.category}
                          </strong>
                          <span className="muted">
                            {formatCurrency(item.total)} • {percent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="category-bar-track">
                          <div
                            className="category-bar-fill"
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card" style={{ flex: 1 }}>
              <h3 className="title">Mapa de calor financeiro (últimos 30 dias)</h3>
              {heatmapDays.length === 0 ? (
                <p className="muted">
                  Cadastre lançamentos para ver o mapa de calor.
                </p>
              ) : (
                <div className="heatmap">
                  <div className="heatmap-legend">
                    <span className="muted">Menor movimento</span>
                    <div className="heatmap-legend-bar"></div>
                    <span className="muted">Maior movimento</span>
                  </div>
                  <div className="heatmap-grid">
                    {heatmapWeeks.map((week, weekIndex) => (
                      <div key={weekIndex} className="heatmap-week">
                        {week.map((day) => {
                          const intensity = Math.abs(day.total) / maxAbsDaily;
                          const className =
                            intensity === 0
                              ? 'heatmap-cell -empty'
                              : intensity < 0.33
                              ? 'heatmap-cell -low'
                              : intensity < 0.66
                              ? 'heatmap-cell -medium'
                              : 'heatmap-cell -high';

                          const dateLabel = new Date(
                            day.date
                          ).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                          });

                          return (
                            <div
                              key={day.date}
                              className={className}
                              title={`${dateLabel} • Total: ${formatCurrency(
                                day.total
                              )}`}
                            ></div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedDay && (
        <div
          className="report-modal-overlay"
          onClick={() => setSelectedDay('')}
        >
          <div
            className="report-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="report-modal-header">
              <div>
                <h3 className="title">Transações em {formatDate(selectedDay)}</h3>
                <p className="muted">
                  {selectedDayTransactions.length} lançamento(s) no dia.
                </p>
              </div>
              <button className="ghost" onClick={() => setSelectedDay('')}>
                Fechar
              </button>
            </div>
            {selectedDayTransactions.length === 0 ? (
              <p className="muted">Nenhuma transação encontrada para o dia.</p>
            ) : (
              <div className="report-modal-list">
                {selectedDayTransactions.map((tx) => (
                  <div key={tx.id} className="report-modal-item">
                    <div>
                      <strong>{tx.description || 'Sem descrição'}</strong>
                      <span className="muted">
                        {tx.category || 'Sem categoria'}
                      </span>
                    </div>
                    <div className={`pill ${tx.type}`}>
                      {tx.type === 'income' ? '💵 Receita' : '💸 Despesa'} •{' '}
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const { client, configError } = useSupabaseClient();
  const { session, profile, loadingSession, setSession, setProfile } = useAuth(client);
  const supabase = client;

  const currentUserRole = profile?.role || session?.user?.role || 'user';
  const isAdmin = currentUserRole === 'admin';
  const isAffiliate = currentUserRole === 'affiliate';
  const currentUser = {
    id: session?.user?.id,
    role: currentUserRole,
  };

  const affiliateRef = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('ref')?.trim() || '';
    } catch (err) {
      return '';
    }
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [profileDetails, setProfileDetails] = useState(null);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [transactions, setTransactions] = useState(() => getLocalSnapshot().transactions);
  const [events, setEvents] = useState(() => getLocalSnapshot().events);
  const [users, setUsers] = useState([]);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeUsers, setFinanceUsers] = useState([]);
  const [financeHistoryUser, setFinanceHistoryUser] = useState(null);
  const [financeHistory, setFinanceHistory] = useState([]);
  const [financeTab, setFinanceTab] = useState('controle');
  const [financeFilters, setFinanceFilters] = useState({
    search: '',
    status: 'todos',
    plan: '',
    affiliateId: '',
    sort: 'name',
  });
  const [txForm, setTxForm] = useState(defaultTxForm);
  const [etapaTx, setEtapaTx] = useState('lista');
  const [eventForm, setEventForm] = useState(defaultEventForm);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [editUserForm, setEditUserForm] = useState(defaultEditUserForm);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [openUserModal, setOpenUserModal] = useState(false);
  const [step, setStep] = useState(1);
  const [editUserStep, setEditUserStep] = useState(1);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserOriginal, setEditingUserOriginal] = useState(null);
  const [bodyModalUser, setBodyModalUser] = useState(null);
  const [bodyModalStep, setBodyModalStep] = useState(1);
  const [dailyWeightModalUser, setDailyWeightModalUser] = useState(null);
  const [dailyWeightStep, setDailyWeightStep] = useState(1);
  const [weightHistoryModalUser, setWeightHistoryModalUser] = useState(null);
  const [goalsModalUser, setGoalsModalUser] = useState(null);
  const [goalsModalStep, setGoalsModalStep] = useState(1);
  const [bodyDraft, setBodyDraft] = useState({
    sex: '',
    age: '',
    activity_level: '',
    height_cm: '',
    weight: '',
    goal_weight: '',
    objective: 'manter_peso',
  });
  const [dailyWeightDraft, setDailyWeightDraft] = useState({
    weight_kg: '',
    entry_date: new Date().toISOString().slice(0, 10),
  });
  const [goalsDraft, setGoalsDraft] = useState({
    objective: 'manter_peso',
    calorie_goal: '',
    protein_goal: '',
    water_goal_l: '',
  });
  const [weightHistoryItems, setWeightHistoryItems] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [affiliateForm, setAffiliateForm] = useState(createDefaultAffiliateForm);
  const [affiliatesLoading, setAffiliatesLoading] = useState(false);
  const [affiliateUsers, setAffiliateUsers] = useState({});
  const [affiliateUsersLoadingId, setAffiliateUsersLoadingId] = useState(null);
  const [expandedAffiliateId, setExpandedAffiliateId] = useState(null);
  const [affiliateModalOpen, setAffiliateModalOpen] = useState(false);
  const [affiliateDraft, setAffiliateDraft] = useState(createDefaultAffiliatePromotionDraft);
  const [selectedUserToPromote, setSelectedUserToPromote] = useState(null);
  const affiliatesFinal = useMemo(() => {
    return Array.isArray(affiliates) ? affiliates : [];
  }, [affiliates]);
  const activeAffiliates = useMemo(
    () => affiliatesFinal.filter((affiliate) => affiliate?.is_active === true),
    [affiliatesFinal]
  );
  const affiliateNameById = useMemo(() => {
    return affiliatesFinal.reduce((acc, affiliate) => {
      acc[affiliate.id] = affiliate.name || affiliate.code || 'Afiliado';
      return acc;
    }, {});
  }, [affiliatesFinal]);
  const [txFilters, setTxFilters] = useState(defaultTxFilters);
  const [txMonth, setTxMonth] = useState(getTodayMonth());
  const [txAdvancedOpen, setTxAdvancedOpen] = useState(false);
  const [eventFilters, setEventFilters] = useState(defaultEventFilters);
  const [activeTab, setActiveTab] = useState('form');
  const [activeView, setActiveView] = useState('transactions');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [wizardAberto, setWizardAberto] = useState(false);
  const [generalReportGoals, setGeneralReportGoals] = useState(defaultGeneralReportGoals);
  const workoutApiBase = normalizeBaseUrl(
    window.APP_CONFIG?.apiBaseUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL
  );

  const [toast, setToast] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshInFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);

  const pushToast = (message, variant = 'info') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 4000);
  };

  // Buscar tudo no Supabase (transações, agenda e lista de usuários se for admin)
  const loadRemoteData = async () => {
    if (!client || !session?.user?.id) return;

    setLoadingData(true);

    try {
      try {
        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken && workoutApiBase && /^https?:\/\//i.test(workoutApiBase)) {
          const response = await fetch(`${workoutApiBase}/auth/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (response.ok) {
            const payload = await response.json();
            const profileRow = payload?.profile;

            if (profileRow) {
              setProfileDetails(profileRow);
              const profileRole = String(profileRow?.role || '').toLowerCase();
              const statusAcesso = String(profileRow?.status_acesso || '').toLowerCase();
              const isAdminProfile = profileRole === 'admin';
              if (!isAdminProfile && statusAcesso === 'bloqueado') {
                const message = 'Seu acesso foi bloqueado. Fale com o administrador.';
                pushToast(message, 'danger');
                await client.auth.signOut();
                setSession(null);
                setProfile(null);
                setProfileDetails(null);
                window.localStorage.removeItem('gp-session');
                return;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Falha ao carregar perfil do usuário logado', err);
      }

      // 1) Transações do usuário logado
      let txQuery = client
        .from('transactions')
        .select('id, user_id, type, amount, description, category, date, created_at')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      // Filtros (se quiser manter)
      if (txFilters.from) {
        txQuery = txQuery.gte('date', txFilters.from);
      }
      if (txFilters.to) {
        txQuery = txQuery.lte('date', txFilters.to);
      }
      if (txFilters.type) {
        txQuery = txQuery.eq('type', txFilters.type);
      }
      if (txFilters.category) {
        txQuery = txQuery.eq('category', txFilters.category);
      }
      if (txFilters.description) {
        txQuery = txQuery.ilike('description', `%${txFilters.description}%`);
      }

      const { data: txData, error: txError } = await txQuery;
      if (txError) throw txError;

      const normalizedTx = (txData || []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        userId: row.user_id,
        type: row.type,
        amount: row.amount,
        description: row.description,
        category: row.category,
        date: row.date,
        createdAt: row.created_at,
      }));
      const hoje = new Date();
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();
      const filteredTx = normalizedTx.filter((tx) => {
        const d = new Date(tx.date);
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
      });

      // 2) Eventos (agenda) do usuário logado
      const { data: eventData, error: evError } = await client
        .from('events')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (evError) throw evError;

      // 3) Lista de usuários (admin vê todos, usuário comum vê apenas seu perfil)
      let userData = [];
      try {
        const { data: sessionData } = await client.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token || !workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
          throw new Error('Token/API indisponível para listar usuários.');
        }

        const response = await fetch(`${workoutApiBase}/users`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Erro ao carregar lista de usuários.');
        }

        userData = (data || []).map((item) => ({
          ...item,
          is_affiliate: isOwnerUser(item)
            ? true
            : Boolean(item?.is_affiliate || item?.affiliate_id || item?.affiliate_code),
          payment_status: isUserPaidForCurrentCycle(item, new Date()) ? 'paid' : 'pending',
          derived_status: isOwnerUser(item) ? 'active' : computeEffectiveSubscriptionStatus(item, new Date()),
          billing_status: isOwnerUser(item) ? 'paid' : item?.billing_status,
          role: isOwnerUser(item) ? 'admin' : item?.role,
        }));
        setUsers(userData);
      } catch (err) {
        console.warn('Erro ao carregar lista de usuários', err);
        setUsers([]);
        pushToast('Sem permissão para listar usuários.', 'warning');
      }

      // Atualiza estados
      setTransactions(filteredTx);
      setEvents(eventData || []);

      // Salva snapshot local
      persistLocalSnapshot({
        transactions: filteredTx,
        events: eventData || [],
      });

      console.log('Dados carregados do Supabase com sucesso.');
    } catch (err) {
      console.warn('Falha ao sincronizar com Supabase, usando cache local.', err);
      pushToast('Não foi possível sincronizar com o Supabase. Usando dados locais.', 'warning');
    } finally {
      setLoadingData(false);
    }
  };

  const loadRemoteDataRef = useRef(loadRemoteData);

  useEffect(() => {
    loadRemoteDataRef.current = loadRemoteData;
  }, [loadRemoteData]);

  const runAutoRefresh = async (source = 'interval') => {
    if (!session?.user?.id) return;
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (now - lastRefreshRef.current < 5000) return;

    refreshInFlightRef.current = true;
    lastRefreshRef.current = now;

    try {
      await loadRemoteDataRef.current?.();
    } finally {
      refreshInFlightRef.current = false;
      setRefreshToken((value) => value + 1);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;

    const intervalId = window.setInterval(() => {
      runAutoRefresh('interval');
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        runAutoRefresh('visibility');
      }
    };

    const handleFocus = () => {
      runAutoRefresh('focus');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session?.user?.id]);



  useEffect(() => {
    const syncProfileAccess = async () => {
      if (!client || !session || !workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) return;

      try {
        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) return;

        const response = await fetch(`${workoutApiBase}/auth/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          return;
        }

        const body = await response.json();
        const backendRole = body?.profile?.role;

        if (typeof backendRole === 'string' && backendRole !== (profile?.role || session?.user?.role)) {
          setProfile((current) => ({
            ...(current || {}),
            id: current?.id || session?.user?.profile_id || session?.user?.id,
            name: current?.name || session?.user?.name || 'Usuário',
            role: backendRole,
          }));

          setSession((current) => {
            if (!current?.user) return current;

            const nextSession = {
              ...current,
              user: {
                ...current.user,
                role: backendRole,
              },
            };

            window.localStorage.setItem('gp-session', JSON.stringify(nextSession));
            return nextSession;
          });
        }
      } catch (err) {
        console.warn('Falha ao sincronizar perfil de acesso', err);
      }
    };

    syncProfileAccess();
  }, [client, profile?.role, session, setProfile, setSession, workoutApiBase]);

  useEffect(() => {
    if (!session) return;
    loadRemoteData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile?.role]);

  useEffect(() => {
    if (!session || !isAdmin || activeView !== 'finance') return;
    loadFinanceData(financeFilters).catch((err) => {
      console.warn('Erro ao carregar Financeiro', err);
      pushToast(err?.message || 'Erro ao carregar Financeiro.', 'danger');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isAdmin, activeView, financeFilters]);

  useEffect(() => {
    const { from, to } = monthRange(txMonth);
    setTxFilters((prev) => ({ ...prev, from, to }));
  }, [txMonth]);

  useEffect(() => {
    if (!session) return;
    const snapshot = getLocalSnapshot();
    const belongsToUser = (item) => item.user_id === session.user.id || item.userId === session.user.id;
    const normalizedLocalTx = (snapshot.transactions || [])
      .filter(belongsToUser)
      .map((item) => ({
        ...item,
        user_id: item.user_id || item.userId,
        userId: item.userId || item.user_id,
      }));
    setTransactions(normalizedLocalTx);
    setEvents((snapshot.events || []).filter(belongsToUser));
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    const loadGeneralReportGoals = async () => {
      if (!client || !session?.user?.id) return;

      try {
        const profileGoals = await loadGoals({ supabase: client, userId: session.user.id });
        if (!isMounted) return;

        setGeneralReportGoals({
          calories: Number(profileGoals?.calorie_goal ?? defaultGeneralReportGoals.calories),
          protein: Number(profileGoals?.protein_goal ?? defaultGeneralReportGoals.protein),
          water: Number(profileGoals?.water_goal_l ?? defaultGeneralReportGoals.water),
        });
      } catch (error) {
        console.warn('Falha ao carregar metas do relatório geral', error);
        if (isMounted) {
          setGeneralReportGoals(defaultGeneralReportGoals);
        }
      }
    };

    loadGeneralReportGoals();

    return () => {
      isMounted = false;
    };
  }, [client, session?.user?.id]);

  useEffect(() => {
    if (!isAdmin && (activeView === 'affiliates' || activeView === 'finance')) {
      setActiveView('transactions');
      return;
    }

    if (!isAdmin && !isAffiliate && activeView === 'supervisor') {
      setActiveView('transactions');
    }
  }, [isAdmin, isAffiliate, activeView]);

  useEffect(() => {
    if ((activeView === 'affiliates' || activeView === 'users') && isAdmin) {
      fetchAffiliates();
    }
  }, [activeView, isAdmin]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activeView]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const ownerId = tx.userId || tx.user_id;
      if (session && ownerId && ownerId !== session.user.id) return false;
      if (txFilters.type && tx.type !== txFilters.type) return false;
      if (txFilters.from && tx.date < txFilters.from) return false;
      if (txFilters.to && tx.date > txFilters.to) return false;
      if (txFilters.category && tx.category !== txFilters.category) return false;
      if (txFilters.description) {
        const q = txFilters.description.toLowerCase();
        return tx.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [transactions, txFilters]);

  const txCategories = useMemo(() => {
    return Array.from(new Set(transactions.map((tx) => tx.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const handleApplyTxFilters = () => {
    loadRemoteData();
  };

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (session && ev.user_id && ev.user_id !== session.user.id) return false;
      if (eventFilters.from && ev.date < eventFilters.from) return false;
      if (eventFilters.to && ev.date > eventFilters.to) return false;
      if (eventFilters.search) {
        const q = eventFilters.search.toLowerCase();
        return (
          ev.title?.toLowerCase().includes(q) || ev.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, eventFilters]);

  const kpis = useMemo(() => {
    const income = filteredTransactions
      .filter((tx) => tx.type === 'income')
      .reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
    const expense = filteredTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
    return {
      income,
      expense,
      balance: income - expense
    };
  }, [filteredTransactions]);


                const handleLogin = async () => {
                  if (!client) return;

                  setLoginLoading(true);
                  setLoginError('');

                  try {
                    // 1) Login real no Supabase Auth
                    const { data: signInData, error: signInError } =
                      await client.auth.signInWithPassword({
                        email: loginForm.email,
                        password: loginForm.password,
                      });

                    if (signInError || !signInData?.user) {
                      throw new Error(signInError?.message || 'E-mail ou senha inválidos.');
                    }

                    const authUser = signInData.user; // <-- ESTE é o id que o Supabase usa nas FKs
                    console.log('authUser.id:', authUser.id);

                    const accessToken = signInData?.session?.access_token;

                    if (!accessToken || !workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
                      throw new Error('Não foi possível validar o perfil no backend.');
                    }

                    const authProfileResponse = await fetch(`${workoutApiBase}/auth/profile`, {
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                      },
                    });
                    const authProfilePayload = await authProfileResponse.json().catch(() => ({}));
                    const authProfile = authProfilePayload?.profile;

                    if (!authProfileResponse.ok || !authProfile) {
                      throw new Error(authProfilePayload?.error || 'Perfil de autenticação não encontrado.');
                    }

                    if (
                      affiliateRef &&
                      workoutApiBase &&
                      /^https?:\/\//i.test(workoutApiBase) &&
                      accessToken
                    ) {
                      try {
                        await fetch(`${workoutApiBase}/public/affiliate/apply`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${accessToken}`,
                          },
                          body: JSON.stringify({ affiliate_code: affiliateRef }),
                        });
                      } catch (applyErr) {
                        console.warn('Não foi possível aplicar código de afiliado automaticamente.', applyErr);
                      }
                    }

                    // 3) Guardar sessão no localStorage
                    //    user.id = authUser.id  (id da tabela auth.users)
                    //    user.profile_id = authProfile.id  (id do perfil retornado pelo backend)
                    window.localStorage.setItem(
                      'gp-session',
                      JSON.stringify({
                        user: {
                          id: authUser.id,          // <-- esse vai pra transactions.user_id
                          profile_id: authProfile.id,
                          name: authProfile.name,
                          role: authProfile.role,
                          email: loginForm.email,
                        },
                      }),
                    );

                    pushToast('Login realizado com sucesso!', 'success');
                    window.location.reload();
                  } catch (err) {
                    console.error('Erro no login', err);
                    setLoginError(err.message || 'Erro ao fazer login.');
                  } finally {
                    setLoginLoading(false);
                  }
                };



  async function handleLogout() {
    window.localStorage.removeItem('gp-session');
    try {
      await client?.auth?.signOut();
    } catch (err) {
      console.warn('Erro ao sair do Supabase', err);
    }
    setSession(null);
    setProfile(null);
    setProfileDetails(null);
    window.location.reload();
  }

  const handleApiForbidden = () => {
    pushToast('Conta inativa. Entre em contato com o administrador.', 'danger');
  };

  const getAccessToken = async () => {
    const { data: sessionData } = await client.auth.getSession();
    return sessionData?.session?.access_token || '';
  };

  const syncUserInList = (userId, patch) => {
    if (!userId) return;
    setUsers((prev) => prev.map((item) => (item.id === userId ? { ...item, ...patch } : item)));
  };

  const openBodyModal = (user) => {
    if (!user || currentUser?.id !== user.id) return;
    setBodyModalUser(user);
    setBodyModalStep(1);
    setBodyDraft({
      sex: user?.sex || '',
      age: user?.age != null ? String(user.age) : '',
      activity_level: user?.activity_level || '',
      height_cm: user?.height_cm != null ? String(user.height_cm) : '',
      weight: resolveUserCurrentWeight(user) != null ? String(resolveUserCurrentWeight(user)) : '',
      goal_weight: user?.goal_weight != null ? String(user.goal_weight) : '',
      objective: user?.objective || 'manter_peso',
    });
  };

  const openGoalsModal = (user) => {
    if (!user || currentUser?.id !== user.id) return;
    setGoalsModalUser(user);
    setGoalsModalStep(1);
    setGoalsDraft({
      objective: user?.objective || 'manter_peso',
      calorie_goal: user?.calorie_goal != null ? String(user.calorie_goal) : '',
      protein_goal: user?.protein_goal != null ? String(user.protein_goal) : '',
      water_goal_l: user?.water_goal_l != null ? String(user.water_goal_l) : '',
    });
  };

  const openDailyWeightModal = (user) => {
    if (!user || currentUser?.id !== user.id) return;
    setDailyWeightModalUser(user);
    setDailyWeightStep(1);
    setDailyWeightDraft({
      weight_kg: resolveUserCurrentWeight(user) != null ? String(resolveUserCurrentWeight(user)) : '',
      entry_date: new Date().toISOString().slice(0, 10),
    });
  };

  const openWeightHistoryModal = async (user) => {
    if (!user || currentUser?.id !== user.id || !client) return;
    try {
      const { data, error } = await client
        .from('food_weight_history')
        .select('entry_date, weight_kg, recorded_at')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setWeightHistoryItems(data || []);
      setWeightHistoryModalUser(user);
    } catch (err) {
      pushToast(err?.message || 'Não foi possível carregar o histórico de peso.', 'danger');
    }
  };

  const saveBodyData = async () => {
    try {
      if (!bodyModalUser || currentUser?.id !== bodyModalUser.id) return;
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch(`${workoutApiBase}/body`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sex: bodyDraft.sex || null,
          age: bodyDraft.age ? Number(bodyDraft.age) : null,
          activity_level: bodyDraft.activity_level || null,
          height_cm: bodyDraft.height_cm ? Number(bodyDraft.height_cm) : null,
          weight: bodyDraft.weight ? Number(bodyDraft.weight) : null,
          goal_weight: bodyDraft.goal_weight ? Number(bodyDraft.goal_weight) : null,
          objective: bodyDraft.objective || 'manter_peso',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível atualizar os dados corporais.');

      syncUserInList(bodyModalUser.id, {
        sex: bodyDraft.sex || null,
        age: bodyDraft.age ? Number(bodyDraft.age) : null,
        activity_level: bodyDraft.activity_level || null,
        height_cm: bodyDraft.height_cm ? Number(bodyDraft.height_cm) : null,
        weight: bodyDraft.weight ? Number(bodyDraft.weight) : null,
        goal_weight: bodyDraft.goal_weight ? Number(bodyDraft.goal_weight) : null,
        objective: bodyDraft.objective || 'manter_peso',
        calorie_goal: payload?.goals?.calorie_goal,
        protein_goal: payload?.goals?.protein_goal,
        water_goal_l: payload?.goals?.water_goal_l,
        goal_mode: payload?.goals?.goal_mode || 'auto',
      });
      setBodyModalUser(null);
      setBodyModalStep(1);
      pushToast('Dados corporais atualizados com sucesso.', 'success');
    } catch (err) {
      pushToast(err?.message || 'Erro ao atualizar dados corporais.', 'danger');
    }
  };

  const saveDailyWeight = async () => {
    try {
      if (!dailyWeightModalUser || currentUser?.id !== dailyWeightModalUser.id || !client) return;
      const parsedWeight = Number(dailyWeightDraft.weight_kg);
      if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
        throw new Error('Informe um peso válido.');
      }
      const { error } = await client
        .from('food_weight_history')
        .upsert({
          user_id: dailyWeightModalUser.id,
          entry_date: dailyWeightDraft.entry_date,
          weight_kg: parsedWeight,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'user_id,entry_date' });
      if (error) throw error;

      const { error: profileError } = await client
        .from('profiles')
        .update({ weight: parsedWeight, weight_kg: parsedWeight, current_weight: parsedWeight })
        .eq('id', dailyWeightModalUser.id);
      if (profileError) throw profileError;

      syncUserInList(dailyWeightModalUser.id, {
        weight: parsedWeight,
        current_weight: parsedWeight,
        latest_weight_kg: parsedWeight,
        latest_weight_date: dailyWeightDraft.entry_date,
      });
      setDailyWeightModalUser(null);
      setDailyWeightStep(1);
      pushToast('Peso do dia registrado com sucesso.', 'success');
    } catch (err) {
      pushToast(err?.message || 'Erro ao registrar peso.', 'danger');
    }
  };

  const saveManualGoals = async () => {
    try {
      if (!goalsModalUser || currentUser?.id !== goalsModalUser.id) return;
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.');
      const response = await fetch(`${workoutApiBase}/goals/manual`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          calories: Number(goalsDraft.calorie_goal),
          protein: Number(goalsDraft.protein_goal),
          water: Number(goalsDraft.water_goal_l),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível salvar as metas.');

      syncUserInList(goalsModalUser.id, {
        calorie_goal: Number(goalsDraft.calorie_goal),
        protein_goal: Number(goalsDraft.protein_goal),
        water_goal_l: Number(goalsDraft.water_goal_l),
        goal_mode: 'manual',
      });
      setGoalsModalUser(null);
      setGoalsModalStep(1);
      pushToast('Metas atualizadas com sucesso.', 'success');
    } catch (err) {
      pushToast(err?.message || 'Erro ao salvar metas.', 'danger');
    }
  };

  const loadFinanceData = async (customFilters = financeFilters) => {
    if (!isAdmin || !workoutApiBase) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    const params = new URLSearchParams({
      search: customFilters.search || '',
      status: customFilters.status || 'todos',
      plan: customFilters.plan || '',
      affiliateId: customFilters.affiliateId || '',
      sort: customFilters.sort || 'name',
    });

    const [summaryRes, usersRes] = await Promise.all([
      fetch(`${workoutApiBase}/admin/finance/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`${workoutApiBase}/admin/finance/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const summaryBody = await summaryRes.json().catch(() => ({}));
    const usersBody = await usersRes.json().catch(() => ({}));

    if (!summaryRes.ok || !usersRes.ok) {
      throw new Error(summaryBody?.error || usersBody?.error || 'Erro ao carregar Financeiro.');
    }
    setFinanceSummary(summaryBody);
    setFinanceUsers(usersBody?.users || []);
  };

  const runFinanceAction = async (path, successMessage) => {
    const accessToken = await getAccessToken();
    const response = await fetch(`${workoutApiBase}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Erro na operação.');
    pushToast(successMessage, 'success');
    await loadFinanceData();
  };

  const unblockUser = async (id) => {
    await runFinanceAction(`/admin/finance/users/${id}/unblock`, 'Usuário desbloqueado com sucesso.');
  };

  const openFinanceHistory = async (user) => {
    const accessToken = await getAccessToken();
    const response = await fetch(`${workoutApiBase}/admin/finance/users/${user.id}/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || 'Erro ao abrir histórico.');
    }
    setFinanceHistoryUser(user);
    setFinanceHistory(body?.history || []);
  };

                  // Salvar transação (local + Supabase)
                        const handleSaveTransaction = async () => {
                          const todayIso = new Date().toISOString().split('T')[0];
                          const transactionData = {
                            type: txForm.type,
                            amount: Number(txForm.amount || 0),
                            description: txForm.description,
                            date: todayIso,
                          };
                          // Monta o objeto da transação
                          const payload = {
                            ...txForm,
                            id: txForm.id || randomId(),
                            ...transactionData,
                            user_id: session?.user?.id ?? null,
                            userId: session?.user?.id ?? null,
                          };

                          // Atualiza estado/localStorage primeiro (funciona mesmo sem Supabase)
                          let newList;
                          if (txForm.id) {
                            newList = transactions.map((tx) => (tx.id === txForm.id ? payload : tx));
                          } else {
                            newList = [payload, ...transactions];
                          }

                          setTransactions(newList);
                          persistLocalSnapshot({ transactions: newList });
                          setTxForm(defaultTxForm);
                          setEtapaTx('lista');

                          // Se não tiver client ou sessão, para por aqui (modo offline)
                          if (!client || !session?.user?.id) {
                            console.warn('Sem client ou sessão – salvando só localmente.');
                            pushToast('Transação salva localmente. Configure o Supabase para sincronizar.', 'warning');
                            return;
                          }

                          try {
                            // Envia para a tabela transactions no Supabase
                            const { data, error } = await client
                              .from('transactions')
                              .upsert({
                                id: payload.id,
                                user_id: session.user.id,      // <- mesmo id do usuário autenticado
                                type: payload.type,
                                amount: payload.amount,
                                description: payload.description,
                                category: payload.category,
                                date: transactionData.date,
                              });

                            if (error) {
                              console.warn('Erro do Supabase ao salvar transação:', error);
                              throw error;
                            }

                            console.log('Transação sincronizada com Supabase:', data);
                            pushToast('Transação salva com sucesso!', 'success');

                            // Recarrega dados remotos para garantir que estado = banco
                            await loadRemoteData();
                          } catch (err) {
                            console.warn('Falha ao sincronizar transação com Supabase, usando apenas local.', err);
                            pushToast('Transação salva localmente. Configure o Supabase para sincronizar.', 'warning');
                          }
                        };

  const salvarTransacao = handleSaveTransaction;

  const valorValido = txForm.amount && Number(txForm.amount) > 0;
  const passoAtual = etapaTx === 'tipo'
    ? 1
    : etapaTx === 'detalhes'
      ? 3
      : 2;

  useEffect(() => {
    if (etapaTx === 'lista' || activeView !== 'transactions' || activeTab !== 'form') {
      setWizardAberto(false);
    }
  }, [etapaTx, activeView, activeTab]);

  const proximoPasso = () => {
    if (!txForm.amount || Number(txForm.amount) <= 0) {
      alert('Digite um valor para continuar');
      return;
    }

    setEtapaTx('detalhes');
  };



  const handleDeleteTransaction = async (tx) => {
    const newList = transactions.filter((item) => item.id !== tx.id);
    setTransactions(newList);
    persistLocalSnapshot({ transactions: newList });
    try {
      if (client && session) {
        const { error } = await client.from('transactions').delete().eq('id', tx.id).eq('user_id', session.user.id);
        if (error) throw error;
      }
      pushToast('Transação removida.', 'success');
    } catch (err) {
      console.warn('Falha ao remover transação no Supabase', err);
      pushToast('Transação removida localmente. Sincronize quando possível.', 'warning');
    }
  };

  const handleSaveEvent = async () => {
    const payload = { ...eventForm, id: eventForm.id || randomId(), user_id: session?.user?.id };
    const newList = eventForm.id
      ? events.map((ev) => (ev.id === eventForm.id ? payload : ev))
      : [payload, ...events];
    setEvents(newList);
    persistLocalSnapshot({ events: newList });
    setEventForm(defaultEventForm);
    try {
      if (client && session) {
        const { error } = await client.from('events').upsert({
          id: payload.id,
          title: payload.title,
          date: payload.date,
          start: payload.start,
          end: payload.end,
          notes: payload.notes,
          user_id: session.user.id
        });
        if (error) throw error;
      }
      pushToast('Evento salvo!', 'success');
      loadRemoteData();
    } catch (err) {
      console.warn('Falha ao sincronizar evento', err);
      pushToast('Evento salvo localmente. Configure o Supabase para sincronizar.', 'warning');
    }
  };

  const handleDeleteEvent = async (ev) => {
    const newList = events.filter((item) => item.id !== ev.id);
    setEvents(newList);
    persistLocalSnapshot({ events: newList });
    try {
      if (client && session) {
        const { error } = await client.from('events').delete().eq('id', ev.id).eq('user_id', session.user.id);
        if (error) throw error;
      }
      pushToast('Evento removido.', 'success');
    } catch (err) {
      console.warn('Falha ao remover evento no Supabase', err);
      pushToast('Evento removido localmente. Sincronize quando possível.', 'warning');
    }
  };

  const resetUserWizard = ({ closeModal = false } = {}) => {
    setUserForm(defaultUserForm);
    setEditUserForm(defaultEditUserForm);
    setNewPassword('');
    setConfirmPassword('');
    setEditingUserId(null);
    setEditingUserOriginal(null);
    setStep(1);
    setEditUserStep(1);
    if (closeModal) {
      setOpenUserModal(false);
    }
  };

  const resetAffiliateWizard = ({ closeModal = false } = {}) => {
    setAffiliateForm(createDefaultAffiliateForm());
    setStep(1);
    if (closeModal) {
      setShowForm(false);
    }
  };

  const handleSaveUser = async () => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem gerenciar usuários.', 'warning');
      return;
    }
    try {
      const hasPassword = typeof userForm.password === 'string' && userForm.password.trim().length >= 4;

      if (editingUserId) {
        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
          pushToast('Sessão expirada. Faça login novamente.', 'warning');
          return;
        }

        if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
          pushToast('Backend não configurado. Não é possível alterar e-mail/senha sem o backend.', 'warning');
          return;
        }

        const bodyPayload = {
          name: userForm.name,
          username: userForm.username,
          whatsapp: userForm.whatsapp,
          role: userForm.role,
        };

        if (hasPassword) {
          bodyPayload.password = userForm.password;
        }

        const response = await fetch(`${workoutApiBase}/admin/users/${editingUserId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(bodyPayload)
        });

        const body = await response.json().catch(() => ({}));
        if (response.status === 403) {
          handleApiForbidden();
          return;
        }
        if (!response.ok) {
          throw new Error(body.error || 'Erro ao atualizar usuário/senha.');
        }
      } else {
        if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
          pushToast(
            'API do backend não configurada. Verifique a variável do seu .env existente (ex.: VITE_API_BASE_URL) e faça rebuild/deploy do front.',
            'danger'
          );
          return;
        }

        // Criar usuário via backend
        if (!userForm.affiliate_id) {
          pushToast('Selecione um afiliado para continuar.', 'warning');
          return;
        }

        if (!userForm.plan_type) {
          pushToast('Selecione um plano para continuar.', 'warning');
          return;
        }

        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
          pushToast('Sessão expirada. Faça login novamente.', 'warning');
          return;
        }

        const createUserPayload = {
          name: userForm.name,
          email: userForm.username,
          whatsapp: userForm.whatsapp,
          role: userForm.role || 'user',
          affiliate_id: userForm.affiliate_id,
          plan_type: String(userForm.plan_type || '').trim().toLowerCase(),
        };

        const response = await fetch(`${workoutApiBase}/create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(createUserPayload)
        });

        const body = await response.json();
        if (response.status === 403) {
          handleApiForbidden();
          return;
        }
        if (!response.ok) {
          const backendError = String(body?.error || '');
          const normalizedError = backendError.toLowerCase();
          if (
            normalizedError === 'email_exists' ||
            normalizedError.includes('email_exists') ||
            normalizedError.includes('already been registered')
          ) {
            throw new Error('Esse email já está cadastrado.');
          }
          throw new Error(body.error || 'Erro ao criar usuário.');
        }
      }
      pushToast('Usuário sincronizado com o Supabase.', 'success');
      await loadRemoteData();
      resetUserWizard({ closeModal: true });
    } catch (err) {
      console.warn('Erro ao salvar usuário', err);
      pushToast(`Não foi possível salvar o usuário: ${err?.message || 'erro desconhecido'}`, 'danger');
    }
  };

  const updateUser = async () => {
    if (!client || !editingUserId) {
      pushToast('Usuário inválido para edição.', 'warning');
      return;
    }

    const canEditTarget = isAdmin || session?.user?.id === editingUserId;
    if (!canEditTarget) {
      pushToast('Sem permissão para editar este usuário.', 'warning');
      return;
    }

    try {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
        pushToast('Backend não configurado. Não é possível editar usuário.', 'warning');
        return;
      }

      if (isAdmin && !editUserForm.affiliate_id) {
        pushToast('Selecione um afiliado para salvar a edição.', 'warning');
        return;
      }

      if (isAdmin && !editUserForm.plan_type) {
        pushToast('Selecione um plano para salvar a edição.', 'warning');
        return;
      }

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          alert('Senhas não conferem');
          return;
        }

        const passwordResponse = await fetch(`${workoutApiBase}/users/${editingUserId}/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            password: newPassword
          })
        });

        const passwordBody = await passwordResponse.json().catch(() => ({}));
        if (passwordResponse.status === 403) {
          handleApiForbidden();
          return;
        }
        if (!passwordResponse.ok) {
          throw new Error(passwordBody.error || 'Erro ao atualizar senha.');
        }
      }

      const response = await fetch(`${workoutApiBase}/users/${editingUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: editUserForm.name,
          whatsapp: editUserForm.whatsapp,
        })
      });

      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        handleApiForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Erro ao atualizar usuário.');
      }

      const normalizedOriginalEmail = String(editingUserOriginal?.email || '').trim().toLowerCase();
      const normalizedUpdatedEmail = String(editUserForm.email || '').trim().toLowerCase();
      if (normalizedUpdatedEmail && normalizedUpdatedEmail !== normalizedOriginalEmail) {
        const emailResponse = await fetch(`${workoutApiBase}/users/${editingUserId}/email`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            email: normalizedUpdatedEmail,
          })
        });
        const emailBody = await emailResponse.json().catch(() => ({}));
        if (emailResponse.status === 403) {
          handleApiForbidden();
          return;
        }
        if (!emailResponse.ok) {
          throw new Error(emailBody.error || 'Erro ao atualizar email.');
        }
      }

      if (isAdmin) {
        const adminPatchResponse = await fetch(`${workoutApiBase}/admin/users/${editingUserId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            name: editUserForm.name,
            email: editUserForm.email,
            whatsapp: editUserForm.whatsapp,
            affiliate_id: editUserForm.affiliate_id || null,
            plan_type: editUserForm.plan_type,
          })
        });
        const adminPatchBody = await adminPatchResponse.json().catch(() => ({}));
        if (!adminPatchResponse.ok) {
          throw new Error(adminPatchBody.error || 'Erro ao atualizar dados administrativos.');
        }
      }

      pushToast('Usuário atualizado com sucesso.', 'success');
      await loadRemoteData();
      resetUserWizard({ closeModal: true });
    } catch (err) {
      console.warn('Erro ao atualizar usuário', err);
      pushToast(`Não foi possível atualizar o usuário: ${err?.message || 'erro desconhecido'}`, 'danger');
    }
  };

  const handleEditUserContinue = () => {
    if (editUserStep === 1) {
      if (!editUserForm.name?.trim() || !editUserForm.email?.trim()) {
        pushToast('Preencha nome e email para continuar.', 'warning');
        return;
      }
      setEditUserStep(2);
      return;
    }

    if (!editUserForm.whatsapp?.trim()) {
      pushToast('Preencha o WhatsApp para continuar.', 'warning');
      return;
    }

    if (isAdmin && !editUserForm.affiliate_id) {
      pushToast('Selecione um afiliado para continuar.', 'warning');
      return;
    }

    if (isAdmin && !editUserForm.plan_type) {
      pushToast('Selecione um plano para continuar.', 'warning');
      return;
    }

    setEditUserStep(3);
  };

  const handleSaveEditedUser = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      pushToast('As senhas não conferem.', 'warning');
      return;
    }
    await updateUser();
  };

  const handleDeleteUser = async (user) => {
    if (isOwnerUser(user)) {
      pushToast('Usuário principal não pode ser removido', 'warning');
      return;
    }

    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem excluir usuários.', 'warning');
      return;
    }

    const confirmed = window.confirm('Tem certeza? Isso apagará o usuário e TODOS os dados dele.');
    if (!confirmed) return;

    try {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
        pushToast('API do backend não configurada.', 'danger');
        return;
      }

      const targetId = user.id;

      const response = await fetch(`${workoutApiBase}/admin/users/${targetId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        handleApiForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Erro ao excluir usuário.');
      }

      setUsers((current) => current.filter((item) => item.id !== targetId));
      pushToast('Usuário removido.', 'success');
      await loadRemoteData();
    } catch (err) {
      console.warn('Erro ao remover usuário', err);
      pushToast('Configure permissões de delete na tabela profiles.', 'danger');
    }
  };

  const markAsPaid = async (id) => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem atualizar cobrança.', 'warning');
      return;
    }

    try {
      const targetUser = users.find((item) => item.id === id);
      if (isOwnerUser(targetUser)) {
        pushToast('Usuário principal já é considerado pago.', 'warning');
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const response = await fetch(`${workoutApiBase}/admin/users/${id}/mark-paid`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao marcar usuário como pago.');
      }

      pushToast('Pagamento marcado com sucesso.', 'success');
      await loadRemoteData();
    } catch (err) {
      console.warn('Erro ao marcar usuário como pago', err);
      pushToast('Não foi possível marcar como pago.', 'danger');
    }
  };

  const activateUser = async (id) => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem alterar status.', 'warning');
      return;
    }

    try {
      const targetUser = users.find((item) => item.id === id);
      if (isOwnerUser(targetUser)) {
        pushToast('Usuário principal permanece ativo.', 'warning');
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const response = await fetch(`${workoutApiBase}/admin/users/${id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao ativar usuário.');
      }

      pushToast('Usuário ativado com sucesso.', 'success');
      await loadRemoteData();
    } catch (err) {
      console.warn('Erro ao ativar usuário', err);
      pushToast('Não foi possível ativar o usuário.', 'danger');
    }
  };

  const deactivateUser = async (id) => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem alterar status.', 'warning');
      return;
    }

    try {
      const targetUser = users.find((item) => item.id === id);
      if (isOwnerUser(targetUser)) {
        pushToast('Usuário principal não pode ser desativado.', 'warning');
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const response = await fetch(`${workoutApiBase}/admin/users/${id}/deactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao inativar usuário.');
      }

      pushToast('Usuário inativado com sucesso.', 'success');
      await loadRemoteData();
    } catch (err) {
      console.warn('Erro ao inativar usuário', err);
      pushToast('Não foi possível inativar o usuário.', 'danger');
    }
  };

  const openPromoteAffiliateModal = (user) => {
    const suggestedCode = generateAffiliateCodeSuggestion(user?.name || user?.username || '');
    setSelectedUserToPromote(user);
    setAffiliateDraft({
      linkedUserId: user?.id || '',
      name: user?.name || '',
      email: user?.email || user?.username || '',
      whatsapp: user?.whatsapp || '',
      code: suggestedCode,
      status: 'active',
    });
    setAffiliateModalOpen(true);
  };

  const closePromoteAffiliateModal = () => {
    setAffiliateModalOpen(false);
    setSelectedUserToPromote(null);
    setAffiliateDraft(createDefaultAffiliatePromotionDraft());
  };

  const handlePromoteToAffiliate = async () => {
    if (!selectedUserToPromote?.id) return;
    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
      pushToast('Backend não configurado para afiliados.', 'warning');
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const payload = {
        name: affiliateDraft.name?.trim(),
        email: affiliateDraft.email?.trim(),
        whatsapp: affiliateDraft.whatsapp?.trim(),
        affiliate_code: affiliateDraft.code?.trim(),
        status: affiliateDraft.status || 'active',
      };

      const response = await fetch(
        `${workoutApiBase}/admin/users/${selectedUserToPromote.id}/promote-to-affiliate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        handleApiForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error || 'Não foi possível promover o usuário.');
      }

      closePromoteAffiliateModal();
      pushToast('Usuário promovido para afiliado com sucesso', 'success');
      await Promise.all([loadRemoteData(), fetchAffiliates()]);
    } catch (err) {
      console.warn('Erro ao promover usuário para afiliado', err);
      pushToast(err?.message || 'Não foi possível promover o usuário.', 'danger');
    }
  };



  const normalizeAffiliateStats = (item) => ({
    ...item,
    commission_cents: Number(item?.commission_cents || 0),
    is_active: item?.is_active === true,
  });

  const fetchAffiliates = async () => {
    if (!client || profile?.role !== 'admin') return;

    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
      pushToast('Backend não configurado para afiliados.', 'warning');
      return;
    }

    setAffiliatesLoading(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const response = await fetch(`${workoutApiBase}/admin/affiliates`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const body = await response.json().catch(() => ([]));

      if (response.status === 403) {
        handleApiForbidden();
        return;
      }

      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao carregar afiliados.');
      }

      const parsed = Array.isArray(body) ? body.map(normalizeAffiliateStats) : [];
      setAffiliates(parsed);
    } catch (err) {
      console.warn('Erro ao carregar afiliados', err);
      setAffiliates([]);
      pushToast('Não foi possível carregar afiliados.', 'warning');
    } finally {
      setAffiliatesLoading(false);
    }
  };

  const handleSaveAffiliate = async () => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem criar afiliados.', 'warning');
      return;
    }

    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) {
      pushToast('Backend não configurado para afiliados.', 'warning');
      return;
    }

    if (!affiliateForm.name.trim() || !affiliateForm.email.trim()) {
      pushToast('Informe nome e e-mail do afiliado.', 'warning');
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const payload = {
        name: affiliateForm.name.trim(),
        whatsapp: affiliateForm.whatsapp || undefined,
        email: affiliateForm.email.trim(),
        pix_key: affiliateForm.pix_key || undefined,
      };

      const response = await fetch(`${workoutApiBase}/admin/affiliates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => ({}));

      if (response.status === 403) {
        handleApiForbidden();
        return;
      }

      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao criar afiliado.');
      }

      pushToast('Afiliado criado.', 'success');
      resetAffiliateWizard({ closeModal: true });
      fetchAffiliates();
    } catch (err) {
      console.warn('Erro ao salvar afiliado', err);
      pushToast(err?.message || 'Erro ao salvar afiliado.', 'danger');
    }
  };

  const fetchUsersByAffiliate = async (affiliateId) => {
    const accessToken = await getAccessToken();
    if (!accessToken) return [];

    const response = await fetch(`${workoutApiBase}/admin/users?affiliate_id=${affiliateId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const body = await response.json().catch(() => ([]));
    if (response.status === 403) {
      handleApiForbidden();
      return [];
    }
    if (!response.ok) {
      throw new Error(body?.error || 'Erro ao carregar usuários do afiliado.');
    }

    return Array.isArray(body) ? body : [];
  };

  const toggleAffiliate = async (id) => {
    const isExpanding = expandedAffiliateId !== id;
    setExpandedAffiliateId((prev) => (prev === id ? null : id));
    if (!isExpanding || affiliateUsers[id]) return;
    if (!client || profile?.role !== 'admin') return;
    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) return;

    setAffiliateUsersLoadingId(id);
    try {
      const users = await fetchUsersByAffiliate(id);
      setAffiliateUsers((prev) => ({
        ...prev,
        [id]: users,
      }));
    } catch (err) {
      console.warn('Erro ao listar usuários do afiliado', err);
      pushToast('Não foi possível carregar os usuários desse afiliado.', 'warning');
    } finally {
      setAffiliateUsersLoadingId((prev) => (prev === id ? null : prev));
    }
  };

  const deleteAffiliate = async (id) => {
    const confirmDelete = window.confirm('Tem certeza que deseja excluir este afiliado?');
    if (!confirmDelete) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const response = await fetch(`${workoutApiBase}/admin/affiliates/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        handleApiForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao excluir afiliado.');
      }

      pushToast('Afiliado excluído com sucesso.', 'success');
      setExpandedAffiliateId((prev) => (prev === id ? null : prev));
      setAffiliateUsers((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchAffiliates();
    } catch (err) {
      console.warn('Erro ao excluir afiliado', err);
      pushToast(err?.message || 'Não foi possível excluir o afiliado.', 'danger');
    }
  };


  const toggleSidebar = () => {
    setSidebarOpen((current) => !current);
  };

  const handleSidebarNavigation = (view) => {
    setActiveView(view);
  };

  const sidebarItems = [
    { key: 'transactions', label: '💰 Transações' },
    { key: 'agenda', label: '📅 Agenda' },
    { key: 'users', label: '👤 Usuários' },
    ...(isAdmin
        ? [
          { key: 'finance', label: '💳 Financeiro' },
          { key: 'affiliates', label: '🤝 Afiliados' },
        ]
      : []),
    ...((isAdmin || isAffiliate)
      ? [{ key: 'supervisor', label: '👁 Supervisor' }]
      : []),
    { key: 'workout', label: '🏋️ Treino' },
    { key: 'foodDiary', label: '🍽 Alimentação' },
    { key: 'generalReport', label: '📊 Relatório Geral' },
  ];

  if (!session) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <LoginScreen
          form={loginForm}
          onChange={setLoginForm}
          onSubmit={handleLogin}
          loading={loginLoading || loadingSession}
          error={loginError}
          configError={configError}
        />
      </>
    );
  }

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <button
        className="menu-toggle"
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
        aria-expanded={sidebarOpen}
        type="button"
      >
        ☰
      </button>

      <div
        id="overlay"
        className={`overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
      />

      <div id="sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          Gestão Pessoal
        </div>

        {sidebarItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item ${activeView === item.key ? 'active' : ''}`}
            onClick={() => handleSidebarNavigation(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="main-content">
        <DashboardHeader
          apiUrl={window.APP_CONFIG?.supabaseUrl}
          profile={profile}
          onLogout={handleLogout}
          profileDetails={profileDetails}
        />

        {activeView === 'transactions' && (
        <div className="container single-card app-content">
          <section className="card dashboard-card module-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <h2 style={{ margin: 0 }}>
                💰 Transações
              </h2>

              <button
                className="btn-primary"
                onClick={() => {
                  setActiveTab('form');
                  setWizardAberto(true);
                  setEtapaTx('tipo');
                }}
                style={{ fontSize: '15px' }}
              >
                + Nova Transação
              </button>
            </div>

            {!wizardAberto && (
              <div className="tabs">
                <button className={activeTab === 'form' ? 'subtab active' : 'subtab'} onClick={() => setActiveTab('form')}>
                  📋 Cadastro
                </button>
                <button className={activeTab === 'reports' ? 'subtab active' : 'subtab'} onClick={() => setActiveTab('reports')}>
                  📊 Relatórios
                </button>
              </div>
            )}

          {activeTab === 'form' && (
            <div id="tab-form">
              {!wizardAberto && etapaTx === 'lista' && (
                <>
                  <div className="card" style={{ padding: 14, marginTop: 14 }}>
                    <button
                      className="ghost"
                      onClick={() => setTxAdvancedOpen((v) => !v)}
                      style={{ width: '100%' }}
                    >
                      🔎 Abrir pesquisa avançada (De/Até)
                    </button>

                    {txAdvancedOpen && (
                      <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 180px' }}>
                            <label>Tipo</label>
                            <select
                              value={txFilters.type}
                              onChange={(e) => setTxFilters({ ...txFilters, type: e.target.value })}
                              style={{ width: '100%' }}
                            >
                              <option value="">Todos</option>
                              <option value="income">Receitas</option>
                              <option value="expense">Despesas</option>
                            </select>
                          </div>
                          <div style={{ flex: '2 1 260px' }}>
                            <label>Categoria</label>
                            <select
                              value={txFilters.category}
                              onChange={(e) => setTxFilters({ ...txFilters, category: e.target.value })}
                              style={{ width: '100%' }}
                            >
                              <option value="">Todas categorias</option>
                              {txCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ flex: '1 1 200px' }}>
                            <label>De</label>
                            <input
                              type="date"
                              value={txFilters.from}
                              onChange={(e) => setTxFilters({ ...txFilters, from: e.target.value })}
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div style={{ flex: '1 1 200px' }}>
                            <label>Até</label>
                            <input
                              type="date"
                              value={txFilters.to}
                              onChange={(e) => setTxFilters({ ...txFilters, to: e.target.value })}
                              style={{ width: '100%' }}
                            />
                          </div>
                      </div>
                    )}
                  </div>

                  <div className="sep"></div>

                  <SummaryKpis totals={kpis} />

                  <div className="sep"></div>

                  <TransactionsTable
                    items={filteredTransactions}
                    onEdit={(tx) => {
                      setTxForm(tx);
                      setActiveTab('form');
                      setWizardAberto(true);
                      setEtapaTx('detalhes');
                    }}
                    onDelete={handleDeleteTransaction}
                  />
                </>
              )}
            </div>
          )}

          {wizardAberto && activeTab === 'form' && (
            <div className="modal-overlay">
              <div className="report-modal">
                <h2>Nova transação</h2>
                <p>Passo {passoAtual} de 3</p>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(passoAtual / 3) * 100}%` }}
                  />
                </div>

                {etapaTx === 'tipo' && (
                  <div>
                    <h3>O que deseja registrar?</h3>

                    <button
                      className={`treino-option ${txForm.type === 'income' ? 'selected' : ''}`}
                      onClick={() => setTxForm({ ...txForm, type: 'income' })}
                    >
                      💵 Receita
                    </button>

                    <button
                      className={`treino-option ${txForm.type === 'expense' ? 'selected' : ''}`}
                      onClick={() => setTxForm({ ...txForm, type: 'expense' })}
                    >
                      💸 Despesa
                    </button>
                  </div>
                )}

                {etapaTx === 'categoria' && (
                  <div>
                    <h3>Escolha a categoria</h3>

                    <select
                      value={txForm.category}
                      onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        marginBottom: '15px'
                      }}
                    >
                      <option value="">Selecione</option>

                      {txForm.type === 'income' && (
                        <>
                          <option value="salario">Salário</option>
                          <option value="vendas">Vendas</option>
                          <option value="servicos">Serviços</option>
                          <option value="investimentos">Investimentos</option>
                          <option value="outros">Outros</option>
                        </>
                      )}

                      {txForm.type === 'expense' && (
                        <>
                          <option value="alimentacao">Alimentação</option>
                          <option value="transporte">Transporte</option>
                          <option value="moradia">Moradia</option>
                          <option value="lazer">Lazer</option>
                          <option value="saude">Saúde</option>
                          <option value="outros">Outros</option>
                        </>
                      )}
                    </select>
                  </div>
                )}

                {etapaTx === 'valor' && (
                  <div>
                    <h3>Digite o valor</h3>

                    <input
                      type="number"
                      value={txForm.amount}
                      onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '16px',
                        fontSize: '18px',
                        marginBottom: '15px'
                      }}
                    />
                  </div>
                )}

                {etapaTx === 'detalhes' && (
                  <div>
                    <h3>Finalizar lançamento</h3>

                    <label>Data</label>

                    <input
                      type="date"
                      value={txForm.date}
                      onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                      style={{ width: '100%', marginBottom: '10px' }}
                    />

                    <label>Descrição</label>

                    <input
                      value={txForm.description}
                      onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                      style={{ width: '100%', marginBottom: '15px' }}
                    />
                  </div>
                )}

                <div className="wizard-actions">
                  {etapaTx !== 'tipo' && (
                    <button
                      onClick={() => {
                        if (etapaTx === 'categoria') {
                          setEtapaTx('tipo');
                        } else if (etapaTx === 'valor') {
                          setEtapaTx('categoria');
                        } else {
                          setEtapaTx('valor');
                        }
                      }}
                    >
                      ← Voltar
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      if (etapaTx === 'tipo') {
                        setEtapaTx('categoria');
                        return;
                      }
                      if (etapaTx === 'categoria') {
                        setEtapaTx('valor');
                        return;
                      }
                      if (etapaTx === 'valor') {
                        proximoPasso();
                        return;
                      }
                      await salvarTransacao();
                      setWizardAberto(false);
                      setEtapaTx('lista');
                    }}
                    disabled={(etapaTx === 'valor' && !valorValido) || (etapaTx === 'categoria' && !txForm.category)}
                  >
                    {etapaTx === 'detalhes' ? 'Salvar Transação' : 'Continuar →'}
                  </button>

                  <button onClick={() => {
                    setWizardAberto(false);
                    setEtapaTx('lista');
                  }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && <Reports transactions={filteredTransactions} />}
        </section>
        </div>
      )}


      {activeView === 'agenda' && (
        <div className="container single-card app-content">
          <Agenda />
        </div>
      )}

      {activeView === 'users' && (
        <div className="container single-card app-content admin-users-container">
          <section className="card admin-card module-card" id="adminUsersSection">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <h1 className="title" style={{ marginBottom: 4 }}>
                  {users?.length === 1 ? 'Minha Conta' : 'Cadastro de Usuários'}
                </h1>
                <p className="muted">
                  {isAdmin ? 'Somente administradores podem gerenciar todos os usuários.' : 'Gerencie os dados da sua conta.'}
                </p>
              </div>

              {isAdmin && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    resetUserWizard();
                    setOpenUserModal(true);
                    setStep(1);
                  }}
                >
                  + Novo Usuário
                </button>
              )}
            </div>

            <UsersTable
              items={users.map((user) => ({ ...user, _editing: user.id === editingUserId }))}
              affiliateNameById={affiliateNameById}
              currentUser={currentUser}
              onOpenBodyModal={openBodyModal}
              onOpenDailyWeightModal={openDailyWeightModal}
              onOpenWeightHistoryModal={openWeightHistoryModal}
              onOpenGoalsModal={openGoalsModal}
              onEdit={(user) => {
                setEditingUserId(user.id);
                setEditingUserOriginal(user);
                setEditUserStep(1);
                setEditUserForm({
                  name: user.name || '',
                  email: user.email || user.username || '',
                  whatsapp: user.whatsapp || '',
                  affiliate_id: user.affiliate_id || '',
                  plan_type: user.plan_type || '',
                });
                setOpenUserModal(true);
              }}
              onDelete={handleDeleteUser}
              onPromoteToAffiliate={openPromoteAffiliateModal}
            />

            {openUserModal && editingUserId && (
              <div className="modal-overlay" onClick={() => resetUserWizard({ closeModal: true })}>
                <div className="report-modal wizard-modal-user" onClick={(e) => e.stopPropagation()}>
                  <h2>Editar usuário</h2>
                  <p className="muted modal-step-label">{`Passo ${editUserStep} de 3`}</p>

                  <div className="progress-bar wizard-progress-wrap">
                    <div
                      className="progress-fill"
                      style={{ width: `${(editUserStep / 3) * 100}%` }}
                    />
                  </div>

                  {editUserStep === 1 && (
                    <div className="wizard-field-stack">
                      <h3>Dados básicos</h3>
                      <label>Nome</label>
                      <input
                        value={editUserForm.name}
                        onChange={(e) => setEditUserForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Nome"
                      />

                      <label>Email</label>
                      <input
                        value={editUserForm.email}
                        onChange={(e) => setEditUserForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="Email"
                      />
                    </div>
                  )}

                  {editUserStep === 2 && (
                    <div className="wizard-field-stack">
                      <h3>Contato e vínculo</h3>
                      <label>WhatsApp</label>
                      <input
                        value={editUserForm.whatsapp}
                        onChange={(e) => setEditUserForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                        placeholder="WhatsApp"
                      />

                      {isAdmin && (
                        <>
                          <label>Afiliado</label>
                          <select
                            value={editUserForm.affiliate_id}
                            onChange={(e) => setEditUserForm((prev) => ({ ...prev, affiliate_id: e.target.value }))}
                          >
                            <option value="">Selecione um afiliado</option>
                            {activeAffiliates.map((affiliate) => (
                              <option key={affiliate.id} value={affiliate.id}>
                                {affiliate.name}{affiliate.code ? ` (${affiliate.code})` : ''}
                              </option>
                            ))}
                          </select>
                          {activeAffiliates.length === 0 && (
                            <p className="muted">Nenhum afiliado ativo disponível no momento.</p>
                          )}

                          <label>Plano</label>
                          <select
                            value={editUserForm.plan_type}
                            onChange={(e) => setEditUserForm((prev) => ({ ...prev, plan_type: e.target.value }))}
                          >
                            <option value="">Selecione um plano</option>
                            {USER_PLAN_OPTIONS.map((plan) => (
                              <option key={plan.value} value={plan.value}>
                                {plan.label}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  )}

                  {editUserStep === 3 && (
                    <div className="wizard-field-stack">
                      <h3>Segurança</h3>
                      <label>Nova senha (opcional)</label>
                      <input
                        type="password"
                        placeholder="Nova senha (opcional)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />

                      <label>Confirmar nova senha</label>
                      <input
                        type="password"
                        placeholder="Confirmar nova senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="wizard-actions">
                    {editUserStep > 1 && (
                      <button type="button" className="btn-ui" onClick={() => setEditUserStep((prev) => prev - 1)}>
                        ← Voltar
                      </button>
                    )}

                    {editUserStep < 3 ? (
                      <button type="button" className="btn-primary btn-ui" onClick={handleEditUserContinue}>
                        Continuar →
                      </button>
                    ) : (
                      <button type="button" className="btn-primary btn-ui" onClick={handleSaveEditedUser}>
                        Salvar
                      </button>
                    )}

                    <button type="button" className="btn-ui" onClick={() => resetUserWizard({ closeModal: true })}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {openUserModal && !editingUserId && (
              <div className="modal-overlay">
                <div className="report-modal">
                  <h2>Novo usuário</h2>
                  <p>Passo {step} de 3</p>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(step / 3) * 100}%` }}
                    />
                  </div>

                  {step === 1 && (
                    <div>
                      <h3>Dados básicos</h3>

                      <label>Nome</label>
                      <input
                        value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                        placeholder="Nome completo"
                      />

                      <label>Usuário</label>
                      <input
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                        placeholder="ex.: joaosilva"
                      />
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <h3>Acesso</h3>

                      <label>Senha inicial</label>
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder="Mínimo de 4 caracteres"
                      />

                      <label>WhatsApp</label>
                      <input
                        value={userForm.whatsapp}
                        onChange={(e) => setUserForm({ ...userForm, whatsapp: e.target.value })}
                        placeholder="+5511999999999"
                      />
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <h3>Configuração</h3>

                      <label>Criado em</label>
                      <input
                        type="date"
                        value={today}
                        readOnly
                        disabled
                      />

                      <label>Perfil</label>
                      <select
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                      </select>

                      <label>Afiliado *</label>
                      <select
                        value={userForm.affiliate_id}
                        onChange={(e) => setUserForm({ ...userForm, affiliate_id: e.target.value })}
                      >
                        <option value="">Selecione um afiliado</option>
                        {activeAffiliates.map((affiliate) => (
                          <option key={affiliate.id} value={affiliate.id}>
                            {affiliate.name}{affiliate.code ? ` (${affiliate.code})` : ''}
                          </option>
                        ))}
                      </select>
                      {activeAffiliates.length === 0 && (
                        <p className="muted">Não há afiliados ativos retornados pela API.</p>
                      )}

                      <label>Plano *</label>
                      <select
                        value={userForm.plan_type}
                        onChange={(e) => setUserForm({ ...userForm, plan_type: e.target.value })}
                      >
                        <option value="">Selecione um plano</option>
                        {USER_PLAN_OPTIONS.map((plan) => (
                          <option key={plan.value} value={plan.value}>
                            {plan.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="wizard-actions">
                    {step > 1 && (
                      <button className="btn-ui" onClick={() => setStep(step - 1)}>
                        ← Voltar
                      </button>
                    )}

                    {step < 3 ? (
                      <button className="btn-primary btn-ui" onClick={() => setStep(step + 1)}>
                        Continuar →
                      </button>
                    ) : (
                      <button className="btn-primary btn-ui" onClick={handleSaveUser}>
                        Criar usuário
                      </button>
                    )}

                    <button
                      className="btn-ui"
                      onClick={() => {
                        resetUserWizard({ closeModal: true });
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bodyModalUser && (
              <div className="modal-overlay" onClick={() => { setBodyModalUser(null); setBodyModalStep(1); }}>
                <div className="report-modal wizard-modal-user" onClick={(e) => e.stopPropagation()}>
                  <h2>Atualizar dados corporais</h2>
                  <p className="muted modal-step-label">{`Passo ${bodyModalStep} de 2 — ${bodyModalStep === 1 ? 'Dados básicos' : 'Medidas e objetivo'}`}</p>
                  <div className="progress-bar wizard-progress-wrap">
                    <div
                      className="progress-fill"
                      style={{ width: `${(bodyModalStep / 2) * 100}%` }}
                    />
                  </div>
                  {bodyModalStep === 1 && (
                    <div className="wizard-field-stack">
                      <h3>Dados básicos</h3>
                      <label>Sexo</label>
                      <select value={bodyDraft.sex} onChange={(e) => setBodyDraft((prev) => ({ ...prev, sex: e.target.value }))}>
                        <option value="">Selecione</option>
                        <option value="male">Masculino</option>
                        <option value="female">Feminino</option>
                      </select>
                      <label>Idade</label>
                      <input type="number" value={bodyDraft.age} onChange={(e) => setBodyDraft((prev) => ({ ...prev, age: e.target.value }))} />
                    </div>
                  )}
                  {bodyModalStep === 2 && (
                    <div className="wizard-field-stack">
                      <h3>Medidas e objetivo</h3>
                      <label>Altura (cm)</label>
                      <input type="number" value={bodyDraft.height_cm} onChange={(e) => setBodyDraft((prev) => ({ ...prev, height_cm: e.target.value }))} />
                      <label>Peso atual (kg)</label>
                      <input type="number" step="0.1" value={bodyDraft.weight} onChange={(e) => setBodyDraft((prev) => ({ ...prev, weight: e.target.value }))} />
                      <label>Meta de peso (kg)</label>
                      <input type="number" step="0.1" value={bodyDraft.goal_weight} onChange={(e) => setBodyDraft((prev) => ({ ...prev, goal_weight: e.target.value }))} />
                      <label>Objetivo</label>
                      <select value={bodyDraft.objective} onChange={(e) => setBodyDraft((prev) => ({ ...prev, objective: e.target.value }))}>
                        <option value="perder_peso">Perder peso</option>
                        <option value="manter_peso">Manter peso</option>
                        <option value="ganhar_massa">Ganhar massa</option>
                      </select>
                    </div>
                  )}
                  <div className="wizard-actions">
                    {bodyModalStep > 1 && (
                      <button className="btn-ui" onClick={() => setBodyModalStep(1)}>← Voltar</button>
                    )}
                    {bodyModalStep === 1 ? (
                      <button className="btn-primary btn-ui" onClick={() => setBodyModalStep(2)}>Continuar →</button>
                    ) : (
                      <button className="btn-primary btn-ui" onClick={saveBodyData}>Salvar</button>
                    )}
                    <button className="btn-ui" onClick={() => { setBodyModalUser(null); setBodyModalStep(1); }}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {dailyWeightModalUser && (
              <div className="modal-overlay" onClick={() => { setDailyWeightModalUser(null); setDailyWeightStep(1); }}>
                <div className="report-modal report-modal-compact wizard-modal-user" onClick={(e) => e.stopPropagation()}>
                  <h2>Registrar peso do dia</h2>
                  <p className="muted modal-step-label">{`Passo ${dailyWeightStep} de 2 — ${dailyWeightStep === 1 ? 'Data do registro' : 'Peso'}`}</p>
                  <div className="progress-bar wizard-progress-wrap">
                    <div
                      className="progress-fill"
                      style={{ width: `${(dailyWeightStep / 2) * 100}%` }}
                    />
                  </div>

                  {dailyWeightStep === 1 && (
                    <div className="wizard-field-stack">
                      <h3>Data do registro</h3>
                      <label>Data</label>
                      <input
                        type="date"
                        value={dailyWeightDraft.entry_date}
                        onChange={(e) => setDailyWeightDraft((prev) => ({ ...prev, entry_date: e.target.value }))}
                      />
                    </div>
                  )}

                  {dailyWeightStep === 2 && (
                    <div className="wizard-field-stack">
                      <h3>Peso</h3>
                      <label>Peso (kg)</label>
                      <input type="number" step="0.1" value={dailyWeightDraft.weight_kg} onChange={(e) => setDailyWeightDraft((prev) => ({ ...prev, weight_kg: e.target.value }))} />
                    </div>
                  )}

                  <div className="wizard-actions">
                    {dailyWeightStep > 1 && (
                      <button className="btn-ui" onClick={() => setDailyWeightStep(1)}>← Voltar</button>
                    )}
                    {dailyWeightStep === 1 ? (
                      <button className="btn-primary btn-ui" onClick={() => setDailyWeightStep(2)}>Continuar →</button>
                    ) : (
                      <button className="btn-primary btn-ui" onClick={saveDailyWeight}>Salvar</button>
                    )}
                    <button className="btn-ui" onClick={() => { setDailyWeightModalUser(null); setDailyWeightStep(1); }}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {goalsModalUser && (
              <div className="modal-overlay" onClick={() => { setGoalsModalUser(null); setGoalsModalStep(1); }}>
                <div className="report-modal wizard-modal-user" onClick={(e) => e.stopPropagation()}>
                  <h2>Definir metas</h2>
                  <p className="muted modal-step-label">{`Passo ${goalsModalStep} de 2 — ${goalsModalStep === 1 ? 'Objetivo' : 'Metas nutricionais'}`}</p>
                  <div className="progress-bar wizard-progress-wrap">
                    <div
                      className="progress-fill"
                      style={{ width: `${(goalsModalStep / 2) * 100}%` }}
                    />
                  </div>
                  {goalsModalStep === 1 && (
                    <div className="wizard-field-stack">
                      <h3>Objetivo</h3>
                      <label>Objetivo</label>
                      <select value={goalsDraft.objective} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, objective: e.target.value }))}>
                        <option value="perder_peso">Emagrecer</option>
                        <option value="ganhar_massa">Ganhar massa</option>
                        <option value="manter_peso">Manter peso</option>
                      </select>
                    </div>
                  )}
                  {goalsModalStep === 2 && (
                    <div className="wizard-field-stack">
                      <h3>Metas nutricionais</h3>
                      <label>Calorias (kcal)</label>
                      <input type="number" value={goalsDraft.calorie_goal} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, calorie_goal: e.target.value }))} />
                      <label>Proteína (g)</label>
                      <input type="number" value={goalsDraft.protein_goal} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, protein_goal: e.target.value }))} />
                      <label>Água (L)</label>
                      <input type="number" step="0.1" value={goalsDraft.water_goal_l} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, water_goal_l: e.target.value }))} />
                    </div>
                  )}
                  <div className="wizard-actions">
                    {goalsModalStep > 1 && (
                      <button className="btn-ui" onClick={() => setGoalsModalStep(1)}>← Voltar</button>
                    )}
                    {goalsModalStep === 1 ? (
                      <button className="btn-primary btn-ui" onClick={() => setGoalsModalStep(2)}>Continuar →</button>
                    ) : (
                      <button className="btn-primary btn-ui" onClick={saveManualGoals}>Salvar</button>
                    )}
                    <button className="btn-ui" onClick={() => { setGoalsModalUser(null); setGoalsModalStep(1); }}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {weightHistoryModalUser && (
              <div className="modal-overlay" onClick={() => setWeightHistoryModalUser(null)}>
                <div className="report-modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Histórico de peso</h2>
                  <div className="usuarios-scroll-container" style={{ maxHeight: 320 }}>
                    {weightHistoryItems.length === 0 ? (
                      <p className="muted">Nenhum peso registrado.</p>
                    ) : (
                      weightHistoryItems.map((item) => (
                        <div key={`${item.entry_date}-${item.recorded_at}`} className="event-subtitle">
                          <strong>{formatDate(item.entry_date)}</strong> — {formatMetricValue(item.weight_kg, 'kg')}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="wizard-actions">
                    <button className="btn-ui" onClick={() => setWeightHistoryModalUser(null)}>Fechar</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeView === 'finance' && isAdmin && (
        <div className="container single-card app-content admin-users-container">
          <section className="card admin-card module-card finance-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <h1 className="title" style={{ marginBottom: 4 }}>💰 Financeiro</h1>
                <p className="muted">Controle operacional financeiro centralizado.</p>
              </div>
            </div>

            <div className="tabs" style={{ marginBottom: 16 }}>
              <button
                className={financeTab === 'controle' ? 'subtab active active-tab' : 'subtab'}
                onClick={() => setFinanceTab('controle')}
              >
                📋 Controle
              </button>
              <button
                className={financeTab === 'relatorios' ? 'subtab active active-tab' : 'subtab'}
                onClick={() => setFinanceTab('relatorios')}
              >
                📊 Relatórios
              </button>
            </div>

            {financeTab === 'controle' && (
              <>
                <div className="financial-summary">
                  <div className="financial-summary-card card-finance card-success financial-summary-green">Total recebido: {formatCurrency(financeSummary?.totalReceivedMonth || 0)}</div>
                  <div className="financial-summary-card card-finance card-warning financial-summary-yellow">Total pendente: {formatCurrency(financeSummary?.totalPending || 0)}</div>
                  <div className="financial-summary-card card-finance card-danger financial-summary-red">Total atrasado: {formatCurrency(financeSummary?.totalOverdue || 0)}</div>
                  <div className="financial-summary-card card-finance">Usuários pagos: {financeSummary?.paidUsers || 0}</div>
                  <div className="financial-summary-card card-finance">Vencendo hoje: {financeSummary?.usersDueToday || 0}</div>
                  <div className="financial-summary-card card-finance">Atrasados: {financeSummary?.usersOverdue || 0}</div>
                  <div className="financial-summary-card card-finance">Bloqueados: {financeSummary?.usersBlocked || 0}</div>
                  <div className="financial-summary-card card-finance">Receita estimada: {formatCurrency(financeSummary?.estimatedMonthlyRevenue || 0)}</div>
                </div>

                <div className="grid grid-2" style={{ marginBottom: 16 }}>
                  <input
                    placeholder="Buscar por nome, email ou whatsapp"
                    value={financeFilters.search}
                    onChange={(e) => setFinanceFilters((prev) => ({ ...prev, search: e.target.value }))}
                  />
                  <select value={financeFilters.status} onChange={(e) => setFinanceFilters((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="todos">todos</option><option value="pagos">pagos</option><option value="pendentes">pendentes</option>
                    <option value="vencendo hoje">vencendo hoje</option><option value="atrasados">atrasados</option>
                    <option value="bloqueados">bloqueados</option><option value="ativos">ativos</option><option value="inativos">inativos</option>
                  </select>
                  <select value={financeFilters.plan} onChange={(e) => setFinanceFilters((prev) => ({ ...prev, plan: e.target.value }))}>
                    <option value="">Todos os planos</option>
                    {USER_PLAN_OPTIONS.map((plan) => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
                  </select>
                  <select value={financeFilters.affiliateId} onChange={(e) => setFinanceFilters((prev) => ({ ...prev, affiliateId: e.target.value }))}>
                    <option value="">Todos os afiliados</option>
                    {activeAffiliates.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.name}</option>)}
                  </select>
                  <select value={financeFilters.sort} onChange={(e) => setFinanceFilters((prev) => ({ ...prev, sort: e.target.value }))}>
                    <option value="name">nome</option>
                    <option value="due_date">vencimento mais próximo</option>
                    <option value="overdue">atraso</option>
                    <option value="last_payment">último pagamento</option>
                  </select>
                </div>

                <FinanceTable
                  items={financeUsers}
                  affiliateNameById={affiliateNameById}
                  onMarkPaid={(id) => runFinanceAction(`/admin/finance/users/${id}/mark-paid`, 'Pagamento registrado com sucesso.').catch((err) => pushToast(err.message, 'danger'))}
                  onBlock={(id) => runFinanceAction(`/admin/finance/users/${id}/block`, 'Usuário bloqueado com sucesso.').catch((err) => pushToast(err.message, 'danger'))}
                  onUnblock={(id) => unblockUser(id).catch((err) => pushToast(err.message, 'danger'))}
                  onHistory={(user) => openFinanceHistory(user).catch((err) => pushToast(err.message, 'danger'))}
                />
              </>
            )}

            {financeTab === 'relatorios' && (
              <FinanceReports
                formatCurrency={formatCurrency}
                apiBase={workoutApiBase}
                getAccessToken={getAccessToken}
              />
            )}
          </section>
        </div>
      )}

      {activeView === 'supervisor' && (isAdmin || isAffiliate) && (
        <Supervisor
          apiBase={workoutApiBase}
          getAccessToken={getAccessToken}
          role={currentUserRole}
          currentUserId={session?.user?.id}
          currentAffiliateId={profileDetails?.affiliate_id || profile?.affiliate_id || null}
          pushToast={pushToast}
        />
      )}

      {activeView === 'affiliates' && isAdmin && (
        <div className="container single-card app-content admin-users-container">
          <section className="card admin-card module-card" id="adminAffiliatesSection">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <h2 className="title" style={{ marginBottom: 4 }}>Afiliados</h2>
                <p className="muted">Gerencie parceiros e visualize seus clientes.</p>
              </div>

            </div>

            {showForm && (
              <div className="modal-overlay">
                <div className="modal-card">
                  <h2>Novo Afiliado</h2>
                  <p>Passo {step} de 3</p>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(step / 3) * 100}%` }}
                    />
                  </div>

                  {step === 1 && (
                    <>
                      <h3>Dados básicos</h3>

                      <label>Nome</label>
                      <input
                        value={affiliateForm.name}
                        onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                        placeholder="Nome do afiliado"
                      />

                      <p className="muted" style={{ marginTop: 8 }}>
                        O código será gerado automaticamente no cadastro.
                      </p>
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <h3>Contato</h3>

                      <label>WhatsApp</label>
                      <input
                        value={affiliateForm.whatsapp}
                        onChange={(e) => setAffiliateForm({ ...affiliateForm, whatsapp: e.target.value })}
                        placeholder="WhatsApp"
                      />

                      <label>E-mail</label>
                      <input
                        value={affiliateForm.email}
                        onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                        placeholder="E-mail"
                      />
                    </>
                  )}

                  {step === 3 && (
                    <>
                      <h3>Dados adicionais</h3>

                      <label>Chave PIX</label>
                      <input
                        value={affiliateForm.pix_key}
                        onChange={(e) => setAffiliateForm({ ...affiliateForm, pix_key: e.target.value })}
                        placeholder="Chave PIX"
                      />
                    </>
                  )}

                  <div className="wizard-actions">
                    {step > 1 && (
                      <button type="button" className="btn-ui" onClick={() => setStep(step - 1)}>
                        ← Voltar
                      </button>
                    )}

                    {step < 3 ? (
                      <button type="button" className="btn-primary btn-ui" onClick={() => setStep(step + 1)}>
                        Continuar →
                      </button>
                    ) : (
                      <button type="button" className="btn-primary btn-ui" onClick={handleSaveAffiliate}>
                        Criar afiliado
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-ui"
                      onClick={() => {
                        resetAffiliateWizard({ closeModal: true });
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {affiliatesLoading && <p className="muted">Carregando afiliados...</p>}
            {!affiliatesLoading && (
              <AffiliateCards
                items={affiliatesFinal}
                expandedAffiliateId={expandedAffiliateId}
                affiliateUsers={affiliateUsers}
                affiliateUsersLoadingId={affiliateUsersLoadingId}
                onToggleAffiliate={toggleAffiliate}
              />
            )}
          </section>
        </div>
      )}

      {activeView === 'workout' && (
        <div className="container single-card app-content workout-page-container">
          <section className="card dashboard-card module-card workout-page-card">
            <WorkoutRoutine apiBaseUrl={workoutApiBase} pushToast={pushToast} />
          </section>
        </div>
      )}

      {activeView === 'foodDiary' && (
        <div className="container single-card app-content">
          <section className="card module-card">
            <FoodDiary
              apiBaseUrl={workoutApiBase}
              supabase={client}
              notify={pushToast}
              userId={session?.user?.id}
              refreshToken={refreshToken}
            />
          </section>
        </div>
      )}

      {activeView === 'generalReport' && (
        <div className="container single-card app-content">
          <section className="card module-card">
            <GeneralReport
              userId={session?.user?.id}
              supabase={client}
              goals={generalReportGoals}
              refreshToken={refreshToken}
            />
          </section>
        </div>
      )}

      {affiliateModalOpen && selectedUserToPromote && (
        <div className="affiliate-modal-backdrop" onClick={closePromoteAffiliateModal}>
          <div className="affiliate-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Tornar usuário em afiliado</h3>

            <label>Nome do afiliado</label>
            <input
              value={affiliateDraft.name}
              onChange={(e) => setAffiliateDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nome do afiliado"
            />

            <label>WhatsApp</label>
            <input
              value={affiliateDraft.whatsapp}
              onChange={(e) => setAffiliateDraft((prev) => ({ ...prev, whatsapp: e.target.value }))}
              placeholder="WhatsApp"
            />

            <label>Email</label>
            <input
              value={affiliateDraft.email}
              onChange={(e) => setAffiliateDraft((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
            />

            <label>Código do afiliado</label>
            <input
              value={affiliateDraft.code}
              onChange={(e) => setAffiliateDraft((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="Código do afiliado"
            />

            <label>Status</label>
            <select
              value={affiliateDraft.status}
              onChange={(e) => setAffiliateDraft((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>

            <div className="wizard-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn-primary btn-ui" onClick={handlePromoteToAffiliate}>
                Promover para afiliado
              </button>
              <button type="button" className="btn-ui" onClick={closePromoteAffiliateModal}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {financeHistoryUser && (
        <FinanceHistoryModal
          user={financeHistoryUser}
          history={financeHistory}
          onClose={() => {
            setFinanceHistoryUser(null);
            setFinanceHistory([]);
          }}
        />
      )}
      </div>
    </>
  );
}

export default App;
