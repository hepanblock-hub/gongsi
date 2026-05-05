import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../components/common/PageTitle';
import SectionCard from '../../../../components/common/SectionCard';
import { getStateCityCounts } from '../../../../lib/queries';
import { hasReleasedCityControl } from '../../../../lib/release';
import { stateSlugToName } from '../../../../lib/site';
import { fetchStateSnapshot } from '../../../../lib/stateSnapshot';

export const dynamic = 'force-dynamic';

function shouldAllowStateDbFallback(): boolean {
  const raw = (process.env.STATE_SNAPSHOT_DB_FALLBACK ?? 'true').toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(raw);
}

function citySlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string }> }): Promise<Metadata> {
  const { stateSlug } = await params;
  const stateName = stateSlugToName(stateSlug);

  return {
    title: { absolute: `Browse ${stateName} Cities | Contractor License & OSHA Records` },
    description: `Find cities in ${stateName} with contractor license status, OSHA records, and company registration coverage. Start city-level compliance lookup by location.`,
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
  const snapshot = await fetchStateSnapshot(stateSlug);
  const allowDbFallback = shouldAllowStateDbFallback();

  if (!snapshot && !allowDbFallback) notFound();

  const allCities = snapshot?.cityCounts ?? await getStateCityCounts(stateSlug);

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

      <SectionCard title="Related pages">
        <p>
          <a href={`/state/${stateSlug}`}>{stateName} overview</a> · <a href={`/state/${stateSlug}/filter/quality`}>Quality ranking</a> · <a href={`/state/${stateSlug}/filter/active-licenses`}>Active licenses</a>
        </p>
      </SectionCard>
    </main>
  );
}
