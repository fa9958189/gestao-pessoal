import React, { useEffect, useMemo, useState } from 'react';

const defaultForm = {
  title: '',
  reminder_time: '',
  notes: '',
  active: true,
};

const emptyReminders = [];

function DailyAgenda({ apiBaseUrl, notify, userId, refreshToken, getAccessToken }) {
  const [form, setForm] = useState(defaultForm);
  const [reminders, setReminders] = useState(emptyReminders);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const baseUrl = useMemo(() => apiBaseUrl?.replace(/\/$/, '') || '', [apiBaseUrl]);

  const buildAuthHeaders = async () => {
    if (!getAccessToken) return {};

    try {
      const accessToken = await getAccessToken();
      return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    } catch (err) {
      console.warn('Erro ao obter token para agenda diária', err);
      return {};
    }
  };

  const fetchReminders = async () => {
    if (!userId) {
      setReminders(emptyReminders);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/api/daily-reminders?userId=${userId}`);
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('load daily reminders failed', response.status, errorBody);
        const error = new Error('Erro ao carregar lembretes.');
        error.details = errorBody;
        throw error;
      }
      const data = await response.json();
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const normalizedItems = items.map((item) => ({
        ...item,
        reminder_time: item.reminder_time || item.time || '',
        active: item.active ?? item.is_active ?? true,
      }));
      setReminders(normalizedItems);
    } catch (err) {
      console.error('Erro ao buscar lembretes diários', err);
      notify?.('Não foi possível carregar os lembretes.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, userId, refreshToken]);

  const handleSubmit = async () => {
    if (!userId) {
      console.error('Agenda diária: userId ausente ao salvar lembrete.');
      notify?.('Usuário não identificado. Faça login novamente.', 'danger');
      return;
    }

    const nextErrors = {
      title: !form.title?.trim(),
      reminder_time: !form.reminder_time,
    };

    if (nextErrors.title || nextErrors.reminder_time) {
      setErrors(nextErrors);
      notify?.('Preencha título e horário.', 'warning');
      return;
    }

    setErrors({});

    try {
      setSaving(true);
      const payload = {
        userId,
        title: form.title,
        reminder_time: form.reminder_time,
        notes: form.notes,
        is_active: !!form.active,
      };

      const url = editingId
        ? `${baseUrl}/api/daily-reminders/${editingId}`
        : `${baseUrl}/api/daily-reminders`;
      const method = editingId ? 'PUT' : 'POST';

      const authHeaders = await buildAuthHeaders();
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      const responseBody = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        console.error('save daily reminder failed', response.status, responseBody);
        throw new Error('Erro ao salvar lembrete.');
      }

      notify?.(editingId ? 'Lembrete atualizado.' : 'Lembrete criado.', 'success');
      setForm(defaultForm);
      setEditingId(null);
      setErrors({});
      await fetchReminders();
    } catch (err) {
      console.warn('Erro ao salvar lembrete diário', err);
      notify?.('Não foi possível salvar o lembrete.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reminder) => {
    setEditingId(reminder.id);
    setErrors({});
    setForm({
      title: reminder.title || '',
      reminder_time: reminder.reminder_time || reminder.time || '',
      notes: reminder.notes || '',
      active: reminder.active ?? true,
    });
  };

  const handleDelete = async (reminder) => {
    if (!userId) {
      notify?.('Usuário não identificado. Faça login novamente.', 'danger');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/daily-reminders/${reminder.id}?userId=${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('delete daily reminder failed', response.status, errorBody);
        throw new Error('Erro ao excluir lembrete.');
      }
      notify?.('Lembrete excluído.', 'success');
      fetchReminders();
    } catch (err) {
      console.warn('Erro ao excluir lembrete', err);
      notify?.('Não foi possível excluir o lembrete.', 'danger');
    }
  };

  const handleToggle = async (reminder) => {
    if (!userId) {
      notify?.('Usuário não identificado. Faça login novamente.', 'danger');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/daily-reminders/${reminder.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('toggle daily reminder failed', response.status, errorBody);
        throw new Error('Erro ao atualizar status.');
      }
      notify?.('Status atualizado.', 'success');
      fetchReminders();
    } catch (err) {
      console.warn('Erro ao alternar status do lembrete', err);
      notify?.('Não foi possível atualizar o status.', 'danger');
    }
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  return (
    <div className="container single-card">
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="title">Agenda Diária</h2>
            <p className="muted" style={{ margin: 0 }}>
              Cadastre lembretes rápidos para o seu dia e gerencie o status de cada um.
            </p>
          </div>
          <div className="badge">{loading ? 'Sincronizando...' : 'Atualizado'}</div>
        </div>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label>Título</label>
            <input
              value={form.title}
              onChange={(e) => {
                const value = e.target.value;
                setForm({ ...form, title: value });
                if (errors.title && value.trim()) {
                  setErrors((prev) => ({ ...prev, title: false }));
                }
              }}
              placeholder="Lembrete do dia"
              style={errors.title ? { borderColor: '#ff4d4f' } : undefined}
            />
            {errors.title && (
              <span
                style={{
                  color: '#ff4d4f',
                  fontSize: '12px',
                  marginTop: '6px',
                  display: 'block',
                }}
              >
                Preencha o título corretamente
              </span>
            )}
          </div>
          <div>
            <label>Horário</label>
            <input
              type="time"
              value={form.reminder_time}
              onChange={(e) => setForm({ ...form, reminder_time: e.target.value })}
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Detalhes rápidos ou observações"
          />
        </div>

        <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            Ativo
          </label>
          <div style={{ flex: 1 }}></div>
          <button className="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
          </button>
          <button className="ghost" onClick={resetForm} disabled={saving}>
            Limpar
          </button>
        </div>

        <div className="sep"></div>

        <div className="events-table-container">
          <table className="events-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Horário</th>
                <th>Notas</th>
                <th>Status</th>
                <th className="right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {reminders.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px 0' }} className="muted">
                    {loading ? 'Carregando lembretes...' : 'Nenhum lembrete cadastrado.'}
                  </td>
                </tr>
              )}
              {reminders.map((reminder) => (
                <tr key={reminder.id}>
                  <td>{reminder.title}</td>
                  <td>{reminder.reminder_time || '-'}</td>
                  <td>{reminder.notes || '-'}</td>
                  <td>
                    <span className={`badge ${reminder.active ? 'badge-active' : 'badge-inactive'}`}>
                      {reminder.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="right">
                    <div className="table-actions">
                      <button className="icon-button" onClick={() => handleEdit(reminder)} title="Editar">
                        ✏️
                      </button>
                      <button className="icon-button" onClick={() => handleDelete(reminder)} title="Excluir">
                        🗑️
                      </button>
                      <button className="icon-button" onClick={() => handleToggle(reminder)} title="Ativar/Desativar">
                        {reminder.active ? '⏸️' : '▶️'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default DailyAgenda;
