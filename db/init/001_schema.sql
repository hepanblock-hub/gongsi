-- Isolated schema for gongsihegui site
-- Core extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================
-- Normalization helper
-- =========================
CREATE OR REPLACE FUNCTION normalize_company_name(input_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(
        regexp_replace(
            regexp_replace(
                regexp_replace(lower(coalesce(input_name, '')), '[[:punct:]]', ' ', 'g'),
                '\m(llc|inc|corp|co)\M',
                '',
                'g'
            ),
            '\s+',
            ' ',
            'g'
        )
    );
$$;

-- =========================
-- 1. 公司主表（弱实体）
-- =========================
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT,
    state VARCHAR(50),
    city VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_normalized_name ON companies(normalized_name);
CREATE INDEX IF NOT EXISTS idx_trgm_companies_name ON companies USING gin (name gin_trgm_ops);

-- =========================
-- 2. OSHA 违规记录
-- =========================
CREATE TABLE IF NOT EXISTS osha_inspections (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    normalized_name TEXT,
    inspection_date DATE,
    inspection_type VARCHAR(100),
    violation_type VARCHAR(100),
    severity VARCHAR(50),
    penalty NUMERIC,
    open_case BOOLEAN,
    state VARCHAR(50),
    city VARCHAR(100),
    source_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osha_company_name ON osha_inspections(company_name);
CREATE INDEX IF NOT EXISTS idx_osha_normalized_name ON osha_inspections(normalized_name);

-- =========================
-- 3. Contractor License（执照）
-- =========================
CREATE TABLE IF NOT EXISTS contractor_licenses (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    normalized_name TEXT,
    license_number VARCHAR(100),
    license_type VARCHAR(100),
    status VARCHAR(50),
    issue_date DATE,
    expiry_date DATE,
    state VARCHAR(50),
    source_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_company_name ON contractor_licenses(company_name);
CREATE INDEX IF NOT EXISTS idx_license_normalized_name ON contractor_licenses(normalized_name);

-- =========================
-- 4. 公司注册状态（Secretary of State）
-- =========================
CREATE TABLE IF NOT EXISTS company_registrations (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    normalized_name TEXT,
    registration_number VARCHAR(100),
    status VARCHAR(50),
    incorporation_date DATE,
    state VARCHAR(50),
    registered_agent TEXT,
    source_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_company_name ON company_registrations(company_name);
CREATE INDEX IF NOT EXISTS idx_registration_normalized_name ON company_registrations(normalized_name);

-- =========================
-- 5. 数据源记录（方便合规 & 更新）
-- =========================
CREATE TABLE IF NOT EXISTS data_sources (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(100),
    source_url TEXT,
    last_fetched_at TIMESTAMP,
    notes TEXT
);

-- =========================
-- 6. 页面缓存（SEO用，非常关键）
-- =========================
CREATE TABLE IF NOT EXISTS company_pages (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE,
    company_name TEXT,
    state VARCHAR(50),
    city VARCHAR(100),
    last_generated_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_pages_slug ON company_pages(slug);

-- =========================
-- 7. 可选：风险评分（后期变现）
-- =========================
CREATE TABLE IF NOT EXISTS company_risk_scores (
    id SERIAL PRIMARY KEY,
    company_name TEXT,
    normalized_name TEXT,
    risk_score INT,
    risk_level VARCHAR(50),
    calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_company_name ON company_risk_scores(company_name);

-- Optional backfill examples (safe no-op on empty tables)
UPDATE companies SET normalized_name = normalize_company_name(name)
WHERE normalized_name IS NULL OR normalized_name = '';

UPDATE osha_inspections SET normalized_name = normalize_company_name(company_name)
WHERE normalized_name IS NULL OR normalized_name = '';

UPDATE contractor_licenses SET normalized_name = normalize_company_name(company_name)
WHERE normalized_name IS NULL OR normalized_name = '';

UPDATE company_registrations SET normalized_name = normalize_company_name(company_name)
WHERE normalized_name IS NULL OR normalized_name = '';

UPDATE company_risk_scores SET normalized_name = normalize_company_name(company_name)
WHERE normalized_name IS NULL OR normalized_name = '';
