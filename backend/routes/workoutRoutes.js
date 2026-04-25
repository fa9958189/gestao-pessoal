import express from "express";
import { transferWorkoutToSupervisedUser } from "../services/workoutService.js";

const router = express.Router();

router.post('/transfer', async (req, res) => {
  try {
    const { workoutId, targetUserId } = req.body;

    console.log('🔥 TRANSFER CHAMADA:', {
      workoutId,
      targetUserId,
      user: req.user,
    });

    const result = await transferWorkoutToSupervisedUser({
      workoutId,
      targetUserId,
      authData: req.user,
    });

    return res.json(result);
  } catch (error) {
    console.error('❌ ERRO TRANSFER:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao transferir treino',
    });
  }
});

export default router;
