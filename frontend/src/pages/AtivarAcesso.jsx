import { useEffect } from 'react';

const resolveApiBase = () => {
  const candidates = [
    window.APP_CONFIG?.apiBaseUrl,
    import.meta.env.VITE_API_BASE_URL,
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_BACKEND_URL,
    'https://api.gestao-pessoal.com',
  ];

  const base = candidates.find((value) => String(value || '').trim().length > 0) || '';
  return String(base).trim().replace(/\/+$/, '');
};

export default function AtivarAcesso() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      alert('Sessão inválida');
      return;
    }

    const apiBase = resolveApiBase();

    fetch(`${apiBase}/stripe/confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          window.location.href = '/dashboard';
        } else {
          alert('Pagamento não confirmado');
        }
      })
      .catch(() => alert('Erro ao validar pagamento'));
  }, []);

  return <h1>Validando pagamento...</h1>;
}
