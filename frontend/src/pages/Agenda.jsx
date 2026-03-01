import React, { useState } from "react";

export default function Agenda() {

  const hoje = new Date().toLocaleDateString("pt-BR");

  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(hoje);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [notas, setNotas] = useState("");

  const [dataDe, setDataDe] = useState(hoje);
  const [dataAte, setDataAte] = useState(hoje);

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

      <label>Título</label>
      <input
        value={titulo}
        onChange={(e)=>setTitulo(e.target.value)}
        placeholder="Reunião, Médico, etc."
      />

      <label>Data</label>
      <input
        value={data}
        onChange={(e)=>setData(e.target.value)}
      />

      <label>Início</label>
      <input
        value={inicio}
        onChange={(e)=>setInicio(e.target.value)}
      />

      <label>Fim</label>
      <input
        value={fim}
        onChange={(e)=>setFim(e.target.value)}
      />

      <label>Notas</label>

      <textarea
        value={notas}
        onChange={(e)=>setNotas(e.target.value)}
        placeholder="Observações do evento..."
      />

      <button className="verde">
        Adicionar Evento
      </button>

      <button onClick={limpar}>
        Limpar
      </button>

      <hr/>

      <label>De</label>

      <input
        value={dataDe}
        onChange={(e)=>setDataDe(e.target.value)}
      />

      <label>Até</label>

      <input
        value={dataAte}
        onChange={(e)=>setDataAte(e.target.value)}
      />

    </div>

  );

}
