import { Router, Request, Response, NextFunction } from 'express';
import { cancelReservation } from '../services/reservationService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// POST /reservations/:id/cancel - cancel reservation & release seats (owner only)
router.post('/:id/cancel', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reservationId = req.params.id;
    const requestingUserId = req.user!.id;

    const result = await cancelReservation(reservationId, requestingUserId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
