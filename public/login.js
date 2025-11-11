(function () {
  const form = document.getElementById('login-form');
  const feedback = document.getElementById('login-feedback');

  if (!form) {
    return;
  }

  const VALID_USERNAME = 'felipeadm';
  const VALID_PASSWORD = '1234';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = (formData.get('username') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    const isValid = username === VALID_USERNAME && password === VALID_PASSWORD;

    if (isValid) {
      feedback.textContent = '';
      sessionStorage.setItem('gp-authenticated', 'true');
      window.location.href = 'index.html';
    } else {
      feedback.textContent = 'Usuário ou senha inválidos. Tente novamente.';
      sessionStorage.removeItem('gp-authenticated');
    }
  });
})();
