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

const normalizeExercisesGroup = (value) => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const hasExercisesByGroupContent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.some((key) => Array.isArray(value[key]) && value[key].length > 0);
};

const normalizeMuscleConfigMap = (value) => {
  let parsed = value;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return new Map();

  return new Map(
    parsed
      .filter((item) => item?.muscle)
      .map((item) => [String(item.muscle).trim().toLowerCase(), item])
  );
};

const formatGroupTitle = (groupName = '') => {
  const key = String(groupName).trim().toLowerCase();
  const map = {
    abdomen: 'Abdômen',
    biceps: 'Bíceps',
    costas: 'Costas',
    gluteo: 'Glúteo',
    ombro: 'Ombro',
    panturrilha: 'Panturrilha',
    peito: 'Peito',
    posterior_de_coxa: 'Posterior de coxa',
    quadriceps: 'Quadríceps',
    triceps: 'Tríceps',
  };
  return map[key] || groupName;
};

const splitMuscleGroups = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

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
  const [userSearch, setUserSearch] = useState('');
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

  const filteredUsers = useMemo(() => {
    const normalizedSearch = String(userSearch || '').trim().toLowerCase();
    if (!normalizedSearch) return visibleUsers;

    return visibleUsers.filter((user) => {
      const searchableText = [user?.name, user?.email, user?.whatsapp]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return searchableText.includes(normalizedSearch);
    });
  }, [userSearch, visibleUsers]);

  const fetchUserDetails = useCallback(async (id, filter = period) => {
    if (!id || !apiBase) return;

    setLoadingDetail(true);
    setSelectedUserDetail(null);

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`${apiBase}/supervisor/user-details/${id}?filter=${encodeURIComponent(filter)}`, {
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
  }, [apiBase, getAccessToken, period, pushToast]);

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
    fetchUserDetails(user.id, 'semana');
  };

  useEffect(() => {
    if (!selectedUser?.id) return;
    fetchUserDetails(selectedUser.id, period);
  }, [fetchUserDetails, period, selectedUser?.id]);

  if (!canSeeSupervisor) {
    return (
      <div className="page-container supervisor-page">
        <div className="page-content">
          <div className="page-scroll">
            <div className="card full-height-card">
            <div className="card-header">
              <h2>👁️ Supervisor</h2>
              <p>Acesso disponível apenas para admin e afiliado.</p>
            </div>
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
    const grupos = splitMuscleGroups(
      workout?.groups_musculares || workout?.grupo || workout?.muscle_group || workout?.muscle_groups
    );
    if (!grupos.length) {
      acc.Outro = (acc.Outro || 0) + 1;
      return acc;
    }
    grupos.forEach((grupo) => {
      acc[grupo] = (acc[grupo] || 0) + 1;
    });
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
        <div className="page-scroll">
          <div className="card full-height-card">
          <div className="card-header">
            <h2>👁️ Supervisor</h2>
            <p>Visualização de usuários com escopo por perfil.</p>
          </div>

          <div className="card-body">
            <input
              type="text"
              id="userSearch"
              placeholder="🔍 Buscar por nome, email ou telefone..."
              className="user-search-input"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />
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
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhum usuário encontrado.</td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="user-card">
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
                          const group = workout?.groups_musculares || workout?.grupo || workout?.muscle_group || workout?.muscle_groups || 'Outro';
                          const exercicios = normalizeExercisesGroup(
                            workout?.exercicios_por_grupo || workout?.exercises_by_group
                          );
                          const configMap = normalizeMuscleConfigMap(workout?.muscle_config);
                          const showExerciseBlock = hasExercisesByGroupContent(exercicios);

                          return (
                            <div key={workout.id || `${date}-${group}`}>
                              <p>
                                • {formatDate(date)} — {group}
                              </p>

                              <div style={{ marginTop: '8px' }}>
                                {showExerciseBlock ? (
                                  Object.entries(exercicios).map(([grupoNome, lista]) => {
                                    const config = configMap.get(String(grupoNome).trim().toLowerCase())?.config || '3x15';

                                    return (
                                      <div key={grupoNome} style={{ marginTop: 10, marginBottom: 12 }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
                                          {formatGroupTitle(grupoNome)}
                                        </div>

                                        {Array.isArray(lista) && lista.length > 0 ? (
                                          lista.map((nomeExercicio, index) => (
                                            <div
                                              key={`${grupoNome}-${index}-${nomeExercicio}`}
                                              style={{
                                                fontSize: '14px',
                                                opacity: 0.95,
                                                marginLeft: '10px',
                                                marginBottom: '4px'
                                              }}
                                            >
                                              {nomeExercicio} - {config}
                                            </div>
                                          ))
                                        ) : (
                                          <div style={{ marginLeft: '10px', opacity: 0.7 }}>
                                            Nenhum exercício registrado.
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <>
                                    {Array.isArray(workout.muscle_groups) &&
                                      workout.muscle_groups.filter((g) => g !== 'geral').length > 0 && (
                                        <div>
                                          <h4>Grupos musculares</h4>
                                          <span>
                                            {workout.muscle_groups.filter((g) => g !== 'geral').join(', ')}
                                          </span>
                                        </div>
                                      )}
                                  </>
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
