import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX ?? 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_URL?.includes('supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}
