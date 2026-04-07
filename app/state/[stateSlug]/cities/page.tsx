import type { Metadata } from 'next';
import Breadcrumbs from '../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../components/common/PageTitle';
import SectionCard from '../../../../components/common/SectionCard';
import { getStateCityCounts } from '../../../../lib/queries';
import { hasReleasedCityControl } from '../../../../lib/release';
import { stateSlugToName } from '../../../../lib/site';

export const dynamic = 'force-dynamic';

function citySlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string }> }): Promise<Metadata> {
  const { stateSlug } = await params;
  const stateName = stateSlugToName(stateSlug);

  return {
    title: { absolute: `${stateName} Cities Overview | OSHA, License & Company Records` },
    description: `Browse cities in ${stateName} with public compliance records. Find OSHA history, contractor license status, and company registration details by city.`,
    alternates: {
      canonical: `/state/${stateSlug}/cities`,
    },
    authors: [{ name: 'Compliance Lookup Editorial Team' }],
    creator: 'Compliance Lookup Data Team',
    publisher: 'Compliance Lookup',
  };
}

export default async function StateCitiesPage({
  params,
}: {
  params: Promise<{ stateSlug: string }>;
}) {
  const { stateSlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const releasedOnly = await hasReleasedCityControl(stateSlug);

  const allCities = await getStateCityCounts(stateSlug);

  return (
    <main className="container">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: stateName, href: `/state/${stateSlug}` },
          { label: 'Cities' },
        ]}
      />

      <PageTitle
        title={`${stateName} cities with company compliance data`}
        description={releasedOnly
          ? 'Released city pages only. New cities are added in controlled batches.'
          : 'All cities with indexed company records for OSHA, contractor licenses, and business registrations.'}
      />

      <SectionCard title={releasedOnly ? 'Released cities' : 'All cities'}>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Indexed companies</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {allCities.map((row) => (
              <tr key={row.city}>
                <td>{row.city}</td>
                <td>{row.company_count}</td>
                <td><a href={`/state/${stateSlug}/city/${citySlug(row.city)}#company-list`}>View companies</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="How to use this city index">
        <p>
          Use this page to jump into city-level screening, then open individual company pages for OSHA, license, and registration evidence.
        </p>
        <p>
          Related pages: <a href={`/state/${stateSlug}`}>{stateName} overview</a> · <a href={`/state/${stateSlug}/filter/quality`}>Quality ranking</a> · <a href={`/state/${stateSlug}/filter/active-licenses`}>Active licenses</a>
        </p>
      </SectionCard>
    </main>
  );
}
