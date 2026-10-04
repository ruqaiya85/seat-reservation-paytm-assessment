import { Router, Request, Response } from 'express';
import { metricsRegistry } from '../metrics';

const router = Router();

// GET /metrics - Prometheus metrics scrape endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (err: any) {
    res.status(500).end(err.message);
  }
});

export default router;
