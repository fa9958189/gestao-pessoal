import React, { useEffect, useMemo, useState } from 'react';

const GenericWizard = ({
  isOpen,
  mode,
  title,
  subtitle,
  steps,
  validateStep,
  onClose,
  onSave,
  onReset,
  saveLabel,
  children,
}) => {
  const [step, setStep] = useState(1);
  const [nextError, setNextError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setNextError('');
    }
  }, [isOpen, mode]);

  const computedTitle = useMemo(() => {
    if (title) return title;
    return mode === 'edit' ? 'Editar' : 'Novo';
  }, [mode, title]);

  if (!isOpen) return null;

  const stepValidation = useMemo(() => {
    if (!validateStep) {
      return { valid: true, message: '' };
    }
    const validationResult = validateStep(step);
    if (typeof validationResult === 'string') {
      return { valid: false, message: validationResult };
    }
    if (validationResult && typeof validationResult === 'object') {
      return {
        valid: Boolean(validationResult.valid),
        message: validationResult.message || ''
      };
    }
    return { valid: Boolean(validationResult), message: '' };
  }, [step, validateStep]);

  useEffect(() => {
    if (stepValidation.valid) {
      setNextError('');
    }
  }, [step, stepValidation.valid]);

  const handleNext = () => {
    if (!stepValidation.valid) {
      setNextError(stepValidation.message || 'Preencha o campo obrigatório para continuar.');
      return;
    }
    setNextError('');
    setStep((prev) => Math.min(prev + 1, steps.length));
  };
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));
  const resolvedSaveLabel = saveLabel || (mode === 'edit' ? 'Atualizar' : 'Salvar');
  const isNextDisabled = step < steps.length && !stepValidation.valid;

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
          <div className="transaction-wizard-actions-error">
            {nextError && <span className="wizard-error">{nextError}</span>}
          </div>
          <div className="transaction-wizard-actions-right">
            {step < steps.length && (
              <div
                role="presentation"
                onClick={() => {
                  if (isNextDisabled) {
                    setNextError(stepValidation.message || 'Preencha o campo obrigatório para continuar.');
                  }
                }}
              >
                <button
                  className="primary"
                  onClick={handleNext}
                  disabled={isNextDisabled}
                  style={isNextDisabled ? { pointerEvents: 'none' } : undefined}
                >
                  Próximo
                </button>
              </div>
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
