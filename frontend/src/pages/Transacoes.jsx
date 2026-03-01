import React, { useMemo, useState } from "react";

export default function Transacoes() {
  const hoje = new Date().toISOString().split("T")[0];

  const [transacoes, setTransacoes] = useState([]);
  const [tipo, setTipo] = useState("receita");
  const [categoria, setCategoria] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");
  const [etapa, setEtapa] = useState("lista");

  const totais = useMemo(() => {
    return transacoes.reduce(
      (acc, item) => {
        const numero = Number(item.valor) || 0;
        if (item.tipo === "receita") {
          acc.receitas += numero;
        } else {
          acc.despesas += numero;
        }
        return acc;
      },
      { receitas: 0, despesas: 0 }
    );
  }, [transacoes]);

  async function adicionarTransacao() {
    const novoItem = {
      id: crypto.randomUUID(),
      tipo,
      categoria,
      valor,
      data,
      descricao,
    };

    setTransacoes((prev) => [novoItem, ...prev]);
    limparFormulario();
  }

  function limparFormulario() {
    setTipo("receita");
    setCategoria("");
    setValor("");
    setData(hoje);
    setDescricao("");
  }

  return (
    <div className="card">
      <h2>Transações</h2>

      {etapa === "lista" && (
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setEtapa("tipo")}
            style={{
              padding: "14px",
              fontSize: "18px",
              width: "100%",
              maxWidth: "400px",
            }}
          >
            + Nova Transação
          </button>
        </div>
      )}

      {etapa === "tipo" && (
        <div className="card">
          <h3>O que deseja registrar?</h3>

          <button
            onClick={() => {
              setTipo("receita");
              setEtapa("categoria");
            }}
            style={{ marginBottom: "10px", width: "100%", padding: "14px" }}
          >
            Receita 💰
          </button>

          <button
            onClick={() => {
              setTipo("despesa");
              setEtapa("categoria");
            }}
            style={{ marginBottom: "10px", width: "100%", padding: "14px" }}
          >
            Despesa 💸
          </button>

          <button onClick={() => setEtapa("lista")} style={{ width: "100%" }}>
            Cancelar
          </button>
        </div>
      )}

      {etapa === "categoria" && (
        <div className="card">
          <h3>Escolha a categoria</h3>

          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              marginBottom: "15px",
            }}
          >
            <option value="">Selecione</option>

            <option value="alimentacao">Alimentação</option>
            <option value="transporte">Transporte</option>
            <option value="casa">Casa</option>
            <option value="lazer">Lazer</option>
            <option value="outros">Outros</option>
          </select>

          <button onClick={() => setEtapa("valor")} style={{ width: "100%", marginBottom: "10px" }}>
            Continuar
          </button>

          <button onClick={() => setEtapa("tipo")} style={{ width: "100%" }}>
            Voltar
          </button>
        </div>
      )}

      {etapa === "valor" && (
        <div className="card">
          <h3>Digite o valor</h3>

          <input
            type="number"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0.00"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "18px",
              marginBottom: "15px",
            }}
          />

          <button onClick={() => setEtapa("detalhes")} style={{ width: "100%", marginBottom: "10px" }}>
            Continuar
          </button>

          <button onClick={() => setEtapa("categoria")} style={{ width: "100%" }}>
            Voltar
          </button>
        </div>
      )}

      {etapa === "detalhes" && (
        <div className="card">
          <h3>Detalhes</h3>

          <label>Data</label>

          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            style={{ width: "100%", marginBottom: "10px" }}
          />

          <label>Descrição</label>

          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Opcional"
            style={{ width: "100%", marginBottom: "15px" }}
          />

          <button
            onClick={async () => {
              await adicionarTransacao();
              setEtapa("lista");
            }}
            style={{ width: "100%", marginBottom: "10px" }}
          >
            Salvar Transação
          </button>

          <button onClick={() => setEtapa("valor")} style={{ width: "100%" }}>
            Voltar
          </button>
        </div>
      )}

      {etapa !== "lista" && <div />}

      <hr />

      <h3>Totais</h3>
      <p>Receitas: R$ {totais.receitas.toFixed(2)}</p>
      <p>Despesas: R$ {totais.despesas.toFixed(2)}</p>
      <p>Saldo: R$ {(totais.receitas - totais.despesas).toFixed(2)}</p>

      <h3>Lista</h3>
      {transacoes.length === 0 ? (
        <p>Nenhuma transação cadastrada.</p>
      ) : (
        <ul>
          {transacoes.map((item) => (
            <li key={item.id}>
              {item.data} · {item.tipo} · {item.categoria || "sem categoria"} · R$ {Number(item.valor || 0).toFixed(2)}
              {item.descricao ? ` · ${item.descricao}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
