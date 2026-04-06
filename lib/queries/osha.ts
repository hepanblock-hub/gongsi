import { pool } from '../db';
import type { OshaRow } from './types';

export async function getOshaByCompany(companyName: string, state: string, limit = 100): Promise<OshaRow[]> {
  const { rows } = await pool.query<OshaRow>(
    `WITH cleaned AS (
       SELECT
         inspection_date::text,
         inspection_type,
         CASE
           WHEN violation_type IS NULL THEN NULL
           WHEN trim(violation_type) IN ('', 'NULL', 'n/a', 'NO') THEN NULL
           WHEN trim(violation_type) ~ '^[0-9]+$' THEN NULL
           ELSE trim(violation_type)
         END AS violation_type,
         CASE
           WHEN severity IS NULL THEN NULL
           WHEN trim(severity) IN ('', 'NULL', 'n/a', 'NO') THEN NULL
           WHEN trim(severity) ~ '^[0-9]+$' THEN NULL
           ELSE trim(severity)
         END AS severity,
         penalty::text,
         open_case,
         source_url,
         created_at
       FROM osha_inspections
       WHERE normalized_name = normalize_company_name($1)
         AND lower(state) = lower($2)
         AND inspection_date IS NOT NULL
     ),
     dedup AS (
       SELECT DISTINCT ON (
         inspection_date,
         coalesce(inspection_type, ''),
         coalesce(violation_type, ''),
         coalesce(severity, ''),
         coalesce(penalty, '')
       )
         inspection_date,
         inspection_type,
         violation_type,
         severity,
         penalty,
         open_case,
         source_url,
         created_at
       FROM cleaned
       ORDER BY
         inspection_date DESC,
         coalesce(inspection_type, ''),
         coalesce(violation_type, ''),
         coalesce(severity, ''),
         coalesce(penalty, ''),
         created_at DESC
     )
     SELECT inspection_date::text, inspection_type, violation_type, severity, penalty::text, open_case, source_url
     FROM dedup
     ORDER BY inspection_date DESC NULLS LAST, created_at DESC
     LIMIT $3`,
    [companyName, state, limit]
  );
  return rows;
}
