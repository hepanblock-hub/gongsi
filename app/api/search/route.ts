import { NextResponse } from 'next/server';
import { searchCompanies } from '../../../lib/queries/company';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (!q) {
    return NextResponse.json({ rows: [], total: 0 });
  }

  const state = (searchParams.get('state') ?? '').trim() || undefined;
  const city = (searchParams.get('city') ?? '').trim() || undefined;
  const hasOsha = searchParams.get('hasOsha') === '1';
  const rawSort = searchParams.get('sort');
  const sort = rawSort === 'updated' || rawSort === 'osha' ? rawSort : 'name';

  const rows = await searchCompanies({
    query: q,
    state,
    city,
    hasOsha,
    sort,
  });

  return NextResponse.json({ rows, total: rows.length });
}
