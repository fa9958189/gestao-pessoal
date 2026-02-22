import React, { useEffect, useMemo, useState } from 'react';
import GenericWizard from './GenericWizard.jsx';
import AgendaCalendar from './AgendaCalendar.jsx';

const EventsTable = ({ items, onEdit, onDelete, formatDate, formatTimeRange }) => (
  <div className="events-table-container">
    <table className="events-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Título</th>
          <th>Horário</th>
          <th>Notas</th>
          <th>Status</th>
          <th className="right">Ações</th>
        </tr>
      </thead>
      <tbody id="evTable">
        {items.length === 0 && (
          <tr>
            <td colSpan="6" style={{ textAlign: 'center', padding: '24px 0' }} className="muted">
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
            <td>
              {ev.status === 'pending' && <span className="badge pending">Pendente</span>}
              {ev.status === 'sent' && <span className="badge sent">Enviado</span>}
              {ev.status === 'completed' && <span className="badge completed">Concluído</span>}
              {!ev.status && <span className="badge pending">Pendente</span>}
            </td>
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
    <div className="mobile-card-list" aria-live="polite">
      {items.length === 0 && (
        <div className="mobile-card">
          <p className="muted">Nenhum evento encontrado para este filtro.</p>
        </div>
      )}
      {items.map((ev) => (
        <div key={ev.id} className="mobile-card">
          <div className="mobile-card-header">
            <div>
              <h4 className="mobile-card-title">{ev.title || 'Evento'}</h4>
              <p className="muted">{ev.notes || '-'}</p>
            </div>
          </div>
          <div className="mobile-card-meta">
            <div>
              <span className="label">Data</span>
              <span>{formatDate(ev.date)}</span>
            </div>
            <div>
              <span className="label">Horário</span>
              <span>{formatTimeRange(ev.start, ev.end)}</span>
            </div>
            <div>
              <span className="label">Status</span>
              <span>
                {ev.status === 'pending' && <span className="badge pending">Pendente</span>}
                {ev.status === 'sent' && <span className="badge sent">Enviado</span>}
                {ev.status === 'completed' && <span className="badge completed">Concluído</span>}
                {!ev.status && <span className="badge pending">Pendente</span>}
              </span>
            </div>
          </div>
          <div className="mobile-card-actions">
            <button className="icon-button" onClick={() => onEdit(ev)} title="Editar">
              ✏️
            </button>
            <button className="icon-button" onClick={() => onDelete(ev)} title="Excluir">
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const wizardSteps = [
  { id: 1, label: 'Tipo / título' },
  { id: 2, label: 'Data e horário' },
  { id: 3, label: 'Observações' },
];

const AgendaView = ({
  agendaRef,
  eventForm,
  setEventForm,
  defaultEventForm,
  filteredEvents,
  handleDeleteEvent,
  formatDate,
  formatTimeRange,
  eventWizardOpen,
  eventWizardMode,
  onOpenEventWizard,
  onCloseEventWizard,
  onSaveEventWizard,
  onResetEventWizard,
  supabase,
  userId,
}) => {
  const [selectedDate, setSelectedDate] = useState(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDateEvents, setSelectedDateEvents] = useState([]);

  const futureEvents = useMemo(
    () => filteredEvents.filter((eventItem) => eventItem.date >= today),
    [filteredEvents, today]
  );

  useEffect(() => {
    const loadDateEvents = async () => {
      if (!selectedDate || !supabase || !userId) {
        setSelectedDateEvents([]);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .eq('date', selectedDate)
        .order('start_time', { ascending: true });

      if (error) {
        console.warn('Erro ao carregar histórico do dia na agenda', error);
        setSelectedDateEvents([]);
        return;
      }

      const normalizedEvents = (data || []).map((eventItem) => ({
        ...eventItem,
        start: eventItem.start ?? eventItem.start_time ?? null,
        end: eventItem.end ?? eventItem.end_time ?? null,
      }));

      setSelectedDateEvents(normalizedEvents);
    };

    loadDateEvents();
  }, [selectedDate, supabase, userId]);

  const visibleEvents = useMemo(() => {
    if (!selectedDate) return futureEvents;
    return selectedDateEvents;
  }, [futureEvents, selectedDate, selectedDateEvents]);

  return (
    <section className="card dashboard-card" ref={agendaRef}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="title">Agenda</h2>
        <button className="primary" onClick={() => onOpenEventWizard({ mode: 'create' })}>
          Novo evento
        </button>
      </div>

      <div className="agenda-container">
        <div className="agenda-grid">
          <div className="calendar-wrapper">
            <AgendaCalendar
              supabase={supabase}
              userId={userId}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={futureEvents}
            />
            <button onClick={() => setSelectedDate(null)} style={{ marginTop: 8 }}>
              Mostrar todos os próximos
            </button>
          </div>

          <div>
            {selectedDate && (
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="muted" style={{ margin: 0 }}>
                  Filtrando por data: <strong>{formatDate(selectedDate)}</strong>
                </p>
                <button className="ghost" onClick={() => setSelectedDate(null)}>
                  Limpar seleção
                </button>
              </div>
            )}

            <EventsTable
              items={visibleEvents}
              onEdit={(ev) => onOpenEventWizard({ mode: 'edit', data: ev })}
              onDelete={handleDeleteEvent}
              formatDate={formatDate}
              formatTimeRange={formatTimeRange}
            />
          </div>
        </div>
      </div>

      {eventWizardOpen && (
        <GenericWizard
          isOpen={eventWizardOpen}
          mode={eventWizardMode}
          title={eventWizardMode === 'edit' ? 'Editar evento' : 'Novo evento'}
          subtitle={
            eventWizardMode === 'edit' && eventForm.title
              ? `Editando: ${eventForm.title}`
              : 'Preencha as informações do evento passo a passo.'
          }
          steps={wizardSteps}
          validateStep={(step) => {
            if (step === 1 && !eventForm.title.trim()) {
              return { valid: false, message: 'Informe o título do evento para continuar.' };
            }
            if (step === 2) {
              if (!eventForm.date) {
                return { valid: false, message: 'Informe a data do evento para continuar.' };
              }
            }
            if (step === 3 && !eventForm.notes.trim()) {
              return { valid: false, message: 'Informe as observações do evento para continuar.' };
            }
            return { valid: true, message: '' };
          }}
          onClose={onCloseEventWizard}
          onSave={onSaveEventWizard}
          onReset={onResetEventWizard}
          saveLabel={eventWizardMode === 'edit' ? 'Atualizar' : 'Salvar'}
        >
          {(step) => (
            <>
              {step === 1 && (
                <div className="transaction-wizard-panel">
                  <label>Título do evento</label>
                  <input
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    placeholder="Reunião, Médico, etc."
                  />
                </div>
              )}
              {step === 2 && (
                <div className="transaction-wizard-panel">
                  <div className="transaction-wizard-grid">
                    <div>
                      <label>Data</label>
                      <input
                        type="date"
                        value={eventForm.date}
                        onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Início</label>
                      <input
                        type="time"
                        value={eventForm.start}
                        onChange={(e) => setEventForm({ ...eventForm, start: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Fim</label>
                      <input
                        type="time"
                        value={eventForm.end}
                        onChange={(e) => setEventForm({ ...eventForm, end: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="transaction-wizard-panel">
                  <label>Observações</label>
                  <textarea
                    value={eventForm.notes}
                    onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                    placeholder="Observações do evento..."
                  ></textarea>
                </div>
              )}
            </>
          )}
        </GenericWizard>
      )}

      <div className="sep"></div>
    </section>
  );
};

export default AgendaView;
