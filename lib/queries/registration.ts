import { pool } from '../db';
import type { RegistrationRow } from './types';

export async function getRegistrationsByCompany(companyName: string, state: string, limit = 100): Promise<RegistrationRow[]> {
  const { rows } = await pool.query<RegistrationRow>(
    `SELECT registration_number, status, incorporation_date::text, registered_agent, source_url
     FROM company_registrations
     WHERE normalized_name = normalize_company_name($1)
       AND lower(state) = lower($2)
     ORDER BY incorporation_date DESC NULLS LAST
     LIMIT $3`,
    [companyName, state, limit]
  );
  return rows;
}
