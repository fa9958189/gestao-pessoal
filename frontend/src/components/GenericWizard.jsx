import React, { useEffect, useMemo, useState } from 'react';

const GenericWizard = ({
  isOpen,
  mode,
  title,
  subtitle,
  steps,
  onClose,
  onSave,
  onReset,
  saveLabel,
  children,
}) => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
    }
  }, [isOpen, mode]);

  const computedTitle = useMemo(() => {
    if (title) return title;
    return mode === 'edit' ? 'Editar' : 'Novo';
  }, [mode, title]);

  if (!isOpen) return null;

  const handleNext = () => setStep((prev) => Math.min(prev + 1, steps.length));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));
  const resolvedSaveLabel = saveLabel || (mode === 'edit' ? 'Atualizar' : 'Salvar');

  return (
    <div className="transaction-wizard-overlay" role="dialog" aria-modal="true">
      <div className="transaction-wizard">
        <div className="transaction-wizard-header">
          <div>
            <h3>{computedTitle}</h3>
            {subtitle && <p className="muted">{subtitle}</p>}
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

        <div className="transaction-wizard-body">{children(step)}</div>

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
                {onReset && (
                  <button className="ghost" onClick={onReset}>
                    Limpar
                  </button>
                )}
                <button className="primary" onClick={onSave}>
                  {resolvedSaveLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenericWizard;
