import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar treinos:", error);
      return res.status(500).json({ error: "Erro ao buscar treinos" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro interno:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
