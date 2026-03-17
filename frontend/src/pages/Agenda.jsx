import React, { useState } from "react";

export default function Agenda() {
  const hoje = new Date().toISOString().split("T")[0];

  const [eventos, setEventos] = useState([]);
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(hoje);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [notas, setNotas] = useState("");

  const [dataDe, setDataDe] = useState(hoje);
  const [dataAte, setDataAte] = useState(hoje);

  const [showWizard, setShowWizard] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [step, setStep] = useState(1);

  const eventosFuturos = eventos
    .filter((e) => e.date >= hoje)
    .sort((a, b) => a.date.localeCompare(b.date));

  function limpar() {
    setTitulo("");
    setData(hoje);
    setInicio("");
    setFim("");
    setNotas("");
  }

  function salvarEvento() {
    const novoEvento = {
      id: crypto.randomUUID(),
      title: titulo,
      date: data,
      start: inicio,
      end: fim,
      notes: notas,
    };

    setEventos((prev) => [novoEvento, ...prev]);
    limpar();
    setStep(1);
    setShowWizard(false);
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
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Reunião, médico..."
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <label>Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <label>Horário início</label>
                <input
                  type="time"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />

                <label>Horário fim</label>
                <input type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            )}

            {step === 4 && (
              <div>
                <label>Notas</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
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

      <label>De</label>

      <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />

      <label>Até</label>

      <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>📅 Próximos eventos</h3>

          <button className="btn-secondary" onClick={() => setShowCalendar(true)}>
            📆 Histórico
          </button>
        </div>

        {eventosFuturos.length === 0 && <p style={{ opacity: 0.7 }}>Nenhum evento agendado</p>}

        {eventosFuturos.map((evento) => (
          <div className="evento-item" key={evento.id}>
            <div className="evento-data">{evento.date}</div>

            <div className="evento-info">
              <strong>{evento.title}</strong>
              {evento.notes && <p>{evento.notes}</p>}
            </div>
          </div>
        ))}
      </div>

      {showCalendar && (
        <div className="modal-overlay">
          <div className="report-modal">
            <h2>📆 Histórico de Eventos</h2>

            {eventos
              .filter((e) => e.date < hoje)
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((e) => (
                <div className="evento-item" key={e.id}>
                  <div className="evento-data">{e.date}</div>
                  <div className="evento-info">
                    <strong>{e.title}</strong>
                    {e.notes && <p>{e.notes}</p>}
                  </div>
                </div>
              ))}

            <button className="btn-secondary" onClick={() => setShowCalendar(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
