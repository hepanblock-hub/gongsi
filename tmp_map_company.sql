SELECT cp.slug, cp.company_name, cp.city, oi.city AS osha_location
FROM company_pages cp
JOIN osha_inspections oi
  ON oi.normalized_name = normalize_company_name(cp.company_name)
 AND lower(oi.state) = lower(cp.state)
WHERE lower(cp.state) IN ('ca','california')
  AND trim(coalesce(oi.city,'')) <> ''
  AND (
    oi.city ~ '^\s*\d+'
    OR oi.city ~* '\\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\\b'
    OR oi.city LIKE '%,%'
  )
ORDER BY cp.updated_at DESC NULLS LAST
LIMIT 5;
