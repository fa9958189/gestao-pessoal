import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ANALYSIS_PROMPT = `Analise a imagem e identifique TODOS os alimentos visíveis.
Retorne APENAS um JSON no formato:

{
  "itens": [
    {
      "nome": "carne de porco",
      "quantidade": "150 g",
      "calorias": 320,
      "proteina": 30,
      "agua": 50
    }
  ]
}

Para cada item, estime quantidade, calorias, proteína e água.
Não escreva nada fora do JSON.`;

const mapValueOrDefault = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
};

export async function analyzeFoodImage(buffer) {
  if (!buffer) {
    throw new Error("Buffer da imagem não fornecido para análise.");
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const base64Image = buffer.toString("base64");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na chamada à OpenAI: ${response.status} ${errorText}`);
  }

  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Resposta inválida da OpenAI: conteúdo vazio.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("Não foi possível interpretar o JSON retornado pela OpenAI.");
  }

  return {
    itens: Array.isArray(parsed?.itens)
      ? parsed.itens.map((item) => ({
          nome: item?.nome || "",
          quantidade: item?.quantidade || "",
          calorias: mapValueOrDefault(item?.calorias, 0),
          proteina: mapValueOrDefault(item?.proteina, 0),
          agua: mapValueOrDefault(item?.agua, 0),
        }))
      : [],
  };
}
