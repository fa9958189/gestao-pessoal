import React, { useEffect, useMemo, useState } from 'react';

const PaymentActivationScreen = ({ apiBase, supabase }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [alreadyUsed, setAlreadyUsed] = useState(false);
  const [email, setEmail] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    whatsapp: '',
    password: '',
    confirmPassword: '',
  });

  const sessionId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('session_id')?.trim() || '';
    } catch (err) {
      return '';
    }
  }, []);

  const goToLogin = () => {
    window.location.href = '/';
  };

  useEffect(() => {
    const validate = async () => {
      if (!apiBase || !sessionId) {
        setLoading(false);
        setError('Link inválido ou incompleto.');
        return;
      }

      try {
        const response = await fetch(
          `${apiBase}/stripe/checkout/validate?session_id=${encodeURIComponent(sessionId)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.message || 'Não foi possível validar seu pagamento.');
        }

        if (!payload?.valid) {
          setError(payload?.message || 'Pagamento ainda não confirmado.');
          setFormVisible(false);
          setAlreadyUsed(false);
          return;
        }

        if (payload?.already_used) {
          setAlreadyUsed(true);
          setFormVisible(false);
          setEmail(payload?.email || '');
          return;
        }

        setEmail(payload?.email || '');
        setFormVisible(true);
      } catch (err) {
        setError(err?.message || 'Não foi possível validar seu pagamento.');
      } finally {
        setLoading(false);
      }
    };

    validate();
  }, [apiBase, sessionId]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!form.name.trim() || !form.whatsapp.trim()) {
      setError('Preencha nome e WhatsApp para continuar.');
      return;
    }

    if (form.password.trim().length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${apiBase}/stripe/checkout/create-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          name: form.name.trim(),
          whatsapp: form.whatsapp.trim(),
          password: form.password,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || 'Não foi possível criar sua conta.');
      }

      const loginEmail = payload?.auto_login_email || payload?.email;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: form.password,
      });

      if (signInError) {
        throw new Error('Conta criada. Faça login manualmente na tela inicial.');
      }

      setSuccessMessage('Conta criada com sucesso. Redirecionando...');
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } catch (err) {
      setError(err?.message || 'Erro ao finalizar ativação do acesso.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payment-activation-page">
      <div className="payment-activation-card">
        <h1>Ativar meu acesso</h1>
        <p className="muted">Finalize seu cadastro para entrar na Gestão Pessoal.</p>

        {loading && <p className="muted">Validando pagamento...</p>}

        {!loading && error && (
          <>
            <p className="danger-text">{error}</p>
            <button type="button" className="btn-primary btn-ui" onClick={goToLogin}>
              Ir para login
            </button>
          </>
        )}

        {!loading && !error && alreadyUsed && (
          <>
            <p className="muted">
              Esse pagamento já foi usado para criar um acesso. Entre com seu login.
            </p>
            <button type="button" className="btn-primary btn-ui" onClick={goToLogin}>
              Ir para login
            </button>
          </>
        )}

        {!loading && !error && formVisible && (
          <form className="payment-activation-form" onSubmit={handleSubmit}>
            <label>Nome completo</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Seu nome completo"
              required
            />

            <label>WhatsApp</label>
            <input
              type="text"
              value={form.whatsapp}
              onChange={(e) => handleChange('whatsapp', e.target.value)}
              placeholder="(63) 99999-9999"
              required
            />

            <label>Email</label>
            <input type="email" value={email} readOnly disabled />

            <label>Senha</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
            />

            <label>Confirmar senha</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              placeholder="Repita sua senha"
              required
            />

            {successMessage && <p className="success-text">{successMessage}</p>}
            {error && <p className="danger-text">{error}</p>}

            <button type="submit" className="btn-primary btn-ui" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar meu acesso'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PaymentActivationScreen;
