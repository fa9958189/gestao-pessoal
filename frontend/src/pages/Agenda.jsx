import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function Agenda() {
  const hoje = new Date().toISOString().split("T")[0];
  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    ""
  ).replace(/\/$/, "");

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
      alert("Usuário não autenticado");
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
        alert("Erro ao salvar evento");
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
      const response = await fetch(`${apiBaseUrl}/events/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erro ao excluir evento");
      }

      await fetchEvents();
    } catch (err) {
      console.error("Erro ao excluir evento:", err);
      alert("Não foi possível excluir o evento.");
    }
  };

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
        <div className="modal-overlay">
          <div className="report-modal">
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
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
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
              {step > 1 && <button onClick={() => setStep(step - 1)}>← Voltar</button>}

              {step < 4 && <button onClick={() => setStep(step + 1)}>Continuar →</button>}

              {step === 4 && (
                <button className="btn-primary" onClick={salvarEvento}>
                  Salvar Evento
                </button>
              )}

              <button onClick={() => setShowWizard(false)}>Cancelar</button>

              <button onClick={limpar}>Limpar</button>
            </div>
          </div>
        </div>
      )}

      <hr />

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>📅 Próximos eventos</h3>

          <button className="btn-secondary" onClick={() => setShowCalendar(true)}>
            📆 Histórico
          </button>
        </div>

        {proximosEventos.length === 0 && <p style={{ opacity: 0.7 }}>Nenhum evento agendado</p>}

        {proximosEventos.map((evento) => (
          <div className="evento-item" key={evento.id}>
            <div className="evento-data">{formatarDataBR(evento.date)}</div>

            <div className="evento-info">
              <strong>{evento.title}</strong>
              {evento.notes && <p>{evento.notes}</p>}
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleDelete(evento.id)}
              aria-label={`Excluir evento ${evento.title}`}
              title="Excluir evento"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {showCalendar && (
        <div className="modal-overlay">
          <div className="report-modal">
            <h2>📆 Histórico de Eventos</h2>

            <input
              type="text"
              placeholder="🔎 Buscar evento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />

            <div className="historico-scroll">
              {eventosHistoricoFiltrados.map((e) => (
                <div className="evento-item" key={e.id}>
                  <div className="evento-data">{formatarDataBR(e.date)}</div>
                  <div className="evento-info">
                    <strong>{e.title}</strong>
                    {e.notes && <p>{e.notes}</p>}
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleDelete(e.id)}
                    aria-label={`Excluir evento ${e.title}`}
                    title="Excluir evento"
                  >
                    🗑️
                  </button>
                </div>
              ))}

              {eventosHistoricoFiltrados.length === 0 && (
                <p style={{ opacity: 0.6 }}>Nenhum evento encontrado</p>
              )}
            </div>

            <button className="btn-secondary" onClick={() => setShowCalendar(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
