import { Router, Request, Response, NextFunction } from 'express';
import { createShow, getShow, listShows } from '../services/showService';
import { reserveSeats } from '../services/reservationService';
import { authMiddleware, adminAuthMiddleware } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /shows - list all shows
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shows = await listShows();
    res.json(shows);
  } catch (err) {
    next(err);
  }
});

// POST /shows - create a show (admin)
router.post('/', adminAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, seats, price_paise, per_user_limit } = req.body;
    const show = await createShow({
      name,
      seats,
      price_paise,
      per_user_limit,
    });
    res.status(201).json(show);
  } catch (err) {
    next(err);
  }
});

// GET /shows/:id - get show state & seat reconciliation
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const show = await getShow(req.params.id);
    res.json(show);
  } catch (err) {
    next(err);
  }
});

// POST /shows/:id/reserve - reserve seats (authenticated user)
router.post('/:id/reserve', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const showId = req.params.id;
    // Identity comes STRICTLY from the auth token, not request body
    const userId = req.user!.id;

    // Idempotency key from header or body
    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string) ||
      req.body.idempotency_key;

    if (!idempotencyKey) {
      throw new AppError(
        'Missing idempotency key. Provide Idempotency-Key header or idempotency_key in body.',
        400,
        'MISSING_IDEMPOTENCY_KEY'
      );
    }

    const { seats } = req.body;
    if (!seats) {
      throw new AppError('Missing seats field in request body', 400, 'INVALID_INPUT');
    }

    const result = await reserveSeats({
      show_id: showId,
      user_id: userId,
      seats: Array.isArray(seats) ? seats : [seats],
      idempotency_key: String(idempotencyKey),
    });

    if (result.body.is_replay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }

    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

export default router;
