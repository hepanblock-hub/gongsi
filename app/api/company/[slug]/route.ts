import { NextResponse } from 'next/server';
import { getCompanyBySlug, getCompanyTimeline } from '../../../../lib/queries/company';
import { getLicensesByCompany } from '../../../../lib/queries/license';
import { getOshaByCompany } from '../../../../lib/queries/osha';
import { getRegistrationsByCompany } from '../../../../lib/queries/registration';
import { companyPathFromSlug } from '../../../../lib/site';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);
  const company = await getCompanyBySlug(fullSlug);

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const [osha, licenses, registrations, timeline] = await Promise.all([
    getOshaByCompany(company.company_name, company.state, 100),
    getLicensesByCompany(company.company_name, company.state, 100),
    getRegistrationsByCompany(company.company_name, company.state, 100),
    getCompanyTimeline(company.company_name, company.state, 50),
  ]);

  return NextResponse.json({
    company,
    summary: {
      osha_count: osha.length,
      license_status: licenses[0]?.status ?? 'unknown',
      registration_status: registrations[0]?.status ?? 'unknown',
      last_inspection_date: osha[0]?.inspection_date ?? null,
      last_updated: company.updated_at,
    },
    timeline,
  });
}
