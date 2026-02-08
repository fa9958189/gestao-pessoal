import React, { useEffect, useMemo, useState } from 'react';

const steps = [
  { id: 1, label: 'Tipo' },
  { id: 2, label: 'Valor' },
  { id: 3, label: 'Detalhes' }
];

const TransactionWizard = ({
  isOpen,
  mode,
  initialData,
  formData,
  onChange,
  onClose,
  onSave,
  onReset,
  categories,
  hasLegacyCategory
}) => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
    }
  }, [isOpen, mode]);

  const title = mode === 'edit' ? 'Editar transação' : 'Nova transação';
  const subtitle = useMemo(() => {
    if (mode === 'edit' && initialData?.description) {
      return `Editando: ${initialData.description}`;
    }
    return 'Siga as etapas para preencher os dados corretamente.';
  }, [mode, initialData]);

  if (!isOpen) return null;

  const handleNext = () => setStep((prev) => Math.min(prev + 1, steps.length));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));

  return (
    <div className="transaction-wizard-overlay" role="dialog" aria-modal="true">
      <div className="transaction-wizard">
        <div className="transaction-wizard-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">{subtitle}</p>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Fechar">
            Fechar
          </button>
        </div>

        <div className="transaction-wizard-steps">
          {steps.map((item) => (
            <div
              key={item.id}
              className={item.id === step ? 'transaction-wizard-step active' : 'transaction-wizard-step'}
            >
              <span>{item.id}</span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>

        <div className="transaction-wizard-body">
          {step === 1 && (
            <div className="transaction-wizard-panel">
              <label>Tipo de transação</label>
              <div className="transaction-wizard-options">
                <button
                  type="button"
                  className={formData.type === 'income' ? 'wizard-option active' : 'wizard-option'}
                  onClick={() => onChange({ ...formData, type: 'income' })}
                >
                  Receita
                </button>
                <button
                  type="button"
                  className={formData.type === 'expense' ? 'wizard-option active' : 'wizard-option'}
                  onClick={() => onChange({ ...formData, type: 'expense' })}
                >
                  Despesa
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="transaction-wizard-panel">
              <label>Valor (use ponto para decimais)</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => onChange({ ...formData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          )}

          {step === 3 && (
            <div className="transaction-wizard-panel">
              <div className="transaction-wizard-grid">
                <div>
                  <label>Data</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => onChange({ ...formData, date: e.target.value })}
                  />
                </div>
                <div>
                  <label>Categoria</label>
                  <select
                    value={formData.category}
                    onChange={(e) => onChange({ ...formData, category: e.target.value })}
                  >
                    {hasLegacyCategory && (
                      <option value={formData.category}>Categoria atual: {formData.category}</option>
                    )}
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label>Descrição</label>
                <input
                  value={formData.description}
                  onChange={(e) => onChange({ ...formData, description: e.target.value })}
                  placeholder="Ex.: Venda no Pix"
                />
              </div>
            </div>
          )}
        </div>

        <div className="transaction-wizard-actions">
          <div>
            {step > 1 && (
              <button className="ghost" onClick={handleBack}>
                Voltar
              </button>
            )}
          </div>
          <div className="transaction-wizard-actions-right">
            {step < steps.length && (
              <button className="primary" onClick={handleNext}>
                Próximo
              </button>
            )}
            {step === steps.length && (
              <>
                <button className="ghost" onClick={onReset}>
                  Limpar
                </button>
                <button className="primary" onClick={onSave}>
                  {mode === 'edit' ? 'Atualizar' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionWizard;
