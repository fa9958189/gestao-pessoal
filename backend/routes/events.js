import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({ error: "Erro ao excluir evento" });
    }

    return res.status(200).json({ message: "Evento excluído com sucesso" });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

export default router;
