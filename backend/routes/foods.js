import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

/**
 * GET /foods/search?q=texto
 * Busca alimentos na tabela public.taco_foods.
 * Retorna itens no formato:
 * [{ id, name, calories, protein, fat, portion, serving_qty, serving_unit, serving_g, source }]
 */
router.get("/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (!query || query.length < 2) {
    return res.json([]);
  }

  try {
    const { data, error } = await supabase
      .from("taco_foods")
      .select("name, kcal, protein_g, fat_g, serving_qty, serving_unit, serving_g")
      .ilike("name", `%${query}%`)
      .limit(30);

    if (error) {
      console.error("Falha ao buscar taco_foods:", error);
      return res.status(500).json({ error: "Falha ao buscar alimentos" });
    }

    const items = (data || []).map((food, idx) => {
      const servingQty = food.serving_qty ?? null;
      const servingUnit = food.serving_unit ?? null;
      const servingG = food.serving_g ?? null;

      // Porção “bonita” (ex: "1 unidade (55 g)" ou "1 fatia (60 g)" ou fallback "100 g"
      let portion = "100 g";
      if (servingQty && servingUnit) {
        portion = `${servingQty} ${servingUnit}`;
        if (servingG) portion += ` (${servingG} g)`;
      } else if (servingG) {
        portion = `${servingG} g`;
      }

      return {
        id: `taco-${idx}`,
        name: food.name || "Alimento",
        calories: Number(food.kcal) || 0,
        protein: Number(food.protein_g) || 0,
        fat: Number(food.fat_g) || 0,
        portion,
        serving_qty: servingQty,
        serving_unit: servingUnit,
        serving_g: servingG,
        source: "taco",
      };
    });

    return res.json(items);
  } catch (err) {
    console.error("Erro inesperado ao buscar alimentos:", err);
    return res.status(500).json({ error: "Erro inesperado ao buscar alimentos" });
  }
});

export default router;
