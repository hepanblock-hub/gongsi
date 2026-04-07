SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('company_pages','osha_inspections','contractor_licenses','company_registrations')
ORDER BY table_name, ordinal_position;
