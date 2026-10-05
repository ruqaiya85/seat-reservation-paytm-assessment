import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../middleware/logger';

let pool: Pool | null = null;
let isConnected = false;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      idleTimeoutMillis: config.dbPoolIdleTimeoutMillis,
      connectionTimeoutMillis: config.dbConnectionTimeoutMillis,
      // For SSL (e.g. or remote cloud Postgres)
      ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')
        ? { rejectUnauthorized: false }
        : false,
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  try {
    const client = await p.connect();
    isConnected = true;
    logger.info('Connected to PostgreSQL successfully');

    try {
      const candidatePaths = [
        path.join(__dirname, 'schema.sql'),
        path.join(__dirname, '../../src/db/schema.sql'),
        path.join(__dirname, '../src/db/schema.sql'),
        path.resolve(process.cwd(), 'server/src/db/schema.sql'),
        path.resolve(process.cwd(), 'src/db/schema.sql')
      ];
      const schemaPath = candidatePaths.find(p => fs.existsSync(p));
      if (schemaPath) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        logger.info({ path: schemaPath }, 'Database schema verified/created successfully');
      } else {
        logger.warn('schema.sql file not found; skipping automatic schema run');
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to initialize database connection');
    isConnected = false;
    throw err;
  }
}

export async function checkDbHealth(): Promise<boolean> {
  if (!pool) return false;
  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT 1 as healthy');
      return res.rows[0]?.healthy === 1;
    } finally {
      client.release();
    }
  } catch (err) {
    return false;
  }
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    isConnected = false;
    logger.info('PostgreSQL pool closed');
  }
}
