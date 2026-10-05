import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });


export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/seat_reservation',
  jwtSecret: process.env.JWT_SECRET || 'paytm-money-secret-key-at-scale-2026',
  defaultPerUserLimit: parseInt(process.env.DEFAULT_PER_USER_LIMIT || '4', 10),
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '30', 10),
  dbPoolIdleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '10000', 10),
  dbConnectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '5000', 10),
};
