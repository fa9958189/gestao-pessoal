import React, { useCallback, useEffect, useMemo, useState } from 'react';

const SUPERVISOR_USERS_CACHE_KEY = 'supervisor_users';

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
};

const formatStatus = (user) => {
  const status = String(user?.subscription_status || user?.billing_status || '').toLowerCase();
  if (status === 'active' || status === 'paid') return 'Ativo';
  if (status === 'inactive') return 'Inativo';
  if (status === 'pending') return 'Pendente';
  return status || '-';
};

const formatPlan = (planType) => {
  const normalized = String(planType || '').toLowerCase();
  if (normalized === 'trial') return 'Teste';
  if (normalized === 'promo') return 'Promo';
  if (normalized === 'vip') return 'VIP';
  if (normalized === 'normal') return 'Normal';
  return normalized || '-';
};

const resolveDateValue = (item, keys = []) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value) return value;
  }
  return null;
};

const getStartDateByPeriod = (period) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'hoje') return start;
  if (period === 'semana') {
    start.setDate(start.getDate() - 7);
    return start;
  }
  if (period === 'mes') {
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  return null;
};

const isWithinPeriod = (dateValue, period) => {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = getStartDateByPeriod(period);
  if (!start) return true;
  return parsed >= start;
};

const filterBySearch = (items, searchTerm, searchableKeys = []) => {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  if (!normalizedSearch) return items;

  return items.filter((item) =>
    searchableKeys.some((key) => String(item?.[key] || '').toLowerCase().includes(normalizedSearch)),
  );
};

function Supervisor({
  apiBase,
  getAccessToken,
  role,
  currentUserId,
  currentAffiliateId,
  pushToast,
}) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('resumo');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('semana');

  const isAdmin = String(role || '').toLowerCase() === 'admin';
  const isAffiliate = String(role || '').toLowerCase() === 'affiliate';

  const canSeeSupervisor = isAdmin || isAffiliate;

  const fetchUsers = useCallback(async () => {
    if (!canSeeSupervisor || !apiBase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`${apiBase}/supervisor/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao carregar usuários do supervisor.');
      }

      const safeUsers = Array.isArray(body) ? body : [];
      setUsers(safeUsers);
      localStorage.setItem(SUPERVISOR_USERS_CACHE_KEY, JSON.stringify(safeUsers));
    } catch (err) {
      console.warn('Erro em /supervisor/users', err);
      pushToast(err?.message || 'Erro ao carregar usuários do supervisor.', 'danger');
    } finally {
      setLoading(false);
    }
  }, [apiBase, canSeeSupervisor, getAccessToken, pushToast]);

  useEffect(() => {
    const cached = localStorage.getItem(SUPERVISOR_USERS_CACHE_KEY);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setUsers(parsed);
        }
      } catch (error) {
        console.error('Erro ao ler cache', error);
      }
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      fetchUsers();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchUsers]);

  const visibleUsers = useMemo(() => {
    if (isAdmin) return users;
    const affiliateReference = currentAffiliateId || currentUserId;
    return users.filter((user) => user?.affiliate_id && user.affiliate_id === affiliateReference);
  }, [users, isAdmin, currentAffiliateId, currentUserId]);

  const fetchUserDetails = useCallback(async (id) => {
    if (!id || !apiBase) return;

    setLoadingDetail(true);
    setSelectedUserDetail(null);

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`${apiBase}/supervisor/user-details/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao carregar detalhe do usuário.');
      }

      setSelectedUserDetail(body || null);
    } catch (err) {
      console.warn('Erro em /supervisor/user-details/:id', err);
      pushToast(err?.message || 'Erro ao carregar detalhes do usuário.', 'danger');
      setSelectedUserDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [apiBase, getAccessToken, pushToast]);

  const openUserDetail = (user) => {
    if (!user?.id || !apiBase) return;

    if (!isAdmin) {
      const affiliateReference = currentAffiliateId || currentUserId;
      if (!affiliateReference || user.affiliate_id !== affiliateReference) {
        pushToast('Sem permissão para visualizar este usuário.', 'danger');
        return;
      }
    }

    setSelectedUser(user);
    setTab('resumo');
    setSearch('');
    setPeriod('semana');
    fetchUserDetails(user.id);
  };

  if (!canSeeSupervisor) {
    return (
      <div className="page-container supervisor-page">
        <div className="page-content">
          <div className="card">
            <div className="card-header">
              <h2>👁️ Supervisor</h2>
              <p>Acesso disponível apenas para admin e afiliado.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const treinosBase = Array.isArray(selectedUserDetail?.treinos)
    ? selectedUserDetail.treinos
    : Array.isArray(selectedUserDetail?.workouts)
      ? selectedUserDetail.workouts
      : [];
  const alimentacaoBase = Array.isArray(selectedUserDetail?.alimentacao)
    ? selectedUserDetail.alimentacao
    : Array.isArray(selectedUserDetail?.food_logs)
      ? selectedUserDetail.food_logs
      : [];
  const pesoBase = Array.isArray(selectedUserDetail?.peso)
    ? selectedUserDetail.peso
    : Array.isArray(selectedUserDetail?.weight_history)
      ? selectedUserDetail.weight_history
      : [];

  const treinosFiltrados = filterBySearch(
    treinosBase
      .filter((workout) => isWithinPeriod(resolveDateValue(workout, ['performed_at', 'created_at']), period))
      .sort(
        (a, b) =>
          new Date(resolveDateValue(b, ['performed_at', 'created_at']) || 0).getTime() -
          new Date(resolveDateValue(a, ['performed_at', 'created_at']) || 0).getTime(),
      ),
    search,
    ['name', 'title', 'muscle_group', 'muscle_groups'],
  );

  const alimentacaoFiltrada = filterBySearch(
    alimentacaoBase
      .filter((entry) => isWithinPeriod(resolveDateValue(entry, ['entry_date', 'created_at']), period))
      .sort(
        (a, b) =>
          new Date(resolveDateValue(b, ['entry_date', 'created_at']) || 0).getTime() -
          new Date(resolveDateValue(a, ['entry_date', 'created_at']) || 0).getTime(),
      ),
    search,
    ['food', 'nome', 'name', 'meal_type', 'notes'],
  );

  const pesoFiltrado = filterBySearch(
    pesoBase
      .filter((entry) => isWithinPeriod(resolveDateValue(entry, ['entry_date', 'recorded_at', 'created_at']), period))
      .sort(
        (a, b) =>
          new Date(resolveDateValue(b, ['entry_date', 'recorded_at', 'created_at']) || 0).getTime() -
          new Date(resolveDateValue(a, ['entry_date', 'recorded_at', 'created_at']) || 0).getTime(),
      ),
    search,
    ['entry_date', 'weight_kg'],
  );

  const treinosPorGrupo = treinosFiltrados.reduce((acc, workout) => {
    const grupo = workout?.grupo || workout?.muscle_group || workout?.muscle_groups || 'Outro';
    acc[grupo] = (acc[grupo] || 0) + 1;
    return acc;
  }, {});

  const contagemAlimentos = alimentacaoFiltrada.reduce((acc, item) => {
    const nome = String(item?.food || item?.nome || item?.name || 'registro').toLowerCase();
    acc[nome] = (acc[nome] || 0) + 1;
    return acc;
  }, {});

  const topAlimentos = Object.entries(contagemAlimentos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const alimentosCriticos = topAlimentos.filter(([nome, qtd]) =>
    nome.includes('coca') ||
    nome.includes('açucar') ||
    nome.includes('acucar') ||
    nome.includes('refrigerante') ||
    nome.includes('doce') ||
    nome.includes('fritura') ||
    qtd >= 5,
  );

  const ultimoPeso = pesoFiltrado[0]?.weight_kg;
  const totalTreinosSemana = treinosBase.filter((workout) =>
    isWithinPeriod(resolveDateValue(workout, ['performed_at', 'created_at']), 'semana'),
  ).length;
  const alertaResumo = alimentosCriticos.length > 0
    ? `⚠️ ${alimentosCriticos.length} alimento(s) crítico(s) identificado(s).`
    : '✅ Nenhum alimento crítico no período filtrado.';

  return (
    <div className="page-container supervisor-page">
      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>👁️ Supervisor</h2>
            <p>Visualização de usuários com escopo por perfil.</p>
          </div>

          <div className="card-body">
            <div className="supervisor-table scroll-x">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>WhatsApp</th>
                    <th>Status</th>
                    <th>Plano</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Carregando...</td>
                    </tr>
                  ) : visibleUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhum usuário encontrado.</td>
                    </tr>
                  ) : (
                    visibleUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name || '-'}</td>
                        <td>{user.email || '-'}</td>
                        <td>{user.whatsapp || '-'}</td>
                        <td>{formatStatus(user)}</td>
                        <td>{formatPlan(user.plan_type)}</td>
                        <td>
                          <button type="button" className="btn-ui" onClick={() => openUserDetail(user)}>
                            👁
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="report-modal user-detail" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Detalhes do usuário</h3>
              <button type="button" className="btn-ui" onClick={() => setSelectedUser(null)}>Fechar</button>
            </div>

            {loadingDetail ? (
              <p className="muted" style={{ marginTop: 14 }}>Carregando detalhes...</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                <div className="supervisor-controls">
                  <div className="supervisor-tabs">
                    {['resumo', 'treinos', 'alimentacao', 'peso'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`btn-ui supervisor-tab-btn ${tab === key ? 'is-active' : ''}`}
                        onClick={() => setTab(key)}
                      >
                        {key === 'resumo' ? '📊 Resumo' : null}
                        {key === 'treinos' ? '💪 Treinos' : null}
                        {key === 'alimentacao' ? '🍽 Alimentação' : null}
                        {key === 'peso' ? '⚖ Peso' : null}
                      </button>
                    ))}
                  </div>

                  <div className="supervisor-toolbar">
                    <input
                      className="input-ui supervisor-search"
                      placeholder="Buscar..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <select className="input-ui supervisor-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
                      <option value="hoje">Hoje</option>
                      <option value="semana">Semana</option>
                      <option value="mes">Mês</option>
                    </select>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 14 }}>
                  {tab === 'resumo' && (
                    <>
                      <h4>📊 RESUMO</h4>
                      <p><strong>Nome:</strong> {selectedUser?.name || '-'}</p>
                      <p><strong>Status:</strong> {formatStatus(selectedUser)}</p>
                      <p><strong>Plano:</strong> {formatPlan(selectedUser?.plan_type)}</p>
                      <p><strong>Total treinos (semana):</strong> {totalTreinosSemana}</p>
                      <p><strong>Total alimentos registrados:</strong> {alimentacaoFiltrada.length}</p>
                      <p><strong>Último peso:</strong> {ultimoPeso ? `${Number(ultimoPeso).toFixed(1)} kg` : '-'}</p>
                      <p><strong>Alerta inteligente:</strong> {alertaResumo}</p>
                    </>
                  )}

                  {tab === 'treinos' && (
                    <>
                      <h4>💪 TREINOS</h4>
                      <div className="list-container">
                        {treinosFiltrados.map((workout) => {
                          const date = resolveDateValue(workout, ['performed_at', 'created_at']);
                          const group = workout?.grupo || workout?.muscle_group || workout?.muscle_groups || 'Outro';

                          let exercicios = {};
                          try {
                            exercicios = typeof workout?.exercicios_por_grupo === 'string'
                              ? JSON.parse(workout.exercicios_por_grupo)
                              : workout?.exercicios_por_grupo || {};
                          } catch (error) {
                            exercicios = {};
                          }

                          return (
                            <div key={workout.id || `${date}-${group}`}>
                              <p>
                                • {formatDate(date)} — {group}
                              </p>

                              <div style={{ marginTop: '8px' }}>
                                {Object.keys(exercicios).length > 0 ? (
                                  Object.entries(exercicios).map(([grupoNome, lista]) => (
                                    <div key={grupoNome} style={{ marginBottom: '10px' }}>
                                      <div
                                        style={{
                                          fontWeight: 'bold',
                                          marginBottom: '4px'
                                        }}
                                      >
                                        {grupoNome.charAt(0).toUpperCase() + grupoNome.slice(1)}
                                      </div>

                                      {Array.isArray(lista) && lista.map((ex, index) => (
                                        <div
                                          key={index}
                                          style={{
                                            fontSize: '13px',
                                            opacity: 0.9,
                                            marginLeft: '10px'
                                          }}
                                        >
                                          {ex?.name} - {ex?.config || ex?.series || '3x15'}
                                        </div>
                                      ))}
                                    </div>
                                  ))
                                ) : (
                                  <div>{workout.grupos_musculares}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {treinosFiltrados.length === 0 && <p className="muted">Sem treinos no período.</p>}
                      </div>
                      <hr className="separator" />
                      <h5>Resumo por grupo muscular</h5>
                      {Object.entries(treinosPorGrupo).map(([grupo, total]) => (
                        <p key={grupo}>• {grupo}: {total}</p>
                      ))}
                      {Object.keys(treinosPorGrupo).length === 0 && <p className="muted">Sem dados para resumir.</p>}
                    </>
                  )}

                  {tab === 'alimentacao' && (
                    <>
                      <h4>🍽 ALIMENTAÇÃO</h4>
                      <h5>🔥 Alimentos críticos</h5>
                      {alimentosCriticos.map(([nome, qtd]) => (
                        <p key={`critical-${nome}`}>• {nome} — {qtd}x</p>
                      ))}
                      {alimentosCriticos.length === 0 && <p className="muted">Nenhum alimento crítico identificado.</p>}

                      <h5>📊 Mais consumidos</h5>
                      {topAlimentos.map(([nome, qtd]) => (
                        <p key={`top-${nome}`}>• {nome} — {qtd}x</p>
                      ))}
                      {topAlimentos.length === 0 && <p className="muted">Sem consumo no período.</p>}

                      <h5>📜 Lista completa</h5>
                      <div className="list-container">
                        {alimentacaoFiltrada.map((entry) => {
                          const nome = entry?.food || entry?.nome || entry?.name || 'Registro';
                          return (
                            <p key={entry.id || `${nome}-${entry.entry_date || entry.created_at}`}>
                              • {nome} ({formatDate(entry.entry_date || entry.created_at)})
                            </p>
                          );
                        })}
                        {alimentacaoFiltrada.length === 0 && <p className="muted">Sem registros no período.</p>}
                      </div>
                    </>
                  )}

                  {tab === 'peso' && (
                    <>
                      <h4>⚖ PESO</h4>
                      <div className="list-container">
                        {pesoFiltrado.map((entry) => (
                          <p key={`${entry.user_id || 'user'}-${entry.entry_date}-${entry.recorded_at || entry.id}`}>
                            • {formatDate(entry.entry_date || entry.recorded_at)}: {Number(entry.weight_kg || 0).toFixed(1)} kg
                          </p>
                        ))}
                        {pesoFiltrado.length === 0 && <p className="muted">Sem histórico de peso no período.</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(Supervisor);
