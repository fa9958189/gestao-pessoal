import React, { useMemo, useState } from "react";

export default function Transacoes() {
  const centeredContainerStyle = {
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
    padding: "0 16px",
    boxSizing: "border-box",
  };

  const hoje = new Date().toISOString().split("T")[0];

  const [transacoes, setTransacoes] = useState([]);
  const [tipo, setTipo] = useState("receita");
  const [categoria, setCategoria] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");
  const [openTransacaoModal, setOpenTransacaoModal] = useState(false);
  const [step, setStep] = useState(1);
  const [tipoTransacao, setTipoTransacao] = useState(null);

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
    setTipoTransacao(null);
    setStep(1);
  }

  function selecionarTipo(tipoSelecionado) {
    setTipoTransacao(tipoSelecionado);
    setTipo(tipoSelecionado);
  }

  async function salvarTransacao() {
    await adicionarTransacao();
    setOpenTransacaoModal(false);
  }

  return (
    <div style={centeredContainerStyle}>
      <div className="card">
        <h2>Transações</h2>

        <div style={{ marginBottom: "20px" }}>
          <button
            className="btn-primary"
            onClick={() => {
              setOpenTransacaoModal(true);
              setStep(1);
            }}
          >
            * Nova Transação
          </button>
        </div>

        {openTransacaoModal && (
          <div className="modal-overlay">
            <div className="report-modal">
              <h2>Nova transação</h2>

            <p>Passo {step} de 3</p>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>

            {step === 1 && (
              <div>
                <h3>O que deseja registrar?</h3>

                <button
                  className={`treino-option ${tipoTransacao === "receita" ? "selected" : ""}`}
                  onClick={() => selecionarTipo("receita")}
                >
                  💰 Receita
                </button>

                <button
                  className={`treino-option ${tipoTransacao === "despesa" ? "selected" : ""}`}
                  onClick={() => selecionarTipo("despesa")}
                >
                  💸 Despesa
                </button>
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

                <label>Descrição</label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Venda"
                />

                <label>Categoria</label>
                <input
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Categoria"
                />

                <label>Valor</label>
                <input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <h3>Confirmar transação</h3>
                <p>Revise os dados antes de salvar</p>
              </div>
            )}

            <div className="wizard-actions">
              {step > 1 && <button onClick={() => setStep(step - 1)}>← Voltar</button>}

              {step < 3 && (
                <button
                  disabled={step === 1 && !tipoTransacao}
                  onClick={() => setStep(step + 1)}
                >
                  Continuar →
                </button>
              )}

              {step === 3 && (
                <button className="btn-primary" onClick={salvarTransacao}>
                  Salvar Transação
                </button>
              )}

              <button
                onClick={() => {
                  setOpenTransacaoModal(false);
                  limparFormulario();
                }}
              >
                Cancelar
              </button>
            </div>
            </div>
          </div>
        )}

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
                {item.data} · {item.tipo} · {item.categoria || "sem categoria"} · R${" "}
                {Number(item.valor || 0).toFixed(2)}
                {item.descricao ? ` · ${item.descricao}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
