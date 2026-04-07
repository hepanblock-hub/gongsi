SELECT slug,state FROM company_pages
WHERE slug IS NOT NULL AND slug<>''
ORDER BY id DESC
LIMIT 10;
