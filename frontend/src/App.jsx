import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkoutRoutine from './components/WorkoutRoutine.jsx';
import FoodDiary from './components/FoodDiary.jsx';
import GeneralReport from './components/GeneralReport.jsx';
import DailyAgenda from './DailyAgenda';
import './styles.css';
import { loadGoals } from './services/foodDiaryProfile';

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

const CATEGORIES = {
  expenses: [
    'Alimentação',
    'Mercado',
    'Lazer',
    'Academia / Esporte',
    'Saúde',
    'Transporte',
    'Moradia',
    'Contas (água, luz, internet, etc.)',
    'Educação',
    'Compras',
    'Assinaturas',
    'Outros'
  ],
  income: [
    'Salário',
    'Vendas',
    'Freelance',
    'Comissão',
    'Pix recebido',
    'Reembolso',
    'Outros'
  ]
};

const defaultTxFilters = {
  from: '',
  to: '',
  type: '',
  search: ''
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
  affiliateCode: '',
  applyTrial: false
};

const normalizeBaseUrl = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
};

const LOCAL_STORAGE_KEY = 'gp-react-data';

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
  end.setDate(end.getDate() + 7);
  return end;
};

const isTrialActive = (user) => {
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

const formatTimeRange = (start, end) => {
  if (!start && !end) return '-';
  return [start, end].filter(Boolean).join(' – ');
};

const BILLING_DUE_DAY = 20;
const FIXED_COMMISSION_CENTS = 2000;

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

const getCurrentPeriodMonth = (today = new Date()) => {
  const cursor = new Date(today);
  return new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString().slice(0, 10);
};

const randomId = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

const useSupabaseClient = () => {
  const [client, setClient] = useState(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    const { supabaseUrl, supabaseAnonKey, authSchema } = window.APP_CONFIG || {};
    if (!supabaseUrl || !supabaseAnonKey) {
      setConfigError('Configure as credenciais do Supabase em env.js.');
      return;
    }
    try {
      const instance = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: 'gp-react-session',
          schema: authSchema || 'public'
        }
      });
      setClient(instance);
      setConfigError('');
    } catch (err) {
      console.error('Erro ao iniciar Supabase', err);
      setConfigError('Não foi possível iniciar o cliente do Supabase.');
    }
  }, []);

  return { client, configError };
};

const useAuth = () => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('gp-session');
      if (!raw) {
        setLoadingSession(false);
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
      setLoadingSession(false);
    }
  }, []);

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
          <p className="muted" style={{ margin: 0 }}>Acesse com sua conta Supabase</p>
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

const DashboardHeader = ({ apiUrl, profile, onLogout }) => (
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
      </div>
      <button className="ghost small" onClick={onLogout}>Sair</button>
    </div>
  </header>
);

const SummaryKpis = ({ totals }) => (
  <div className="summary">
    <div className="kpi">
      <small>Total Receitas</small>
      <strong id="kpiIncome">{formatCurrency(totals.income)}</strong>
    </div>
    <div className="kpi">
      <small>Total Despesas</small>
      <strong id="kpiExpense">{formatCurrency(totals.expense)}</strong>
    </div>
    <div className="kpi">
      <small>Saldo</small>
      <strong id="kpiBalance">{formatCurrency(totals.balance)}</strong>
    </div>
  </div>
);

const TransactionsTable = ({ items, onEdit, onDelete }) => (
  <div className="transactions-scroll">
    <table>
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
          <tr key={tx.id}>
            <td>{formatDate(tx.date)}</td>
            <td>
              <span className={`badge badge-${tx.type}`}>
                {tx.type === 'income' ? 'Receita' : 'Despesa'}
              </span>
            </td>
            <td>{tx.description}</td>
            <td>{tx.category || '-'}</td>
            <td className="right">{formatCurrency(tx.amount)}</td>
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

const UsersTable = ({ items, onEdit, onDelete, onBillingAction }) => (
  <div className="user-list-wrapper">
    <div className="users-table-container">
      <div className="usuarios-scroll">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Nome</th>
              <th>WhatsApp</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Pagamento</th>
              <th>Vencimento</th>
              <th>Último pagamento</th>
              <th>Criado em</th>
              <th>Teste</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody id="userTableBody">
            {items.length === 0 && (
              <tr>
                <td colSpan="11" className="muted user-empty">
                  Nenhum usuário cadastrado além de você.
                </td>
              </tr>
            )}
            {items.map((user) => (
              <tr key={user.id} className={user._editing ? 'is-editing' : ''}>
                <td>{user.username}</td>
                <td>{user.name || '-'}</td>
                <td>{user.whatsapp || '-'}</td>
                <td>{user.role}</td>
                <td>
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    {(() => {
                      const status = user.derived_status || user.subscription_status || 'active';
                      const labelMap = { active: 'ATIVO', pending: 'PENDENTE', inactive: 'INATIVO' };
                      return (
                        <>
                          <span className={`badge badge-${status}`}>
                            {labelMap[status] || status.toUpperCase()}
                          </span>
                          {status === 'pending' && (
                            <small className="muted">Pendente (venc. dia {user.due_day || BILLING_DUE_DAY})</small>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </td>
                <td>
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    {(() => {
                      const paid = user.payment_status === 'paid';
                      return (
                        <span className={`badge ${paid ? 'badge-paid' : 'badge-payment-pending'}`}>
                          {paid ? 'PAGO' : 'PENDENTE'}
                        </span>
                      );
                    })()}
                  </div>
                </td>
                <td>dia {user.due_day || BILLING_DUE_DAY}</td>
                <td>{formatDate(user.last_payment_at || user.last_paid_at)}</td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  {(() => {
                    const trialEnd = getTrialEnd(user);
                    const daysLeft = getDaysLeft(trialEnd);
                    return formatTrialLabel(daysLeft);
                  })()}
                </td>
                <td className="right">
                  <div className="table-actions">
                    <button className="icon-button" onClick={() => onEdit(user)} title="Editar">
                      ✏️
                    </button>
                    <button className="icon-button" onClick={() => onDelete(user)} title="Excluir">
                      🗑️
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onBillingAction(user, 'activate')}
                      title="Ativar"
                    >
                      Ativar
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onBillingAction(user, 'inactivate')}
                      title="Inativar"
                    >
                      Inativar
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onBillingAction(user, 'markPaid')}
                      title="Marcar pago"
                    >
                      Marcar pago
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
                      {tx.type === 'income' ? 'Receita' : 'Despesa'} •{' '}
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

  const isAdmin = profile?.role === 'admin';

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
  const [txForm, setTxForm] = useState(defaultTxForm);
  const [eventForm, setEventForm] = useState(defaultEventForm);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState('active');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserOriginal, setEditingUserOriginal] = useState(null);
  const [affiliates, setAffiliates] = useState([]);
  const [affiliateForm, setAffiliateForm] = useState({
    code: '',
    name: '',
    whatsapp: '',
    email: '',
    pix_key: '',
  });
  const [affiliatesLoading, setAffiliatesLoading] = useState(false);
  const [affiliatePayoutLoadingId, setAffiliatePayoutLoadingId] = useState(null);
  const [affiliateUsers, setAffiliateUsers] = useState([]);
  const [affiliateUsersLoading, setAffiliateUsersLoading] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState(null);
  const [affiliateUsersCommissionCents, setAffiliateUsersCommissionCents] = useState(0);
  const affiliateUsersList = affiliateUsers || [];
  const affiliateUsersComputed = affiliateUsersList.map((user) => {
    const billing = (user.billing_status || user.status || "").toLowerCase();
    const normalizedStatus = billing === "inactive" ? "inactive" : "active";
    const isActive = user.is_active ?? normalizedStatus === "active";
    return {
      ...user,
      billing_status: normalizedStatus,
      status: normalizedStatus,
      is_active: isActive,
    };
  });
  const fixedCommissionBRL = formatCurrency(FIXED_COMMISSION_CENTS / 100);
  const affiliateCommissionCents = affiliateUsersCommissionCents
    || (affiliateUsersComputed.filter((user) => user.is_active).length * FIXED_COMMISSION_CENTS);
  const affiliateClientsTotal = formatCurrency(affiliateCommissionCents / 100);

  const txCategories = txForm.type === 'income' ? CATEGORIES.income : CATEGORIES.expenses;
  const hasLegacyCategory = txForm.category && !txCategories.includes(txForm.category);

  const [txFilters, setTxFilters] = useState(defaultTxFilters);
  const [eventFilters, setEventFilters] = useState(defaultEventFilters);
  const [activeTab, setActiveTab] = useState('form');
  const [activeView, setActiveView] = useState('transactions');
  const [generalReportGoals, setGeneralReportGoals] = useState(defaultGeneralReportGoals);
  const workoutApiBase = normalizeBaseUrl(
    window.APP_CONFIG?.apiBaseUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL
  );

  const [toast, setToast] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

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
        const { data: profileRow } = await client
          .from('profiles_auth')
          .select('id, auth_id, name, username, whatsapp, role, email, subscription_status, due_day, last_payment_at, last_paid_at, trial_status, trial_start_at, trial_end_at')
          .eq('auth_id', session.user.id)
          .single();

        if (profileRow) {
          setProfileDetails(profileRow);

          const effectiveStatus = computeEffectiveSubscriptionStatus(profileRow, new Date());
          if (profile?.role !== 'admin' && profileRow.role !== 'admin' && effectiveStatus !== 'active') {
            const message = effectiveStatus === 'pending'
              ? 'Assinatura pendente. Fale com o administrador.'
              : 'Acesso inativo. Fale com o administrador.';
            pushToast(message, 'danger');
            await client.auth.signOut();
            setSession(null);
            setProfile(null);
            setProfileDetails(null);
            window.localStorage.removeItem('gp-session');
            return;
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
      if (txFilters.search) {
        const s = txFilters.search;
        txQuery = txQuery.or(
          `description.ilike.%${s}%,category.ilike.%${s}%`
        );
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

      // 2) Eventos (agenda) do usuário logado
      const { data: eventData, error: evError } = await client
        .from('events')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (evError) throw evError;

      // 3) Lista de usuários (só se for admin)
      let userData = [];
      if (profile?.role === 'admin') {
        try {
          const { data, error } = await client
            .from('profiles_auth')
            .select('id, auth_id, name, username, whatsapp, role, email, created_at, subscription_status, due_day, last_payment_at, last_paid_at, affiliate_id, affiliate_code')
            .order('name', { ascending: true });

          if (error) throw error;
          userData = (data || []).map((item) => ({
            ...item,
            payment_status: isUserPaidForCurrentCycle(item, new Date()) ? 'paid' : 'pending',
            derived_status: computeEffectiveSubscriptionStatus(item, new Date()),
          }));
          setUsers(userData);
        } catch (err) {
          console.warn('Erro ao carregar lista de usuários (admin)', err);
          setUsers([]);
          pushToast('Sem permissão para listar usuários (admin).', 'warning');
        }
      } else {
        setUsers([]);
      }

      // Atualiza estados
      setTransactions(normalizedTx);
      setEvents(eventData || []);

      // Salva snapshot local
      persistLocalSnapshot({
        transactions: normalizedTx,
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



  useEffect(() => {
    const validateBillingAccess = async () => {
      if (!client || !session || !workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) return;

      try {
        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) return;

        const response = await fetch(`${workoutApiBase}/auth/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 403) {
          handleApiForbidden();
        }
      } catch (err) {
        console.warn('Falha ao validar billing_status', err);
      }
    };

    validateBillingAccess();
  }, [client, session, workoutApiBase]);

  useEffect(() => {
    if (!session) return;
    loadRemoteData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile?.role]);

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
    if (!isAdmin && (activeView === 'users' || activeView === 'affiliates')) {
      setActiveView('transactions');
    }
  }, [isAdmin, activeView]);

  useEffect(() => {
    if (activeView === 'affiliates' && isAdmin) {
      loadAffiliates();
    }
  }, [activeView, isAdmin]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const ownerId = tx.userId || tx.user_id;
      if (session && ownerId && ownerId !== session.user.id) return false;
      if (txFilters.type && tx.type !== txFilters.type) return false;
      if (txFilters.from && tx.date < txFilters.from) return false;
      if (txFilters.to && tx.date > txFilters.to) return false;
      if (txFilters.search) {
        const q = txFilters.search.toLowerCase();
        return (
          tx.description?.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, txFilters]);

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

                    // 2) Buscar o registro correspondente em profiles_auth pelo auth_id
                    const { data: authProfile, error: authProfileError } = await client
                      .from('profiles_auth')
                      .select('id, name, role, auth_id, email')
                      .eq('auth_id', authUser.id)
                      .single();

                    console.log('authProfile:', authProfile);
                    console.log('authProfileError:', authProfileError);

                    if (authProfileError || !authProfile) {
                      throw new Error('Perfil de autenticação não encontrado em profiles_auth.');
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
                    //    user.profile_id = authProfile.id  (id da tabela profiles_auth)
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

                  // Salvar transação (local + Supabase)
                        const handleSaveTransaction = async () => {
                          // Monta o objeto da transação
                          const payload = {
                            ...txForm,
                            id: txForm.id || randomId(),
                            amount: Number(txForm.amount || 0),
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
                                user_id: session.user.id,      // <- mesmo id gravado em profiles_auth.id
                                type: payload.type,
                                amount: payload.amount,
                                description: payload.description,
                                category: payload.category,
                                date: payload.date,            // input type="date" já está em YYYY-MM-DD
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
        const trimmedAffiliateCode = (userForm.affiliateCode || '').trim();
        const createUserPayload = {
          name: userForm.name,
          username: userForm.username,
          password: userForm.password,
          whatsapp: userForm.whatsapp,
          role: userForm.role,
        };

        if (trimmedAffiliateCode) {
          createUserPayload.affiliateCode = trimmedAffiliateCode;
        }
        if (userForm.applyTrial) {
          createUserPayload.apply_trial = true;
        }

        const response = await fetch(`${workoutApiBase}/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createUserPayload)
        });

        const body = await response.json();
        if (response.status === 403) {
          handleApiForbidden();
          return;
        }
        if (!response.ok) {
          throw new Error(body.error || 'Erro ao criar usuário.');
        }
      }
      pushToast('Usuário sincronizado com o Supabase.', 'success');
      setUserForm(defaultUserForm);
      setEditingUserId(null);
      setEditingUserOriginal(null);
      loadRemoteData();
    } catch (err) {
      console.warn('Erro ao salvar usuário', err);
      pushToast(`Não foi possível salvar o usuário: ${err?.message || 'erro desconhecido'}`, 'danger');
    }
  };

  const handleBroadcastWhatsapp = async () => {
    try {
      setBroadcastResult(null);

      const msg = String(broadcastMessage || '').trim();
      if (msg.length < 2) {
        pushToast('Digite uma mensagem (mín. 2 caracteres).', 'danger');
        return;
      }

      // Pega a sessão DIRETO do Supabase (não depende do state "session")
      let accessToken = null;

      try {
        const { data } = await client.auth.getSession();
        accessToken = data?.session?.access_token || null;

        // Se não tiver token, tenta refresh uma vez
        if (!accessToken) {
          await client.auth.refreshSession();
          const { data: data2 } = await client.auth.getSession();
          accessToken = data2?.session?.access_token || null;
        }
      } catch (e) {
        console.warn('Falha ao obter sessão:', e);
      }

      if (!accessToken) {
        pushToast('Sessão inválida. Faça login novamente.', 'danger');
        return;
      }

      setBroadcastSending(true);

      const resp = await fetch(`${workoutApiBase}/admin/broadcast-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: msg,
          audience: broadcastAudience,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        pushToast(data?.error || 'Falha ao enviar broadcast.', 'danger');
        setBroadcastSending(false);
        return;
      }

      setBroadcastResult(data);
      pushToast(
        `Broadcast enviado: ${data.sent}/${data.total} (falhas: ${data.failed})`,
        'success'
      );

      setBroadcastSending(false);
    } catch (err) {
      console.error(err);
      pushToast('Erro inesperado no broadcast.', 'danger');
      setBroadcastSending(false);
    }
  };

  const handleDeleteUser = async (user) => {
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

      const targetId = user.auth_id || user.id;

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

      pushToast('Usuário removido.', 'success');
      loadRemoteData();
    } catch (err) {
      console.warn('Erro ao remover usuário', err);
      pushToast('Configure permissões de delete na tabela profiles.', 'danger');
    }
  };

  const handleBillingAction = async (user, action) => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem gerenciar cobrança.', 'warning');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const targetId = user.id || user.auth_id;
    const payload = {};

    if (action === 'activate') {
      payload.billing_status = 'active';
      payload.subscription_status = 'active';
      payload.last_payment_at = nowIso;
      payload.trial_status = 'expired';
      payload.trial_end_at = nowIso;
    } else if (action === 'inactivate') {
      payload.subscription_status = 'inactive';
    } else if (action === 'markPaid') {
      payload.subscription_status = 'active';
      payload.last_payment_at = today;
    } else {
      return;
    }

    try {
      const { error } = await client
        .from('profiles_auth')
        .update(payload)
        .eq('id', targetId);

      if (error) throw error;

      pushToast('Status de assinatura atualizado.', 'success');
      setUsers((prev) => prev.map((item) => {
        const matchId = item.auth_id || item.id;
        if (matchId !== targetId) return item;

        return {
          ...item,
          ...payload,
          payment_status: action === 'markPaid' ? 'paid' : item.payment_status,
          last_payment_at: action === 'markPaid' ? today : item.last_payment_at,
          derived_status: computeEffectiveSubscriptionStatus({ ...item, ...payload, last_payment_at: today }, new Date()),
        };
      }));
      loadRemoteData();
      loadAffiliates();
    } catch (err) {
      console.warn('Erro ao atualizar status de assinatura', err);
      pushToast(err.message || 'Erro ao atualizar assinatura.', 'danger');
    }
  };

  const normalizeAffiliateStats = (item) => ({
    ...item,
    active_clients_count: item?.active_clients_count ?? item?.active_users ?? 0,
    inactive_clients_count: item?.inactive_clients_count ?? item?.inactive_users ?? item?.pending_users ?? 0,
    current_payout_period: item?.current_payout_period || item?.period_month || getCurrentPeriodMonth(),
    current_payout_label: (item?.payout_ref || item?.current_payout_period || item?.period_month || getCurrentPeriodMonth()).slice(0, 7),
    current_payout_status: item?.payout_status_month_current || item?.current_payout_status || (item?.current_payout_paid_at || item?.paid_at ? 'paid' : 'pending'),
    current_payout_paid_at: item?.current_payout_paid_at || item?.paid_at || null,
    payout_ref: item?.payout_ref || (item?.current_payout_period || item?.period_month)?.slice(0, 7) || null,
    payout_status_month_current: item?.payout_status_month_current || item?.current_payout_status || (item?.current_payout_paid_at || item?.paid_at ? 'paid' : 'pending'),
    payout_status: (() => {
      const raw = (item?.payout_status_month_current || item?.payout_status || '').toString().toUpperCase();
      if (raw === 'PAID' || raw === 'PAGO') return 'PAGO';
      return 'PENDENTE';
    })(),
  });

  const loadAffiliates = async () => {
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

    if (!affiliateForm.code.trim() || !affiliateForm.name.trim()) {
      pushToast('Informe código e nome do afiliado.', 'warning');
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        pushToast('Sessão expirada. Faça login novamente.', 'warning');
        return;
      }

      const payload = {
        code: affiliateForm.code.trim(),
        name: affiliateForm.name.trim(),
        whatsapp: affiliateForm.whatsapp || undefined,
        email: affiliateForm.email || undefined,
        pix_key: affiliateForm.pix_key || undefined,
        commission_cents: FIXED_COMMISSION_CENTS,
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
      setAffiliateForm({
        code: '',
        name: '',
        whatsapp: '',
        email: '',
        pix_key: '',
      });
      loadAffiliates();
    } catch (err) {
      console.warn('Erro ao salvar afiliado', err);
      pushToast(err?.message || 'Erro ao salvar afiliado.', 'danger');
    }
  };

  const handleViewAffiliateUsers = async (affiliate) => {
    if (!client || profile?.role !== 'admin') return;
    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) return;

    setSelectedAffiliate(affiliate);
    setAffiliateUsers([]);
    setAffiliateUsersLoading(true);
    setAffiliateUsersCommissionCents(0);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(`${workoutApiBase}/admin/affiliates/${affiliate.id}/users`, {
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
        throw new Error(body?.error || 'Erro ao carregar clientes.');
      }

      const responseUsers = Array.isArray(body) ? body : Array.isArray(body?.users) ? body.users : [];

      const parsedUsers = responseUsers.map((user) => {
        const rawStatus = (user.status || user.billing_status || '').toLowerCase();
        const normalized = rawStatus === 'inactive' ? 'inactive' : 'active';
        return {
          ...user,
          status: normalized,
          billing_status: normalized,
          is_active: user.is_active ?? normalized === 'active',
        };
      });

      const commissionCents = Number.isFinite(body?.total_commission_cents)
        ? Number(body.total_commission_cents)
        : parsedUsers.filter((user) => user.is_active).length * FIXED_COMMISSION_CENTS;

      setAffiliateUsers(parsedUsers);
      setAffiliateUsersCommissionCents(commissionCents);
    } catch (err) {
      console.warn('Erro ao listar clientes do afiliado', err);
      pushToast('Não foi possível carregar os clientes desse afiliado.', 'warning');
    } finally {
      setAffiliateUsersLoading(false);
    }
  };

  const handleMarkAffiliatePaid = async (affiliate) => {
    if (!client || profile?.role !== 'admin') return;
    if (!workoutApiBase || !/^https?:\/\//i.test(workoutApiBase)) return;

    const monthStart = getCurrentPeriodMonth();
    setAffiliatePayoutLoadingId(affiliate.id);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(`${workoutApiBase}/admin/affiliates/${affiliate.id}/payouts/mark-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ period_month: monthStart })
      });

      const body = await response.json().catch(() => ({}));

      if (response.status === 403) {
        handleApiForbidden();
        return;
      }

      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao registrar pagamento.');
      }

      pushToast('Pagamento do mês marcado como pago.', 'success');
      const payout = body?.payout;
      const payoutRef = body?.payout_ref || (payout?.period_month || monthStart).slice(0, 7);
      const payoutStatus = body?.payout_status || 'PAGO';
      const payoutStatusValue = body?.payout_status_month_current || 'paid';
      setAffiliates((prev) => prev.map((item) =>
        item.id === affiliate.id
          ? {
              ...item,
              payout_status: payoutStatus,
              payout_ref: payoutRef,
              current_payout_status: payoutStatusValue,
              payout_status_month_current: payoutStatusValue,
              current_payout_period: payout?.period_month || monthStart,
              current_payout_label: payoutRef || (payout?.period_month || monthStart).slice(0, 7),
              current_payout_paid_at: payout?.paid_at || new Date().toISOString(),
            }
          : item
      ));
    } catch (err) {
      console.warn('Erro ao registrar pagamento de afiliado', err);
      pushToast(err?.message || 'Não foi possível marcar como pago.', 'warning');
    } finally {
      setAffiliatePayoutLoadingId(null);
    }
  };

  const renderAgenda = () => (
    <aside className="card">
      <h2 className="title">Agenda</h2>

      <div className="grid grid-2" style={{ marginBottom: 8 }}>
        <div>
          <label>Título</label>
          <input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Reunião, Médico, etc." />
        </div>
        <div>
          <label>Data</label>
          <input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-2">
        <div>
          <label>Início</label>
          <input type="time" value={eventForm.start} onChange={(e) => setEventForm({ ...eventForm, start: e.target.value })} />
        </div>
        <div>
          <label>Fim</label>
          <input type="time" value={eventForm.end} onChange={(e) => setEventForm({ ...eventForm, end: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Notas</label>
        <textarea value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} placeholder="Observações do evento..."></textarea>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="primary" onClick={handleSaveEvent}>{eventForm.id ? 'Atualizar' : 'Adicionar Evento'}</button>
        <button className="ghost" onClick={() => setEventForm(defaultEventForm)}>Limpar</button>
      </div>

      <div className="sep"></div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>De</label>
          <input type="date" value={eventFilters.from} onChange={(e) => setEventFilters({ ...eventFilters, from: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Até</label>
          <input type="date" value={eventFilters.to} onChange={(e) => setEventFilters({ ...eventFilters, to: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Busca</label>
          <input value={eventFilters.search} onChange={(e) => setEventFilters({ ...eventFilters, search: e.target.value })} placeholder="título/notas" />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button onClick={loadRemoteData} disabled={loadingData}>
            {loadingData ? 'Sincronizando...' : 'Filtrar'}
          </button>
        </div>
      </div>

      <div className="sep"></div>

      <EventsTable
        items={filteredEvents}
        onEdit={(ev) => setEventForm(ev)}
        onDelete={handleDeleteEvent}
      />
    </aside>
  );

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
      <DashboardHeader apiUrl={window.APP_CONFIG?.supabaseUrl} profile={profile} onLogout={handleLogout} />
      <div className="page-nav tabs">
        <button
          className={activeView === 'transactions' ? 'tab active' : 'tab'}
          onClick={() => setActiveView('transactions')}
        >
          Transações
        </button>
        {isAdmin && (
          <>
            <button
              className={activeView === 'users' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('users')}
            >
              Cadastro de Usuários
            </button>
            <button
              className={activeView === 'affiliates' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('affiliates')}
            >
              Afiliados
            </button>
          </>
        )}
        <button
          className={activeView === 'workout' ? 'tab active' : 'tab'}
          onClick={() => setActiveView('workout')}
        >
          Rotina de Treino
        </button>

        <button
          className={activeView === 'foodDiary' ? 'tab active' : 'tab'}
          onClick={() => setActiveView('foodDiary')}
        >
          Diário alimentar
        </button>
        <button
          className={activeView === 'generalReport' ? 'tab active' : 'tab'}
          onClick={() => setActiveView('generalReport')}
        >
          Relatório Geral
        </button>
      </div>

      {activeView === 'transactions' && (
        <div className={activeTab === 'reports' || activeTab === 'daily' ? 'container single-card' : 'container'}>
          <section className="card dashboard-card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="title">Transações</h2>
            <div className="tabs">
              <button className={activeTab === 'form' ? 'tab active' : 'tab'} onClick={() => setActiveTab('form')}>
                Cadastro
              </button>
              <button className={activeTab === 'reports' ? 'tab active' : 'tab'} onClick={() => setActiveTab('reports')}>
                Relatórios
              </button>
              <button className={activeTab === 'daily' ? 'tab active' : 'tab'} onClick={() => setActiveTab('daily')}>
                Agenda Diária
              </button>
            </div>
          </div>

          {activeTab === 'form' && (
            <div id="tab-form">
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Tipo</label>
                  <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Valor (use ponto para decimais)</label>
                  <input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Data</label>
                  <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 2 }}>
                  <label>Descrição</label>
                  <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="Ex.: Venda no Pix" />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Categoria</label>
                  <select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
                    {hasLegacyCategory && (
                      <option value={txForm.category}>Categoria atual: {txForm.category}</option>
                    )}
                    <option value="">Selecione</option>
                    {txCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="primary" onClick={handleSaveTransaction}>
                  {txForm.id ? 'Atualizar' : 'Adicionar'}
                </button>
                <button className="ghost" onClick={() => setTxForm(defaultTxForm)}>Limpar</button>
              </div>

              <div className="sep"></div>

              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Filtro: de</label>
                  <input type="date" value={txFilters.from} onChange={(e) => setTxFilters({ ...txFilters, from: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>até</label>
                  <input type="date" value={txFilters.to} onChange={(e) => setTxFilters({ ...txFilters, to: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Tipo</label>
                  <select value={txFilters.type} onChange={(e) => setTxFilters({ ...txFilters, type: e.target.value })}>
                    <option value="">Todos</option>
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Busca</label>
                  <input value={txFilters.search} onChange={(e) => setTxFilters({ ...txFilters, search: e.target.value })} placeholder="descrição ou categoria" />
                </div>
                <div style={{ alignSelf: 'flex-end' }}>
                  <button onClick={loadRemoteData} disabled={loadingData}>
                    {loadingData ? 'Sincronizando...' : 'Filtrar'}
                  </button>
                </div>
              </div>

              <div className="sep"></div>

              <SummaryKpis totals={kpis} />

              <div className="sep"></div>

              <TransactionsTable
                items={filteredTransactions}
                onEdit={(tx) => setTxForm(tx)}
                onDelete={handleDeleteTransaction}
              />
            </div>
          )}

          {activeTab === 'reports' && <Reports transactions={filteredTransactions} />}
          {activeTab === 'daily' && (
            <DailyAgenda apiBaseUrl={workoutApiBase} notify={pushToast} userId={session?.user?.id} />
          )}
        </section>
        {activeTab === 'form' && renderAgenda()}

        </div>
      )}

      {activeView === 'users' && isAdmin && (
        <div className="container single-card admin-users-container">
          <section className="card admin-card" id="adminUsersSection">
            <h2 className="title">Cadastro de Usuários</h2>
            <p className="muted">Somente administradores podem acessar esta área.</p>

            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <button
                className="ghost"
                onClick={() => setBroadcastOpen((v) => !v)}
                style={{ width: '100%' }}
              >
                {broadcastOpen ? 'Fechar aviso geral (WhatsApp)' : 'Abrir aviso geral (WhatsApp)'}
              </button>

              {broadcastOpen && (
                <div className="card" style={{ marginTop: 10, padding: 14 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label>Público</label>
                      <select
                        value={broadcastAudience}
                        onChange={(e) => setBroadcastAudience(e.target.value)}
                      >
                        <option value="active">Somente ativos</option>
                        <option value="trial">Somente em teste</option>
                        <option value="all">Todos com WhatsApp</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label>Mensagem</label>
                    <textarea
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Ex: ⚠️ Amanhã (09h) faremos manutenção rápida no sistema. Pode ficar instável por até 30 minutos."
                      rows={5}
                    />
                  </div>

                  <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                    <button
                      className="ghost"
                      onClick={() => {
                        setBroadcastMessage('');
                        setBroadcastResult(null);
                      }}
                      disabled={broadcastSending}
                    >
                      Limpar
                    </button>

                    <button
                      className="primary"
                      onClick={handleBroadcastWhatsapp}
                      disabled={broadcastSending}
                    >
                      {broadcastSending ? 'Enviando...' : 'Enviar para todos'}
                    </button>
                  </div>

                  {broadcastResult && (
                    <div style={{ marginTop: 10 }} className="muted">
                      Resultado: enviados {broadcastResult.sent}/{broadcastResult.total} • falhas:{' '}
                      {broadcastResult.failed}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-2 admin-user-form">
              <div>
                <label>Nome</label>
                <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nome completo (opcional)" />
              </div>
              <div>
                <label>Usuário</label>
                <input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} placeholder="ex.: joaosilva" />
              </div>
              <div>
                <label>Senha inicial</label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Mínimo de 4 caracteres" />
              </div>
              <div>
                <label>WhatsApp</label>
                <input value={userForm.whatsapp} onChange={(e) => setUserForm({ ...userForm, whatsapp: e.target.value })} placeholder="+5511999999999" />
              </div>
              {!editingUserId && (
                <div>
                  <label>Criado em</label>
                  <input
                    type="date"
                    value={today}
                    readOnly
                    disabled
                  />
                </div>
              )}
              <div>
                <label>Perfil</label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="user">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label>Código do afiliado (opcional)</label>
                <input
                  value={userForm.affiliateCode}
                  onChange={(e) => setUserForm({ ...userForm, affiliateCode: e.target.value })}
                  placeholder="ex: AFI-001"
                />
              </div>
              {!editingUserId && (
                <div className="checkbox-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={userForm.applyTrial}
                      onChange={(e) => setUserForm({ ...userForm, applyTrial: e.target.checked })}
                    />
                    <span>Aplicar 7 dias grátis</span>
                  </label>
                </div>
              )}
              <div className="admin-user-actions">
                <button className="primary" onClick={handleSaveUser}>
                  {editingUserId ? 'Salvar alterações' : 'Adicionar usuário'}
                </button>
                <button className="ghost" onClick={() => { setUserForm(defaultUserForm); setEditingUserId(null); setEditingUserOriginal(null); }}>Limpar</button>
              </div>
            </div>

            <UsersTable
              items={users.map((user) => ({ ...user, _editing: (user.auth_id || user.id) === editingUserId }))}
              onEdit={(user) => {
                setEditingUserId(user.auth_id || user.id);
                setEditingUserOriginal(user);
                setUserForm({
                  name: user.name,
                  username: user.username,
                  whatsapp: user.whatsapp,
                  role: user.role,
                  password: '',
                  affiliateCode: user.affiliate_code || '',
                  applyTrial: false
                });
              }}
              onDelete={handleDeleteUser}
              onBillingAction={handleBillingAction}
            />
          </section>
        </div>
      )}

      {activeView === 'affiliates' && isAdmin && (
        <div className="container single-card">
          <section className="card admin-card" id="adminAffiliatesSection">
            <h2 className="title">Afiliados</h2>
            <p className="muted">Gerencie parceiros e visualize seus clientes.</p>

            <div className="grid grid-2 admin-user-form">
              <div>
                <label>Código</label>
                <input
                  value={affiliateForm.code}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, code: e.target.value })}
                  placeholder="AFI-001"
                />
              </div>
              <div>
                <label>Nome</label>
                <input
                  value={affiliateForm.name}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                  placeholder="Nome do afiliado"
                />
              </div>
              <div>
                <label>WhatsApp</label>
                <input
                  value={affiliateForm.whatsapp}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, whatsapp: e.target.value })}
                  placeholder="+5511999999999"
                />
              </div>
              <div>
                <label>E-mail</label>
                <input
                  value={affiliateForm.email}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                  placeholder="contato@exemplo.com"
                />
              </div>
              <div>
                <label>Chave PIX</label>
                <input
                  value={affiliateForm.pix_key}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, pix_key: e.target.value })}
                  placeholder="CPF, e-mail ou aleatória"
                />
              </div>
              <div className="admin-user-actions">
                <button className="primary" onClick={handleSaveAffiliate}>Criar afiliado</button>
                <button
                  className="ghost"
                  onClick={() =>
                    setAffiliateForm({
                      code: '',
                      name: '',
                      whatsapp: '',
                      email: '',
                      pix_key: '',
                    })
                  }
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="users-table-container" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Status</th>
                    <th>Ativos</th>
                    <th>Inativos</th>
                    <th>Pagamento</th>
                    <th>Comissão mês</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(affiliates || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.is_active ? 'Ativo' : 'Inativo'}</td>
                      <td>{item.active_clients_count ?? item.active_users ?? 0}</td>
                      <td>{item.inactive_clients_count ?? item.inactive_users ?? 0}</td>
                      <td>
                        <div className="column" style={{ gap: 4, alignItems: 'flex-start' }}>
                          <span className={`badge ${item.payout_status === 'PAGO' ? 'badge-paid' : 'badge-payment-pending'}`}>
                            {item.payout_status === 'PAGO' ? 'PAGO' : 'PENDENTE'}
                          </span>
                          <small className="muted">Ref.: {item.payout_ref || item.current_payout_label || '-'}</small>
                        </div>
                      </td>
                      <td>{formatCurrency((item.commission_month_cents || 0) / 100)}</td>
                      <td className="table-actions">
                        <button className="ghost" onClick={() => handleViewAffiliateUsers(item)}>Ver clientes</button>
                        <button
                          className="ghost"
                          onClick={() => handleMarkAffiliatePaid(item)}
                          disabled={affiliatePayoutLoadingId === item.id}
                        >
                          {affiliatePayoutLoadingId === item.id ? 'Marcando...' : 'Marcar pago (mês atual)'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {affiliatesLoading && <p className="muted">Carregando afiliados...</p>}
              {!affiliatesLoading && !(affiliates || []).length && (
                <p className="muted">Nenhum afiliado cadastrado.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeView === 'workout' && (
        <div className="container single-card">
          <section className="card">
            <WorkoutRoutine apiBaseUrl={workoutApiBase} pushToast={pushToast} />
          </section>
        </div>
      )}

      {activeView === 'foodDiary' && (
        <div className="container single-card">
          <section className="card">
            <FoodDiary
              apiBaseUrl={workoutApiBase}
              supabase={client}
              notify={pushToast}
              userId={session?.user?.id}
            />
          </section>
        </div>
      )}

      {activeView === 'generalReport' && (
        <div className="container single-card">
          <section className="card">
            <GeneralReport
              userId={session?.user?.id}
              supabase={client}
              goals={generalReportGoals}
            />
          </section>
        </div>
      )}

      {selectedAffiliate && (
        <div
          className="affiliate-modal-backdrop"
          onClick={() => {
            setSelectedAffiliate(null);
            setAffiliateUsers([]);
            setAffiliateUsersCommissionCents(0);
          }}
        >
          <div className="affiliate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>{selectedAffiliate.name}</h3>
                <p className="muted">{selectedAffiliate.code}</p>
              </div>
              <button
                className="ghost"
                onClick={() => {
                  setSelectedAffiliate(null);
                  setAffiliateUsers([]);
                  setAffiliateUsersCommissionCents(0);
                }}
              >
                Fechar
              </button>
            </div>

            <div className="affiliate-users-list">
              {affiliateUsersLoading && <p className="muted">Carregando clientes...</p>}
              {!affiliateUsersLoading && affiliateUsersList.length === 0 && (
                <p className="muted">Nenhum cliente vinculado.</p>
              )}
              {!affiliateUsersLoading && affiliateUsersList.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliateUsersComputed.map((user) => (
                      <tr key={user.id || user.auth_id}>
                        <td>{user.name || '-'}</td>
                        <td>{user.email || '-'}</td>
                        <td>{formatCurrency((user.is_active ? FIXED_COMMISSION_CENTS : 0) / 100)}</td>
                        <td>{(user.status === 'inactive' ? 'INATIVO' : 'ATIVO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!affiliateUsersLoading && affiliateUsersList.length > 0 && (
              <div className="affiliate-modal-total">
                <span>TOTAL:</span>
                <strong>{affiliateClientsTotal}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
