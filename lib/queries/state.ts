import { pool } from '../db';
import { normalizeStateSlug, stateSlugToName } from '../site';
import type { CompanyPageRow } from './types';

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
);

export type StateCompanyCategoryRow = CompanyPageRow & {
  has_osha: boolean;
  has_license: boolean;
  has_registration: boolean;
  osha_count: number;
  injury_count: number;
  latest_inspection_date: string | null;
  license_status: string | null;
};

export type StateCityCountRow = {
  city: string;
  company_count: number;
};

export async function getStateCompanyPages(stateSlug: string, limit = 200): Promise<CompanyPageRow[]> {
  const stateName = stateSlugToName(stateSlug);
  const stateCode = STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? '';
  const { rows } = await pool.query<CompanyPageRow>(
    `SELECT slug, company_name, state, city, updated_at::text
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND (
         lower(regexp_replace(state, '\\s+', '-', 'g')) = $1
        OR lower(state) = lower($2)
        OR lower(state) = lower($3)
       )
     ORDER BY company_name ASC
     LIMIT $4`,
    [normalizeStateSlug(stateSlug), stateName, stateCode, limit]
  );
  return rows;
}

export async function getStateCompanyPagesWithCategory(stateSlug: string, limit = 5000): Promise<StateCompanyCategoryRow[]> {
  const stateName = stateSlugToName(stateSlug);
  const stateCode = STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? '';
  const { rows } = await pool.query<StateCompanyCategoryRow>(
    `SELECT
        cp.slug,
        cp.company_name,
        cp.state,
        cp.city,
        cp.updated_at::text,
        EXISTS (
          SELECT 1 FROM osha_inspections oi
          WHERE oi.normalized_name = normalize_company_name(cp.company_name)
            AND lower(oi.state) = lower(cp.state)
            AND oi.inspection_date IS NOT NULL
        ) AS has_osha,
        EXISTS (
          SELECT 1 FROM contractor_licenses cl
          WHERE cl.normalized_name = normalize_company_name(cp.company_name)
            AND lower(cl.state) = lower(cp.state)
            AND cl.issue_date IS NOT NULL
        ) AS has_license,
        EXISTS (
          SELECT 1 FROM company_registrations cr
          WHERE cr.normalized_name = normalize_company_name(cp.company_name)
            AND lower(cr.state) = lower(cp.state)
            AND cr.incorporation_date IS NOT NULL
        ) AS has_registration,
        (
          SELECT COUNT(*)::int FROM osha_inspections oi
          WHERE oi.normalized_name = normalize_company_name(cp.company_name)
            AND lower(oi.state) = lower(cp.state)
            AND oi.inspection_date IS NOT NULL
        ) AS osha_count,
        (
          SELECT COUNT(*)::int FROM osha_inspections oi
          WHERE oi.normalized_name = normalize_company_name(cp.company_name)
            AND lower(oi.state) = lower(cp.state)
            AND oi.inspection_date IS NOT NULL
            AND (
              oi.severity ~ '^injury_count:[0-9]+$'
              OR oi.severity ~ '^fatality:[0-9]+$'
            )
        ) AS injury_count,
        (
          SELECT MAX(oi.inspection_date)::text FROM osha_inspections oi
          WHERE oi.normalized_name = normalize_company_name(cp.company_name)
            AND lower(oi.state) = lower(cp.state)
            AND oi.inspection_date IS NOT NULL
        ) AS latest_inspection_date,
        (
          SELECT cl.status FROM contractor_licenses cl
          WHERE cl.normalized_name = normalize_company_name(cp.company_name)
            AND lower(cl.state) = lower(cp.state)
          ORDER BY cl.issue_date DESC NULLS LAST
          LIMIT 1
        ) AS license_status
     FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND (
         lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = $1
        OR lower(cp.state) = lower($2)
        OR lower(cp.state) = lower($3)
       )
     ORDER BY cp.company_name ASC
     LIMIT $4`,
    [normalizeStateSlug(stateSlug), stateName, stateCode, limit]
  );

  return rows;
}

export async function getStateSummary(stateSlug: string): Promise<{
  state: string;
  company_count: number;
  osha_count: number;
  license_count: number;
  registration_count: number;
}> {
  const stateName = stateSlugToName(stateSlug);
  const stateCode = STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? '';
  const { rows } = await pool.query<{
    state: string;
    company_count: string;
    osha_count: string;
    license_count: string;
    registration_count: string;
  }>(
    `SELECT
        COALESCE(MAX(cp.state), $2) AS state,
        COUNT(DISTINCT cp.slug) AS company_count,
        (
          SELECT COUNT(*)
          FROM osha_inspections oi
          WHERE lower(regexp_replace(oi.state, '\\s+', '-', 'g')) = $1
             OR lower(oi.state) = lower($2)
             OR lower(oi.state) = lower($3)
        ) AS osha_count,
        (
          SELECT COUNT(*)
          FROM contractor_licenses cl
          WHERE lower(regexp_replace(cl.state, '\\s+', '-', 'g')) = $1
             OR lower(cl.state) = lower($2)
             OR lower(cl.state) = lower($3)
        ) AS license_count,
        (
          SELECT COUNT(*)
          FROM company_registrations cr
          WHERE lower(regexp_replace(cr.state, '\\s+', '-', 'g')) = $1
             OR lower(cr.state) = lower($2)
             OR lower(cr.state) = lower($3)
        ) AS registration_count
     FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND (
         lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = $1
        OR lower(cp.state) = lower($2)
        OR lower(cp.state) = lower($3)
       )`,
    [normalizeStateSlug(stateSlug), stateName, stateCode]
  );

  return {
    state: rows[0]?.state ?? stateName,
    company_count: Number(rows[0]?.company_count ?? 0),
    osha_count: Number(rows[0]?.osha_count ?? 0),
    license_count: Number(rows[0]?.license_count ?? 0),
    registration_count: Number(rows[0]?.registration_count ?? 0),
  };
}

export async function getStateCityCounts(stateSlug: string, limit?: number): Promise<StateCityCountRow[]> {
  const stateName = stateSlugToName(stateSlug);
  const stateCode = STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? '';

  const limitClause = typeof limit === 'number' && limit > 0 ? 'LIMIT $4' : '';
  const params = typeof limit === 'number' && limit > 0
    ? [normalizeStateSlug(stateSlug), stateName, stateCode, limit]
    : [normalizeStateSlug(stateSlug), stateName, stateCode];

  const { rows } = await pool.query<{ city: string; company_count: string }>(
    `SELECT
        CASE
          WHEN trim(coalesce(cp.city, '')) = '' THEN 'Unknown'
          ELSE initcap(lower(trim(cp.city)))
        END AS city,
        COUNT(*) AS company_count
     FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND (
         lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = $1
        OR lower(cp.state) = lower($2)
        OR lower(cp.state) = lower($3)
       )
     GROUP BY 1
     ORDER BY COUNT(*) DESC, city ASC
       ${limitClause}`,
      params
  );

  return rows.map((r) => ({ city: r.city, company_count: Number(r.company_count) }));
}

export async function getIndexedStateSlugs(): Promise<string[]> {
  const { rows } = await pool.query<{ state: string }>(
    `SELECT DISTINCT trim(state) AS state
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND trim(coalesce(state, '')) <> ''`
  );

  const slugs = new Set<string>();
  for (const row of rows) {
    const raw = row.state.trim();
    const upper = raw.toUpperCase();
    const stateName = upper.length === 2
      ? (STATE_CODE_TO_NAME[upper] ?? raw)
      : raw;
    slugs.add(normalizeStateSlug(stateName));
  }

  return Array.from(slugs).sort();
}

export async function getIndexedStates(): Promise<Array<{ slug: string; name: string }>> {
  const slugs = await getIndexedStateSlugs();
  return slugs.map((slug) => ({ slug, name: stateSlugToName(slug) }));
}

export async function getIndexedStateCitiesMap(): Promise<Record<string, string[]>> {
  const { rows } = await pool.query<{ state_slug: string; city: string }>(
    `SELECT
        lower(regexp_replace(trim(cp.state), '\\s+', '-', 'g')) AS state_slug,
        CASE
          WHEN trim(coalesce(cp.city, '')) = '' THEN 'Unknown'
          ELSE initcap(lower(trim(cp.city)))
        END AS city
     FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND trim(coalesce(cp.state, '')) <> ''
     GROUP BY 1, 2
     ORDER BY 1, 2`
  );

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    if (!map[row.state_slug]) {
      map[row.state_slug] = [];
    }
    map[row.state_slug].push(row.city);
  }

  return map;
}
