export async function scanFood(imageFile) {
  if (!imageFile) {
    throw new Error('Arquivo de imagem não fornecido.');
  }

  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await fetch('http://localhost:3001/scan-food', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Falha ao escanear alimento.');
  }

  const data = await response.json();
  return data;
}
