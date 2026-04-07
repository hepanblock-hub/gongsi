SELECT trim(city) AS city, COUNT(*)
FROM company_pages
WHERE lower(city) LIKE '%colton%'
GROUP BY 1
ORDER BY 2 DESC;

SELECT trim(city) AS city, COUNT(*)
FROM company_pages
WHERE city ~ '"'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;
