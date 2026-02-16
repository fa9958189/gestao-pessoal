import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/search", async (req, res) => {
  const query = (req.query.q || "").trim();

  if (!query) {
    return res.json([]);
  }

  try {
    const { data: tacoFoods, error: tacoError } = await supabase
      .from("taco_foods")
      .select("name, kcal, protein_g, fat_g")
      .ilike("name", `%${query}%`)
      .limit(20);

    if (tacoError) {
      throw new Error(`Falha ao buscar tabela taco_foods: ${tacoError.message}`);
    }

    const mappedTacoFoods = Array.isArray(tacoFoods)
      ? tacoFoods
          .map((food) => ({
            name: food?.name || "Alimento",
            calories: Number(food?.kcal) || 0,
            protein: Number(food?.protein_g) || 0,
            fat: Number(food?.fat_g) || 0,
            source: "taco",
            portion: "100 g",
          }))
          .filter((food) => Number.isFinite(food.calories))
      : [];

    if (mappedTacoFoods.length > 0) {
      return res.json(mappedTacoFoods);
    }

    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.search = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "20",
    });

    const externalController = new AbortController();
    const externalTimeoutId = setTimeout(() => {
      externalController.abort();
    }, 1200);

    let response;

    try {
      response = await fetch(url, { signal: externalController.signal });
    } finally {
      clearTimeout(externalTimeoutId);
    }

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
