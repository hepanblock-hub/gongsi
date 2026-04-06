import { NextResponse } from 'next/server';
import { getStateCompanyPages, getStateSummary } from '../../../../lib/queries/state';

export async function GET(_request: Request, { params }: { params: Promise<{ stateSlug: string }> }) {
  const { stateSlug } = await params;
  const [summary, companies] = await Promise.all([
    getStateSummary(stateSlug),
    getStateCompanyPages(stateSlug, 200),
  ]);

  return NextResponse.json({ summary, companies });
}
