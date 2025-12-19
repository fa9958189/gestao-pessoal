import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkoutRoutine from './components/WorkoutRoutine.jsx';
import FoodDiary from './components/FoodDiary.jsx';
import DailyAgenda from './DailyAgenda';
import './styles.css';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
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
  search: ''
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
  role: 'user'
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

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch (err) {
    return value;
  }
};

const formatTimeRange = (start, end) => {
  if (!start && !end) return '-';
  return [start, end].filter(Boolean).join(' – ');
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

  return { session, profile, loadingSession };
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
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Configure o arquivo <strong>env.js</strong> com os dados do seu projeto no Supabase.
      </p>
    </div>
  </div>
);

const DashboardHeader = ({ apiUrl, profile, onLogout }) => (
  <header>
    <div className="header-info">
      <h1>Gestão Pessoal – Dashboard</h1>
      <div className="muted">Supabase: <span id="apiUrl">{apiUrl || 'não configurado'}</span></div>
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

const UsersTable = ({ items, onEdit, onDelete }) => (
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
              <th>Criado em</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody id="userTableBody">
            {items.length === 0 && (
              <tr>
                <td colSpan="6" className="muted user-empty">
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
                <td>{formatDate(user.created_at)}</td>
                <td className="right">
                  <div className="table-actions">
                    <button className="icon-button" onClick={() => onEdit(user)} title="Editar">
                      ✏️
                    </button>
                    <button className="icon-button" onClick={() => onDelete(user)} title="Excluir">
                      🗑️
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
  const monthlyData = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
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
  }, [transactions]);

  const expenseByCat = useMemo(() => {
    const map = {};
    transactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        const key = tx.category || 'Sem categoria';
        map[key] = (map[key] || 0) + Number(tx.amount || 0);
      });
    return map;
  }, [transactions]);

  const incomeByCat = useMemo(() => {
    const map = {};
    transactions
      .filter((tx) => tx.type === 'income')
      .forEach((tx) => {
        const key = tx.category || 'Sem categoria';
        map[key] = (map[key] || 0) + Number(tx.amount || 0);
      });
    return map;
  }, [transactions]);

  const balancePoints = useMemo(() => {
    const sorted = [...transactions].sort(
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
  }, [transactions]);

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

  // --------- Novos dados avançados de relatório ---------
  const categoryRanking = useMemo(() => {
    const map = {};

    transactions.forEach((tx) => {
      if (tx.type !== 'expense') return;
      const cat = tx.category || 'Sem categoria';
      const amount = Number(tx.amount || 0);
      map[cat] = (map[cat] || 0) + amount;
    });

    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  const last30Days = useMemo(() => {
    if (!transactions.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const map = {};

    transactions.forEach((tx) => {
      if (!tx.date) return;
      const d = new Date(tx.date);
      if (Number.isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays < 0 || diffDays >= 30) return;

      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const value =
        tx.type === 'income'
          ? Number(tx.amount || 0)
          : -Number(tx.amount || 0);

      map[key] = (map[key] || 0) + value;
    });

    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({
        date: key,
        total: map[key] || 0,
      });
    }

    return result;
  }, [transactions]);

  const maxAbsDaily = useMemo(
    () =>
      last30Days.reduce(
        (max, day) => Math.max(max, Math.abs(day.total)),
        0
      ) || 1,
    [last30Days]
  );

  const heatmapWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < last30Days.length; i += 7) {
      weeks.push(last30Days.slice(i, i + 7));
    }
    return weeks;
  }, [last30Days]);
  // ------------------------------------------------------
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

  return (
    <div id="tab-reports">
      <p className="muted">
        Os gráficos respeitam os filtros aplicados acima. Clique em <b>Filtrar</b> para atualizar.
      </p>

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

      {Boolean(categoryRanking.length || last30Days.length) && (
        <>
          <h2 className="section-title" style={{ marginTop: 24 }}>
            Visão detalhada das finanças
          </h2>

          <div className="row">
            <div className="card" style={{ flex: 1 }}>
              <h3 className="title">Ranking de categorias (por despesa)</h3>
              {categoryRanking.length === 0 ? (
                <p className="muted">
                  Nenhuma despesa encontrada para o período selecionado.
                </p>
              ) : (
                <ol className="rank-list">
                  {categoryRanking.slice(0, 5).map((item, index) => (
                    <li key={item.category}>
                      <span className="rank-index">{index + 1}.</span>
                      <div className="rank-content">
                        <strong>{item.category}</strong>
                        <span className="muted">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="card" style={{ flex: 1 }}>
              <h3 className="title">Mapa de calor financeiro (30 dias)</h3>
              {last30Days.length === 0 ? (
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
    </div>
  );
};

function App() {
  const { client, configError } = useSupabaseClient();
  const { session, profile, loadingSession } = useAuth(client);

  const isAdmin = profile?.role === 'admin';

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [transactions, setTransactions] = useState(() => getLocalSnapshot().transactions);
  const [events, setEvents] = useState(() => getLocalSnapshot().events);
  const [users, setUsers] = useState([]);
  const [txForm, setTxForm] = useState(defaultTxForm);
  const [eventForm, setEventForm] = useState(defaultEventForm);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [editingUserId, setEditingUserId] = useState(null);

  const [txFilters, setTxFilters] = useState(defaultTxFilters);
  const [eventFilters, setEventFilters] = useState(defaultEventFilters);
  const [activeTab, setActiveTab] = useState('form');
  const [activeView, setActiveView] = useState('transactions');
  const workoutApiBase = window.APP_CONFIG?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL;

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
                      const { data, error } = await client
                        .from('profiles_auth')
                        .select('*')
                        .order('name', { ascending: true });

                      if (error) throw error;
                      userData = data || [];
                    }

                    // Atualiza estados
                    setTransactions(normalizedTx);
                    setEvents(eventData || []);
                    setUsers(userData);

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
    if (!isAdmin && activeView === 'users') {
      setActiveView('transactions');
    }
  }, [isAdmin, activeView]);

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



  const handleLogout = () => {
    window.localStorage.removeItem('gp-session');
    window.location.reload();
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
      const payload = {
        name: userForm.name,
        username: userForm.username,
        whatsapp: userForm.whatsapp,
        role: userForm.role,
        id: editingUserId
      };
      if (editingUserId) {
        const { error } = await client.from('profiles_auth').update(payload).eq('id', editingUserId);
        if (error) throw error;
      } else {
        // Criar usuário via backend
        const response = await fetch(`${workoutApiBase}/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: userForm.name,
            username: userForm.username,
            password: userForm.password,
            whatsapp: userForm.whatsapp,
            role: userForm.role
          })
        });

        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || 'Erro ao criar usuário.');
        }
      }
      pushToast('Usuário sincronizado com o Supabase.', 'success');
      setUserForm(defaultUserForm);
      setEditingUserId(null);
      loadRemoteData();
    } catch (err) {
      console.warn('Erro ao salvar usuário', err);
      pushToast('Não foi possível salvar o usuário. Configure a RPC create_dashboard_user.', 'danger');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!client || profile?.role !== 'admin') {
      pushToast('Somente administradores podem excluir usuários.', 'warning');
      return;
    }
    try {
      const { error } = await client.from('profiles_auth').delete().eq('id', user.id);
      if (error) throw error;
      pushToast('Usuário removido.', 'success');
      loadRemoteData();
    } catch (err) {
      console.warn('Erro ao remover usuário', err);
      pushToast('Configure permissões de delete na tabela profiles.', 'danger');
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
          <button
            className={activeView === 'users' ? 'tab active' : 'tab'}
            onClick={() => setActiveView('users')}
          >
            Cadastro de Usuários
          </button>
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
                  <input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} placeholder="Ex.: Vendas/Estoque" />
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
        <div className="container single-card">
          <section className="card admin-card" id="adminUsersSection">
            <h2 className="title">Cadastro de Usuários</h2>
            <p className="muted">Somente administradores podem acessar esta área.</p>

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
              <div className="admin-user-actions">
                <button className="primary" onClick={handleSaveUser}>
                  {editingUserId ? 'Salvar alterações' : 'Adicionar usuário'}
                </button>
                <button className="ghost" onClick={() => { setUserForm(defaultUserForm); setEditingUserId(null); }}>Limpar</button>
              </div>
            </div>

            <UsersTable
              items={users.map((user) => ({ ...user, _editing: user.id === editingUserId }))}
              onEdit={(user) => {
                setEditingUserId(user.id);
                setUserForm({
                  name: user.name,
                  username: user.username,
                  whatsapp: user.whatsapp,
                  role: user.role,
                  password: ''
                });
              }}
              onDelete={handleDeleteUser}
            />
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
    </>
  );
}

export default App;
