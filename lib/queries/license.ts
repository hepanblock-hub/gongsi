import { pool } from '../db';
import { queryWithSnapshot } from '../snapshotQuery';
import type { LicenseRow } from './types';

export async function getLicensesByCompany(companyName: string, state: string, limit = 100): Promise<LicenseRow[]> {
  return queryWithSnapshot('query_getLicensesByCompany', { companyName, state, limit }, async () => {
    const { rows } = await pool.query<LicenseRow>(
      `SELECT license_number, license_type, status, issue_date::text, expiry_date::text, source_url
     FROM contractor_licenses
     WHERE normalized_name = normalize_company_name($1)
       AND lower(state) = lower($2)
     ORDER BY issue_date DESC NULLS LAST
     LIMIT $3`,
      [companyName, state, limit]
    );
    return rows;
  });
}
