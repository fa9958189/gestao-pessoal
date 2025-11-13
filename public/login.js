(function () {
  const form = document.getElementById('login-form');
  const feedback = document.getElementById('login-feedback');

  if (!form) {
    return;
  }

  if (sessionStorage.getItem('gp-auth-token') && sessionStorage.getItem('gp-user')) {
    window.location.href = 'index.html';
    return;
  }

  let API = sessionStorage.getItem('gp-api-base') || 'http://localhost:3333';
  let detectingPromise = null;

  const setFeedback = (message) => {
    if (feedback) feedback.textContent = message || '';
  };

  const detectApiBase = async () => {
    if (detectingPromise) return detectingPromise;
    detectingPromise = (async () => {
      const candidates = [];
      const seen = new Set();
      const stored = sessionStorage.getItem('gp-api-base');
      if (stored) candidates.push(stored);
      const metaTag = document.querySelector('meta[name="api-base"]');
      const meta = metaTag?.content?.trim();
      if (meta) candidates.push(meta);
      const origin = location.origin && location.origin !== 'null' ? location.origin : '';
      if (origin) candidates.push(origin);
      if (location.hostname) {
        const proto = location.protocol.startsWith('http') ? location.protocol : 'http:';
        const hostBase = `${proto}//${location.hostname}`;
        candidates.push(hostBase);
        candidates.push(`${hostBase}:3333`);
      }
      candidates.push('http://localhost:3333', 'http://127.0.0.1:3333');

      for (const cand of candidates) {
        const normalized = cand.replace(/\/+$/, '');
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        try {
          const res = await fetch(`${normalized}/api/health`, { cache: 'no-store' });
          if (res.ok) {
            API = normalized;
            sessionStorage.setItem('gp-api-base', API);
            return API;
          }
        } catch (err) {
          console.warn('Falha ao conectar com a API em', normalized, err);
        }
      }

      return API;
    })();
    return detectingPromise;
  };

  detectApiBase().catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = (formData.get('username') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    if (!username || !password) {
      setFeedback('Informe usuário e senha.');
      return;
    }

    setFeedback('Conectando...');

    try {
      const base = await detectApiBase();
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        let message = 'Usuário ou senha inválidos. Tente novamente.';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {}
        setFeedback(message);
        return;
      }

      const payload = await res.json();
      if (!payload?.token || !payload?.user) {
        setFeedback('Resposta inválida da API.');
        return;
      }

      sessionStorage.setItem('gp-auth-token', payload.token);
      sessionStorage.setItem('gp-user', JSON.stringify(payload.user));
      sessionStorage.setItem('gp-api-base', base);
      setFeedback('');
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Erro ao fazer login', err);
      setFeedback('Não foi possível conectar à API. Verifique se o servidor está em execução.');
    }
  });
})();
