async function loadImageBitmap(file) {
  if (!file) return null;

  try {
    return await createImageBitmap(file);
  } catch (error) {
    console.warn('createImageBitmap falhou, usando fallback com <img>', error);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (event) => reject(event?.error || new Error('Falha ao carregar imagem.'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function normalizeImageForScan(file) {
  if (!file) return file;

  const imageBitmap = await loadImageBitmap(file);
  if (!imageBitmap) return file;

  const maxSide = 1280;
  const width = imageBitmap.naturalWidth || imageBitmap.width;
  const height = imageBitmap.naturalHeight || imageBitmap.height;
  const largerSide = Math.max(width, height) || 1;
  const scale = largerSide > maxSide ? maxSide / largerSide : 1;

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return file;
  }

  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) return resolve(result);
        reject(new Error('Falha ao converter imagem para JPEG.'));
      },
      'image/jpeg',
      0.82,
    );
  });

  return new File([blob], 'scan.jpg', { type: 'image/jpeg' });
}

export async function scanFood(imageFile, description) {
  if (!imageFile) {
    throw new Error('Arquivo de imagem não fornecido.');
  }

  const normalized = await normalizeImageForScan(imageFile);

  const formData = new FormData();
  formData.append('image', normalized);

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
    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.warn('Não foi possível ler o erro do backend', error);
    }

    throw new Error(data?.error || data?.details || 'Falha ao escanear alimento.');
  }

  const data = await response.json();
  return data;
}
