export function notify(message, variant = 'info') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '9999';
  toast.style.maxWidth = '360px';
  toast.innerHTML = `<div>${message}</div>`;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Fechar';
  closeButton.onclick = () => toast.remove();
  toast.appendChild(closeButton);

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4000);
}
