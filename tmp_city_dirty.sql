SELECT trim(city) AS city_value, COUNT(*) AS cnt
FROM company_pages
WHERE city IS NOT NULL
  AND (
    city ~ '[0-9]'
    OR city LIKE '%,%'
    OR city ~* '(suite|ste\.|apt|unit|blvd|st\.|street|ave|avenue|road|rd\.|drive|dr\.)'
  )
GROUP BY 1
ORDER BY cnt DESC, city_value
LIMIT 50;
