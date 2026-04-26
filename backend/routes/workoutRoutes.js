import express from "express";
import { transferWorkoutToSupervisedUser } from "../services/workoutService.js";

const router = express.Router();

router.post('/transfer', async (req, res) => {
  try {
    const { workoutId, targetUserId } = req.body || {};

    const result = await transferWorkoutToSupervisedUser({
      workoutId,
      targetUserId,
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Erro inesperado em POST /api/workouts/transfer:", error);
    return res.status(500).json({ error: "Erro interno ao transferir treino." });
  }
});

export default router;
