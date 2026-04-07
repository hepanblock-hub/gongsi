SELECT company_name, COUNT(*) AS cnt
FROM company_pages
WHERE company_name ILIKE '%select%'
GROUP BY 1
ORDER BY cnt DESC, company_name
LIMIT 30;
