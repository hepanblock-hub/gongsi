import type { Metadata } from 'next';
import PageTitle from '../../components/common/PageTitle';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';
import StatusBadge from '../../components/common/StatusBadge';
import BreadcrumbJsonLd from '../../components/seo/BreadcrumbJsonLd';
import { fetchRecentSnapshot } from '../../lib/rootSnapshot';
import { searchCompanies } from '../../lib/queries';
import { companyPathFromSlug, SITE_URL } from '../../lib/site';

export const metadata: Metadata = {
  title: { absolute: 'Search Public Company Records | OSHA, License & Registration' },
  description: 'Search a company to view OSHA inspection history, contractor license status, and business registration records from public government sources.',
  alternates: {
    canonical: '/search',
  },
  robots: { index: true, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; city?: string; hasOsha?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const state = (params.state ?? '').trim();
  const city = (params.city ?? '').trim();
  const hasOsha = params.hasOsha === '1';
  const sort = params.sort === 'updated' || params.sort === 'osha' ? params.sort : 'name';
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const pageSize = 10;

  const recentSnapshot = await fetchRecentSnapshot();

  const rows = q || state || city
    ? recentSnapshot
      ? recentSnapshot.data
        .filter((row) => {
          const matchQ = q
            ? row.company_name.toLowerCase().includes(q.toLowerCase()) || row.slug.toLowerCase().includes(q.toLowerCase())
            : true;
          const matchState = state ? row.state.toLowerCase() === state.toLowerCase() : true;
          const matchCity = city ? (row.city ?? '').toLowerCase() === city.toLowerCase() : true;
          const matchOsha = hasOsha ? row.has_osha : true;
          return matchQ && matchState && matchCity && matchOsha;
        })
        .sort((a, b) => {
          if (sort === 'updated') {
            const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return bTime - aTime;
          }
          if (sort === 'osha') {
            return Number(b.has_osha) - Number(a.has_osha) || a.company_name.localeCompare(b.company_name);
          }
          return a.company_name.localeCompare(b.company_name);
        })
        .map((row) => ({
          ...row,
          osha_count: row.has_osha ? 1 : 0,
          license_status: 'unknown',
          registration_status: 'unknown',
        }))
      : await searchCompanies({
          query: q,
          state: state || undefined,
          city: city || undefined,
          hasOsha,
          sort,
        })
    : [];

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', item: `${SITE_URL}/` },
          { name: 'Search', item: `${SITE_URL}/search` },
        ]}
      />

      <PageTitle
        title="Search Company Records"
        description="Search public compliance records for contractors and companies."
      />
      <p>Use the top search bar to search by company name, state, or city.</p>

      {q || state || city ? (
        <section>
          <h2>Results ({rows.length})</h2>

          {rows.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Try a different spelling, another state, or remove filters."
            />
          ) : (
            <div className="result-list">
              {pagedRows.map((row) => (
                <article key={row.slug} className="card result-card">
                  <h3><a href={companyPathFromSlug(row.slug)}>{row.company_name}</a></h3>
                  <p>{row.state}{row.city ? ` · ${row.city}` : ''}</p>
                  <div className="result-badges">
                    <StatusBadge
                      label={row.osha_count > 0 ? `OSHA: ${row.osha_count}` : 'No OSHA records'}
                      tone={row.osha_count > 0 ? 'warn' : 'good'}
                    />
                    <StatusBadge
                      label={`License: ${row.license_status}`}
                      tone={row.license_status === 'active' ? 'good' : row.license_status === 'suspended' ? 'danger' : 'neutral'}
                    />
                    <StatusBadge
                      label={`Registration: ${row.registration_status}`}
                      tone={row.registration_status === 'active' ? 'good' : row.registration_status === 'dissolved' ? 'danger' : 'neutral'}
                    />
                  </div>
                  <p className="muted">Last updated: {row.updated_at ?? '-'}</p>
                  <p>
                    <a href={companyPathFromSlug(row.slug)}>View profile</a> · <a href={`${companyPathFromSlug(row.slug)}#osha-records`}>OSHA</a> ·{' '}
                    <a href={`${companyPathFromSlug(row.slug)}#license-records`}>License</a> · <a href={`${companyPathFromSlug(row.slug)}#registration-records`}>Registration</a>
                  </p>
                </article>
              ))}
            </div>
          )}

          <Pagination
            basePath="/search"
            page={page}
            pageSize={pageSize}
            total={rows.length}
            query={{
              q,
              state,
              city,
              hasOsha: hasOsha ? '1' : undefined,
              sort,
            }}
          />
        </section>
      ) : (
        <p>Enter a company name to start.</p>
      )}
    </main>
  );
}
