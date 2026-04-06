import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() }, { status: 503 });
  }
}
