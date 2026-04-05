import React, { useEffect, useMemo, useState } from 'react';

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

export default function Supervisor({
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
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isAdmin = String(role || '').toLowerCase() === 'admin';
  const isAffiliate = String(role || '').toLowerCase() === 'affiliate';

  const canSeeSupervisor = isAdmin || isAffiliate;

  useEffect(() => {
    if (!canSeeSupervisor || !apiBase) return;

    let isMounted = true;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch(`${apiBase}/supervisor/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const body = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(body?.error || 'Erro ao carregar usuários do supervisor.');
        }

        if (isMounted) {
          const safeUsers = Array.isArray(body) ? body : [];
          setUsers(safeUsers);
        }
      } catch (err) {
        console.warn('Erro em /supervisor/users', err);
        pushToast(err?.message || 'Erro ao carregar usuários do supervisor.', 'danger');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [apiBase, canSeeSupervisor, getAccessToken, pushToast]);

  const visibleUsers = useMemo(() => {
    if (isAdmin) return users;
    const affiliateReference = currentAffiliateId || currentUserId;
    return users.filter((user) => user?.affiliate_id && user.affiliate_id === affiliateReference);
  }, [users, isAdmin, currentAffiliateId, currentUserId]);

  const openUserDetail = async (user) => {
    if (!user?.id || !apiBase) return;

    if (!isAdmin) {
      const affiliateReference = currentAffiliateId || currentUserId;
      if (!affiliateReference || user.affiliate_id !== affiliateReference) {
        pushToast('Sem permissão para visualizar este usuário.', 'danger');
        return;
      }
    }

    setSelectedUser(user);
    setLoadingDetail(true);
    setSelectedUserDetail(null);

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`${apiBase}/supervisor/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Erro ao carregar detalhe do usuário.');
      }

      if (!isAdmin) {
        const affiliateReference = currentAffiliateId || currentUserId;
        if (body?.profile?.affiliate_id !== affiliateReference) {
          pushToast('Detalhe bloqueado por segurança.', 'danger');
          setSelectedUser(null);
          setSelectedUserDetail(null);
          return;
        }
      }

      setSelectedUserDetail(body || null);
    } catch (err) {
      console.warn('Erro em /supervisor/users/:id', err);
      pushToast(err?.message || 'Erro ao carregar detalhes do usuário.', 'danger');
      setSelectedUser(null);
      setSelectedUserDetail(null);
    } finally {
      setLoadingDetail(false);
    }
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
                  {loading ? (
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
              <div className="detail-grid" style={{ marginTop: 16 }}>
                <div className="card">
                  <h4>📊 RESUMO</h4>
                  <p><strong>Nome:</strong> {selectedUserDetail?.profile?.name || '-'}</p>
                  <p><strong>Status:</strong> {formatStatus(selectedUserDetail?.profile || selectedUser)}</p>
                  <p><strong>Plano:</strong> {formatPlan(selectedUserDetail?.profile?.plan_type || selectedUser?.plan_type)}</p>
                </div>

                <div className="card">
                  <h4>💪 TREINOS</h4>
                  {(selectedUserDetail?.workouts || []).slice(0, 7).map((workout) => (
                    <p key={workout.id}>• {workout.name || workout.title || 'Treino'} ({formatDate(workout.created_at)})</p>
                  ))}
                  {(selectedUserDetail?.workouts || []).length === 0 && <p className="muted">Sem treinos na semana.</p>}
                </div>

                <div className="card">
                  <h4>🍽 ALIMENTAÇÃO</h4>
                  {(selectedUserDetail?.food_logs || []).slice(0, 7).map((entry) => (
                    <p key={entry.id}>• {entry.food || 'Registro'} ({formatDate(entry.entry_date || entry.created_at)})</p>
                  ))}
                  {(selectedUserDetail?.food_logs || []).length === 0 && <p className="muted">Sem registros recentes.</p>}
                </div>

                <div className="card">
                  <h4>⚖ PESO</h4>
                  {(selectedUserDetail?.weight_history || []).slice(0, 10).map((entry) => (
                    <p key={`${entry.user_id}-${entry.entry_date}-${entry.recorded_at || entry.id}`}>
                      • {formatDate(entry.entry_date)}: {Number(entry.weight_kg || 0).toFixed(1)} kg
                    </p>
                  ))}
                  {(selectedUserDetail?.weight_history || []).length === 0 && <p className="muted">Sem histórico de peso.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
