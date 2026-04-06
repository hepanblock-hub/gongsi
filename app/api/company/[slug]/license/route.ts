import { NextResponse } from 'next/server';
import { getCompanyBySlug } from '../../../../../lib/queries/company';
import { getLicensesByCompany } from '../../../../../lib/queries/license';
import { companyPathFromSlug } from '../../../../../lib/site';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);
  const company = await getCompanyBySlug(fullSlug);

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const rows = await getLicensesByCompany(company.company_name, company.state, 200);
  return NextResponse.json({ company, rows });
}
