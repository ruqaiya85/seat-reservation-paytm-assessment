import { Router, Request, Response } from 'express';
import { generateToken } from '../middleware/auth';

const router = Router();

// POST /auth/token - generate token for user identity
router.post('/token', (req: Request, res: Response) => {
  const userId = req.body.user_id || req.body.userId || `user_${Math.random().toString(36).substring(2, 9)}`;
  const role = req.body.role || 'user';
  const token = generateToken(userId, role);

  res.json({
    token,
    user_id: userId,
    role,
    expires_in: '7d',
  });
});

export default router;
