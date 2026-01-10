import express from "express";

const router = express.Router();

router.get("/search", async (req, res) => {
  const query = (req.query.q || "").trim();

  if (!query) {
    return res.json([]);
  }

  try {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.search = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "20",
    });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Falha ao buscar alimentos: ${response.status}`);
    }

    const payload = await response.json();
    const products = Array.isArray(payload?.products) ? payload.products : [];

    const foods = products
      .map((product) => {
        const name =
          product?.product_name || product?.generic_name || "Alimento";
        const calories = Number(product?.nutriments?.["energy-kcal_100g"]);
        const protein = Number(product?.nutriments?.["proteins_100g"]);

        if (!Number.isFinite(calories)) {
          return null;
        }

        return {
          name,
          calories,
          protein: Number.isFinite(protein) ? protein : 0,
          portion: "100 g",
        };
      })
      .filter(Boolean);

    return res.json(foods);
  } catch (error) {
    console.error("Erro ao buscar alimentos:", error);
    return res.status(500).json({
      error: "Não foi possível buscar alimentos no momento.",
    });
  }
});

export default router;
