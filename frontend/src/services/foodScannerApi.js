export async function scanFood(imageFile, description) {
  if (!imageFile) {
    throw new Error('Arquivo de imagem não fornecido.');
  }

  const formData = new FormData();
  formData.append('image', imageFile);

  const trimmedDescription =
    typeof description === 'string' ? description.trim() : '';

  formData.append('description', trimmedDescription);

  const baseUrl = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const endpoint = `${baseUrl}/scan-food`;

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Falha ao escanear alimento.');
  }

  const data = await response.json();
  return data;
}
