import { Router, Request, Response } from 'express';
import { checkDbHealth } from '../db';

const router = Router();

// Liveness probe - process is running
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe - checks dependency (PostgreSQL reachable), fails closed (503) if DB is down
router.get('/ready', async (req: Request, res: Response) => {
  const dbHealthy = await checkDbHealth();

  if (dbHealthy) {
    res.status(200).json({
      status: 'READY',
      dependencies: {
        database: 'HEALTHY',
      },
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'NOT_READY',
      dependencies: {
        database: 'UNREACHABLE',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
