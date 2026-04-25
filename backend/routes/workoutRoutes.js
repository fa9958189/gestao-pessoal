import express from "express";

const router = express.Router();

router.post('/transfer', async (req, res) => {
  console.log('🔥 ROTA TRANSFER CHAMADA');
  return res.status(200).json({ ok: true, message: "Rota de transferência disponível" });
});

export default router;
