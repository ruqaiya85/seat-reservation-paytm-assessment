import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger, httpLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { initDb, closeDb } from './db';
import { httpRequestDurationSeconds } from './metrics';

import healthRoutes from './routes/health';
import metricsRoutes from './routes/metrics';
import showsRoutes from './routes/shows';
import reservationsRoutes from './routes/reservations';
import authRoutes from './routes/auth';

const app = express();

// Security and utility middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Request latency metric middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      },
      duration
    );
  });
  next();
});

// Structured request logging
app.use(httpLogger);

// API routes
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes);
app.use('/shows', showsRoutes);
app.use('/reservations', reservationsRoutes);
app.use('/auth', authRoutes);

// Serve static frontend assets if built
const candidatePublic1 = path.join(__dirname, 'public');
const candidatePublic2 = path.resolve(__dirname, '../../client/dist');
const candidatePublic3 = path.resolve(__dirname, '../client/dist');
let publicDir = candidatePublic1;
if (fs.existsSync(candidatePublic2)) {
  publicDir = candidatePublic2;
} else if (fs.existsSync(candidatePublic3)) {
  publicDir = candidatePublic3;
}
app.use(express.static(publicDir));

// Fallback to index.html for SPA client-side routes (non-API)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/shows') || req.path.startsWith('/reservations') ||
      req.path.startsWith('/health') || req.path.startsWith('/metrics') ||
      req.path.startsWith('/auth')) {
    return next();
  }
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'API route not found' });
    }
  });
});

// Centralized error handler
app.use(errorHandler);

let server: any = null;

async function startServer() {
  server = app.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, `Seat Reservation Service running on port ${config.port}`);
  });

  try {
    await initDb();
    logger.info('Database initialized and ready');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Database unreachable on startup; readiness probe will fail-closed (503) until connected');
  }
}

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info({ signal }, `Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await closeDb();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export { app, startServer };
