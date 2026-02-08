import React from 'react';

const EventsTable = ({ items, onEdit, onDelete, formatDate, formatTimeRange }) => (
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

const AgendaView = ({
  agendaRef,
  eventForm,
  setEventForm,
  defaultEventForm,
  eventFilters,
  setEventFilters,
  loadRemoteData,
  loadingData,
  filteredEvents,
  handleSaveEvent,
  handleDeleteEvent,
  formatDate,
  formatTimeRange,
}) => (
  <aside className="card" ref={agendaRef}>
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
      formatDate={formatDate}
      formatTimeRange={formatTimeRange}
    />
  </aside>
);

export default AgendaView;
