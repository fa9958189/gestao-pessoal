import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { notify } from "../utils/notify";

export default function Agenda() {
  const hoje = new Date().toISOString().split("T")[0];

  const [eventos, setEventos] = useState([]);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    title: "",
    date: hoje,
    start: "",
    end: "",
    notes: "",
  });

  const [showWizard, setShowWizard] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});

  const fetchEvents = useCallback(async () => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser);

    const query = supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });

    const { data, error } = currentUser
      ? await query.eq("user_id", currentUser.id)
      : await query;

    if (error) {
      console.error(error);
      return;
    }

    setEventos(data || []);
  }, []);

  function formatarDataBR(data) {
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  const proximosEventos = eventos
    .filter((e) => e.date > hoje)
    .sort((a, b) => a.date.localeCompare(b.date));

  const eventosHistorico = eventos
    .filter((e) => e.date <= hoje)
    .sort((a, b) => b.date.localeCompare(a.date));

  const eventosHistoricoFiltrados = eventosHistorico.filter((e) =>
    !search.trim()
      ? true
      : `${e.title} ${e.notes || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const salvarEvento = async () => {
    if (!user?.id) {
      notify("Usuário não autenticado", "warning");
      return;
    }

    try {
      console.log("Enviando evento:", form);

      const { data, error } = await supabase
        .from("events")
        .insert([
          {
            user_id: user.id,
            title: form.title,
            date: form.date,
            start: form.start,
            end: form.end,
            notes: form.notes,
          },
        ])
        .select();

      if (error) {
        console.error("Erro ao salvar evento:", error);
        notify("Erro ao salvar evento", "warning");
        return;
      }

      console.log("Evento salvo com sucesso:", data);

      setEventos((prev) => [
        ...prev,
        {
          id: data[0].id,
          ...form,
        },
      ]);

      setForm({
        title: "",
        date: "",
        start: "",
        end: "",
        notes: "",
      });

      setStep(1);
      setShowWizard(false);
    } catch (err) {
      console.error("Erro inesperado:", err);
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Deseja excluir este evento?");
    if (!confirmDelete) return;

    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const query = supabase
        .from("events")
        .delete()
        .eq("id", id);

      const { error } = currentUser
        ? await query.eq("user_id", currentUser.id)
        : await query;

      if (error) {
        throw error;
      }

      await fetchEvents();
    } catch (err) {
      console.error("Erro ao excluir evento:", err);
      notify("Não foi possível excluir o evento.", "warning");
    }
  };

  function handleCloseWizardModal() {
    setShowWizard(false);
  }

  function handleCloseCalendarModal() {
    setShowCalendar(false);
  }

  function handleContinueStep() {
    const newErrors = {};

    if (step === 1) {
      if (!form.title || !form.title.trim()) {
        newErrors.title = true;
        notify("Preencha o título antes de continuar", "warning");
      }
    }

    if (step === 2) {
      if (!form.date) {
        newErrors.date = true;
        notify("Selecione a data", "warning");
      }
    }

    if (step === 3) {
      if (!form.start) {
        newErrors.start = true;
        notify("Informe o horário de início", "warning");
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return;

    setStep((prev) => prev + 1);
  }

  function limpar() {
    setForm({
      title: "",
      date: hoje,
      start: "",
      end: "",
      notes: "",
    });
  }

  return (
    <div className="card">
      <div className="header-actions">
        <h2>Agenda</h2>

        <button className="btn-primary" onClick={() => setShowWizard(true)}>
          + Novo Evento
        </button>
      </div>

      {showWizard && (
        <div className="modal-overlay" onClick={handleCloseWizardModal}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Cadastrar evento</h2>

            <div className="wizard-progress">Passo {step} de 4</div>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>

            {step === 1 && (
              <div>
                <label>Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, title: e.target.value }));

                    if (errors.title) {
                      setErrors((prev) => ({ ...prev, title: false }));
                    }
                  }}
                  style={{
                    border: errors.title ? "1px solid #ff4d4f" : "",
                    boxShadow: errors.title ? "0 0 5px rgba(255,77,79,0.5)" : "",
                    transition: "all 0.2s ease",
                  }}
                  autoFocus={step === 1}
                  placeholder="Reunião, médico..."
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <label>Data</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <label>Horário início</label>
                <input
                  type="time"
                  value={form.start}
                  onChange={(e) => setForm((prev) => ({ ...prev, start: e.target.value }))}
                />

                <label>Horário fim</label>
                <input
                  type="time"
                  value={form.end}
                  onChange={(e) => setForm((prev) => ({ ...prev, end: e.target.value }))}
                />
              </div>
            )}

            {step === 4 && (
              <div>
                <label>Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Observações..."
                />
              </div>
            )}

            <div className="wizard-actions">
              {step > 1 && <button className="btn-ui" onClick={() => setStep(step - 1)}>← Voltar</button>}

              {step < 4 && <button className="btn-ui" onClick={handleContinueStep}>Continuar →</button>}

              {step === 4 && (
                <button className="btn-primary" onClick={salvarEvento}>
                  Salvar Evento
                </button>
              )}

              <button className="btn-ui" onClick={handleCloseWizardModal}>Cancelar</button>

              <button className="btn-ui" onClick={limpar}>Limpar</button>
            </div>
          </div>
        </div>
      )}

      <hr />

      <div className="card-ui" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>📅 Próximos eventos</h3>

          <button className="btn-secondary btn-ui" onClick={() => setShowCalendar(true)}>
            📆 Histórico
          </button>
        </div>

        {proximosEventos.length === 0 ? (
          <p style={{ opacity: 0.7 }}>Nenhum evento agendado</p>
        ) : (
          <div className="agenda-scroll-container">
            {proximosEventos.map((evento) => (
              <div key={evento.id} className="event-card card-ui">
                <div className="event-date">{formatarDataBR(evento.date)}</div>

                <div className="event-content">
                  <div className="event-title">{evento.title}</div>
                  {evento.notes && <div className="event-subtitle">{evento.notes}</div>}
                  {(evento.start || evento.end) && (
                    <div className="event-subtitle">
                      {evento.start || "--:--"}
                      {evento.end ? ` até ${evento.end}` : ""}
                    </div>
                  )}
                </div>

                <div className="event-actions">
                  <button
                    type="button"
                    className="btn-delete btn-ui"
                    onClick={() => handleDelete(evento.id)}
                    aria-label={`Excluir evento ${evento.title}`}
                    title="Excluir evento"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCalendar && (
        <div className="modal-overlay" onClick={handleCloseCalendarModal}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📆 Histórico de Eventos</h2>

            <input
              type="text"
              placeholder="🔎 Buscar evento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />

            {eventosHistoricoFiltrados.length === 0 ? (
              <p style={{ opacity: 0.6 }}>Nenhum evento encontrado</p>
            ) : (
              <div className="agenda-scroll-container" style={{ marginTop: 10 }}>
                {eventosHistoricoFiltrados.map((e) => (
                  <div className="event-card card-ui" key={e.id}>
                    <div className="event-date">{formatarDataBR(e.date)}</div>
                    <div className="event-content">
                      <div className="event-title">{e.title}</div>
                      {e.notes && <div className="event-subtitle">{e.notes}</div>}
                      {(e.start || e.end) && (
                        <div className="event-subtitle">
                          {e.start || "--:--"}
                          {e.end ? ` até ${e.end}` : ""}
                        </div>
                      )}
                    </div>

                    <div className="event-actions">
                      <button
                        type="button"
                        className="btn-delete btn-ui"
                        onClick={() => handleDelete(e.id)}
                        aria-label={`Excluir evento ${e.title}`}
                        title="Excluir evento"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-secondary btn-ui" onClick={handleCloseCalendarModal}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
