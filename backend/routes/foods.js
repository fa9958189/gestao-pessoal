import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

async function searchOpenFoodFacts(query) {
  // Timeout mais realista pra VPS (e sem quebrar a rota)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      query
    )}&search_simple=1&action=process&json=1&page_size=10`;

    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return [];
    }

    const json = await response.json();
    const products = Array.isArray(json?.products) ? json.products : [];

    return products
      .map((p) => {
        const name = p.product_name || p.generic_name;
        if (!name) return null;

        // kcal por 100g (quando existir)
        const kcal = Number(p?.nutriments?.["energy-kcal_100g"] ?? 0);
        const protein = Number(p?.nutriments?.proteins_100g ?? 0);
        const fat = Number(p?.nutriments?.fat_100g ?? 0);

        return {
          name,
          calories: kcal,
          protein,
          fat,
          portion: "100 g",
          serving_qty: 1,
          serving_unit: "g",
          serving_g: 100,
        };
      })
      .filter(Boolean);
  } catch (err) {
    // ✅ não derruba o endpoint
    if (err?.name === "AbortError") return [];
    console.error("Erro ao buscar OpenFoodFacts:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /foods/search?q=texto
 * Busca alimentos na tabela public.taco_foods.
 * Retorna itens no formato:
 * [{ id, name, calories, protein, fat, portion, serving_qty, serving_unit, serving_g, source }]
 */
router.get("/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  const qLower = query.toLowerCase();

  try {
    // Se não tiver busca (ou <2 letras), devolve uma lista padrão do banco
    if (!query || query.length < 2) {
      const { data: tacoFoods, error: tacoError } = await supabase
        .from("taco_foods")
        .select("name, kcal, protein_g, fat_g, serving_qty, serving_unit, serving_g")
        .order("name", { ascending: true })
        .limit(30);

      if (tacoError) throw new Error(`Falha ao buscar taco_foods: ${tacoError.message}`);

      const mapped = (tacoFoods || []).map((food, idx) => ({
        id: `taco-${idx}`,
        name: food?.name || "Alimento",
        calories: Number(food?.kcal) || 0,
        protein: Number(food?.protein_g) || 0,
        fat: Number(food?.fat_g) || 0,

        serving_qty: food?.serving_qty ?? 1,
        serving_unit: food?.serving_unit ?? "g",
        serving_g: food?.serving_g ?? 100,
        portion:
          food?.serving_unit && food?.serving_g
            ? `${food.serving_qty ?? 1} ${food.serving_unit} (${food.serving_g} g)`
            : "100 g",
      }));

      return res.json(mapped);
    }

    // Busca normal (2+ letras)
    const { data: tacoFoods, error: tacoError } = await supabase
      .from("taco_foods")
      .select("name, kcal, protein_g, fat_g, serving_qty, serving_unit, serving_g")
      .ilike("name", `%${qLower}%`)
      .limit(30);

    if (tacoError) throw new Error(`Falha ao buscar taco_foods: ${tacoError.message}`);

    const mappedTaco = (tacoFoods || []).map((food, idx) => ({
      id: `taco-${idx}`,
      name: food?.name || "Alimento",
      calories: Number(food?.kcal) || 0,
      protein: Number(food?.protein_g) || 0,
      fat: Number(food?.fat_g) || 0,

      serving_qty: food?.serving_qty ?? 1,
      serving_unit: food?.serving_unit ?? "g",
      serving_g: food?.serving_g ?? 100,
      portion:
        food?.serving_unit && food?.serving_g
          ? `${food.serving_qty ?? 1} ${food.serving_unit} (${food.serving_g} g)`
          : "100 g",
    }));

    return res.json(mappedTaco);
  } catch (err) {
    console.error("Erro ao buscar alimentos:", err);
    return res.status(500).json({ error: "Erro ao buscar alimentos" });
  }
});

export default router;
