import React, { useState } from "react";

export default function Agenda() {

  const hoje = new Date().toISOString().split("T")[0];

  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(hoje);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [notas, setNotas] = useState("");

  const [dataDe, setDataDe] = useState(hoje);
  const [dataAte, setDataAte] = useState(hoje);

  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);

  function limpar() {

    setTitulo("");
    setData(hoje);
    setInicio("");
    setFim("");
    setNotas("");

  }

  return (

    <div className="card">

      <h2>Agenda</h2>

      <button
        className="btn-primary"
        onClick={() => {
          setShowForm(true);
          setStep(1);
        }}
      >
        + Novo Evento
      </button>

      {showForm && (
        <div className="agenda-form">
          <div className="wizard-progress">
            Passo {step} de 4
          </div>

          {step === 1 && (
            <div>
              <label>Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e)=>setTitulo(e.target.value)}
                placeholder="Reunião, Médico, etc."
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <label>Data</label>
              <input
                type="date"
                value={data}
                onChange={(e)=>setData(e.target.value)}
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <label>Horário</label>
              <input
                type="time"
                value={inicio}
                onChange={(e)=>setInicio(e.target.value)}
                placeholder="Início"
              />
              <input
                type="time"
                value={fim}
                onChange={(e)=>setFim(e.target.value)}
                placeholder="Fim"
              />
            </div>
          )}

          {step === 4 && (
            <div>
              <label>Notas</label>
              <textarea
                value={notas}
                onChange={(e)=>setNotas(e.target.value)}
                placeholder="Observações do evento..."
              />
            </div>
          )}

          <div className="wizard-actions">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)}>
                Voltar
              </button>
            )}

            {step < 4 && (
              <button onClick={() => setStep(step + 1)}>
                Próximo
              </button>
            )}

            {step === 4 && (
              <button className="btn-primary">
                Salvar Evento
              </button>
            )}

            <button
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>

            <button onClick={limpar}>
              Limpar
            </button>
          </div>
        </div>
      )}

      <hr/>

      <label>De</label>

      <input
        type="date"
        value={dataDe}
        onChange={(e)=>setDataDe(e.target.value)}
      />

      <label>Até</label>

      <input
        type="date"
        value={dataAte}
        onChange={(e)=>setDataAte(e.target.value)}
      />

    </div>

  );

}
