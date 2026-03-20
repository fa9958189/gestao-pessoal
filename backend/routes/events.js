import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({ error: "Erro ao excluir evento" });
    }

    return res.status(200).json({ message: "Evento excluído com sucesso" });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
