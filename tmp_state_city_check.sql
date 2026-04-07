SELECT trim(state) AS state_value, COUNT(*) AS cnt
FROM company_pages
GROUP BY 1
ORDER BY cnt DESC, state_value
LIMIT 30;

SELECT trim(city) AS city_value, COUNT(*) AS cnt
FROM company_pages
GROUP BY 1
ORDER BY cnt DESC, city_value
LIMIT 30;
