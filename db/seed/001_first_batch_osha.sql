-- 第一批 OSHA 数据（100-500 条）
-- 执行方式：在容器中 psql -f 本文件

WITH generated AS (
    SELECT
        gs AS n,
        (ARRAY[
            'ABC Construction LLC',
            'Summit Builders Inc',
            'North Star Roofing Co',
            'Eagle Site Services LLC',
            'Blue Ridge Contractors Inc',
            'Pioneer Industrial Co',
            'Golden State Framing LLC',
            'Liberty Mechanical Inc',
            'Metro Civil Group LLC',
            'Iron Peak Construction Co',
            'Harborline Builders Inc',
            'Westfield Paving LLC',
            'Atlas Concrete Co',
            'Sunrise Scaffold LLC',
            'Redwood Utility Services Inc',
            'Canyon Steel Works LLC',
            'Prime Earthmoving Co',
            'Delta Site Solutions Inc',
            'Evergreen Contracting LLC',
            'Coastal General Builders Co'
        ])[(gs % 20) + 1] AS company_name,
        (ARRAY[
            'California','Texas','Florida','New York','Illinois',
            'Washington','Arizona','Georgia','North Carolina','Virginia'
        ])[(gs % 10) + 1] AS state,
        (ARRAY[
            'Los Angeles','Houston','Miami','New York','Chicago',
            'Seattle','Phoenix','Atlanta','Charlotte','Richmond'
        ])[(gs % 10) + 1] AS city,
        (ARRAY[
            'Fall Protection',
            'Scaffolding',
            'Electrical Safety',
            'Ladder Safety',
            'Hazard Communication',
            'Respiratory Protection',
            'Trenching and Excavation',
            'PPE Violation',
            'Machine Guarding',
            'Lockout/Tagout'
        ])[(gs % 10) + 1] AS violation_type
    FROM generate_series(1, 180) AS gs
)
INSERT INTO osha_inspections (
    company_name,
    normalized_name,
    inspection_date,
    inspection_type,
    violation_type,
    severity,
    penalty,
    open_case,
    state,
    city,
    source_url
)
SELECT
    g.company_name,
    normalize_company_name(g.company_name),
    DATE '2023-01-01' + (g.n % 730),
    CASE WHEN g.n % 2 = 0 THEN 'Programmed' ELSE 'Unprogrammed' END,
    g.violation_type,
    CASE
        WHEN g.n % 3 = 0 THEN 'serious'
        WHEN g.n % 5 = 0 THEN 'willful'
        ELSE 'other-than-serious'
    END,
    ((g.n % 25) + 1) * 1000,
    (g.n % 4 = 0),
    g.state,
    g.city,
    'https://www.osha.gov/data'
FROM generated g;

INSERT INTO companies (name, normalized_name, state, city)
SELECT DISTINCT
    company_name,
    normalized_name,
    state,
    city
FROM osha_inspections oi
WHERE NOT EXISTS (
    SELECT 1
    FROM companies c
    WHERE c.normalized_name = oi.normalized_name
      AND c.state = oi.state
);

INSERT INTO company_pages (slug, company_name, state, city, last_generated_at)
SELECT DISTINCT
    '/company/' || replace(normalized_name, ' ', '-') || '-' || replace(lower(state), ' ', '-') AS slug,
    company_name,
    state,
    city,
    NOW()
FROM osha_inspections
WHERE normalized_name IS NOT NULL
LIMIT 500
ON CONFLICT (slug) DO NOTHING;
