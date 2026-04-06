import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { pool?: Pool };

function sanitizeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    // Avoid pg-connection-string v2 treating sslmode=require as verify-full,
    // which causes SELF_SIGNED_CERT_IN_CHAIN with Supabase pooler.
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('sslcert');
    parsed.searchParams.delete('sslkey');
    parsed.searchParams.delete('sslrootcert');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? process.env.PGPOOL_MAX ?? 1),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}
