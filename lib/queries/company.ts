import { pool } from '../db';
import type { CompanyPageRow, CompanyTimelineRow, RecentCompanyRow, SearchCompanyRow, SearchOptions } from './types';

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

function normalizeStateInput(value: string): { slug: string; name: string; code: string } {
  const trimmed = value.trim();
  const slug = trimmed.toLowerCase().replace(/\s+/g, '-');
  const name = slug.split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const code = trimmed.length === 2 ? trimmed.toUpperCase() : (STATE_NAME_TO_CODE[name.toLowerCase()] ?? '');
  return { slug, name, code };
}

function sanitizeCity(value: string | null): string | null {
  if (!value) return null;
  const withoutStateSuffix = value
    .trim()
    .replace(/,\s*(ca|california)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutStateSuffix) return null;

  const isAddressLike =
    /^\d+\b/.test(withoutStateSuffix) ||
    /\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\b/i.test(withoutStateSuffix) ||
    withoutStateSuffix.length > 40;

  if (isAddressLike || /^(-\s*select\s*-|select|unknown|n\/?a)$/i.test(withoutStateSuffix)) {
    return null;
  }

  return withoutStateSuffix.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getRecentCompanyPages(limit = 30): Promise<RecentCompanyRow[]> {
  const { rows } = await pool.query<RecentCompanyRow>(
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
          ) AS has_registration
        FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND lower(trim(cp.company_name)) <> '- select -'
     ORDER BY cp.id DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({ ...row, city: sanitizeCity(row.city) }));
}

export async function getCompanyBySlug(slug: string): Promise<CompanyPageRow | null> {
  const { rows } = await pool.query<CompanyPageRow>(
    `SELECT slug, company_name, state, city, updated_at::text
     FROM company_pages
     WHERE slug = $1
       AND company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
     LIMIT 1`,
    [slug]
  );
  const row = rows[0] ?? null;
  return row ? { ...row, city: sanitizeCity(row.city) } : null;
}

export async function searchCompanies(options: SearchOptions): Promise<SearchCompanyRow[]> {
  const { query, state, city, hasOsha = false, sort = 'name' } = options;

  const where: string[] = ['cp.company_name ILIKE $1'];
  const params: Array<string | number> = [`%${query}%`];

  if (state) {
    const normalized = normalizeStateInput(state);
    params.push(normalized.slug, normalized.name, normalized.code);
    const slugIndex = params.length - 2;
    const nameIndex = params.length - 1;
    const codeIndex = params.length;
    where.push(`(
      lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = lower($${slugIndex})
      OR lower(cp.state) = lower($${nameIndex})
      OR lower(cp.state) = lower($${codeIndex})
    )`);
  }

  if (city) {
    params.push(city);
    where.push(`lower(coalesce(cp.city, '')) = lower($${params.length})`);
  }

  if (hasOsha) {
    where.push(`EXISTS (
      SELECT 1 FROM osha_inspections oi
      WHERE oi.normalized_name = normalize_company_name(cp.company_name)
        AND lower(oi.state) = lower(cp.state)
    )`);
  }

  const orderBy =
    sort === 'updated'
      ? 'cp.updated_at DESC NULLS LAST, cp.company_name ASC'
      : sort === 'osha'
        ? 'osha_count DESC, cp.company_name ASC'
        : 'cp.company_name ASC';

  const { rows } = await pool.query<SearchCompanyRow>(
    `SELECT
        cp.slug,
        cp.company_name,
        cp.state,
        cp.city,
        cp.updated_at::text,
        (
          SELECT COUNT(*)::int
          FROM osha_inspections oi
          WHERE oi.normalized_name = normalize_company_name(cp.company_name)
            AND lower(oi.state) = lower(cp.state)
        ) AS osha_count,
        COALESCE((
          SELECT cl.status
          FROM contractor_licenses cl
          WHERE cl.normalized_name = normalize_company_name(cp.company_name)
            AND lower(cl.state) = lower(cp.state)
          ORDER BY cl.issue_date DESC NULLS LAST
          LIMIT 1
        ), 'unknown') AS license_status,
        COALESCE((
          SELECT cr.status
          FROM company_registrations cr
          WHERE cr.normalized_name = normalize_company_name(cp.company_name)
            AND lower(cr.state) = lower(cp.state)
          ORDER BY cr.incorporation_date DESC NULLS LAST
          LIMIT 1
        ), 'unknown') AS registration_status
     FROM company_pages cp
     WHERE cp.company_name ~* '[A-Za-z]'
       AND lower(trim(cp.company_name)) <> '- select -'
       AND ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT 100`,
    params
  );

  return rows.map((row) => ({ ...row, city: sanitizeCity(row.city) }));
}

export async function getCompanyTimeline(companyName: string, state: string, limit = 30): Promise<CompanyTimelineRow[]> {
  const { rows } = await pool.query<CompanyTimelineRow>(
    `SELECT event_date, event_type, detail FROM (
       SELECT
         event_date,
         event_type,
         CASE
           WHEN COUNT(*) > 1 THEN COUNT(*)::text || ' records'
           ELSE COALESCE(
             MAX(detail) FILTER (WHERE detail <> 'Inspection record'),
             'Inspection record'
           )
         END AS detail
       FROM (
        SELECT inspection_date::text AS event_date, 'OSHA inspection'::text AS event_type,
               coalesce(
                 CASE WHEN trim(violation_type) ~ '^[0-9]+$' THEN NULL
                      WHEN trim(violation_type) IN ('NULL', 'n/a', 'NO', '') THEN NULL
                      ELSE violation_type
                 END,
                 'Inspection record'
               ) AS detail
        FROM osha_inspections
        WHERE normalized_name = normalize_company_name($1)
          AND lower(state) = lower($2)
          AND inspection_date IS NOT NULL

        UNION ALL

        SELECT issue_date::text AS event_date, 'License update'::text AS event_type,
               coalesce(status, 'License status update') AS detail
        FROM contractor_licenses
        WHERE normalized_name = normalize_company_name($1)
          AND lower(state) = lower($2)
          AND issue_date IS NOT NULL

        UNION ALL

        SELECT incorporation_date::text AS event_date, 'Registration update'::text AS event_type,
               coalesce(status, 'Registration status update') AS detail
        FROM company_registrations
        WHERE normalized_name = normalize_company_name($1)
          AND lower(state) = lower($2)
          AND incorporation_date IS NOT NULL
       ) merged
       GROUP BY event_date, event_type
     ) timeline
     ORDER BY event_date DESC NULLS LAST, event_type, detail
     LIMIT $3`,
    [companyName, state, limit]
  );

  return rows;
}

export async function getRelatedCompanies(companyName: string, state: string, city?: string | null, limit = 6, currentSlug?: string): Promise<CompanyPageRow[]> {
  const { rows } = await pool.query<CompanyPageRow>(
    `SELECT slug, company_name, state, city, updated_at::text
     FROM company_pages
     WHERE lower(state) = lower($1)
       AND company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
       AND ($5::text IS NULL OR slug <> $5)
       AND (
         $3::text IS NULL
         OR lower(coalesce(city, '')) = lower($3)
         OR company_name ILIKE split_part($2, ' ', 1) || '%'
       )
     ORDER BY updated_at DESC NULLS LAST, company_name ASC
     LIMIT $4`,
    [state, companyName, city ?? null, limit, currentSlug ?? null]
  );

  return rows.map((row) => ({ ...row, city: sanitizeCity(row.city) }));
}

export async function getCompanyDetailedLocation(companyName: string, state: string): Promise<string | null> {
  const { rows } = await pool.query<{ detailed_location: string | null }>(
    `SELECT trim(oi.city) AS detailed_location
     FROM osha_inspections oi
     WHERE oi.normalized_name = normalize_company_name($1)
       AND lower(oi.state) = lower($2)
       AND trim(coalesce(oi.city, '')) <> ''
       AND (
         oi.city ~ '^\\s*\\d+'
         OR oi.city ~* '\\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\\b'
         OR oi.city LIKE '%,%'
       )
     ORDER BY oi.inspection_date DESC NULLS LAST
     LIMIT 1`,
    [companyName, state]
  );

  return rows[0]?.detailed_location?.trim() || null;
}
