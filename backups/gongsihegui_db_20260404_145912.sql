--
-- PostgreSQL database dump
--

\restrict zmf5UbLjTbq0t1bz0JdMnwMK5rd4c8rpnz28b5ozOn0IvljgFmCBR8jA0qGB3su

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: normalize_company_name(text); Type: FUNCTION; Schema: public; Owner: gongsi_admin
--

CREATE FUNCTION public.normalize_company_name(input_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
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


ALTER FUNCTION public.normalize_company_name(input_name text) OWNER TO gongsi_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name text NOT NULL,
    normalized_name text,
    state character varying(50),
    city character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.companies OWNER TO gongsi_admin;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO gongsi_admin;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: company_pages; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.company_pages (
    id integer NOT NULL,
    slug text,
    company_name text,
    state character varying(50),
    city character varying(100),
    last_generated_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.company_pages OWNER TO gongsi_admin;

--
-- Name: company_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.company_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.company_pages_id_seq OWNER TO gongsi_admin;

--
-- Name: company_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.company_pages_id_seq OWNED BY public.company_pages.id;


--
-- Name: company_registrations; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.company_registrations (
    id integer NOT NULL,
    company_name text NOT NULL,
    normalized_name text,
    registration_number character varying(100),
    status character varying(50),
    incorporation_date date,
    state character varying(50),
    registered_agent text,
    source_url text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.company_registrations OWNER TO gongsi_admin;

--
-- Name: company_registrations_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.company_registrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.company_registrations_id_seq OWNER TO gongsi_admin;

--
-- Name: company_registrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.company_registrations_id_seq OWNED BY public.company_registrations.id;


--
-- Name: company_risk_scores; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.company_risk_scores (
    id integer NOT NULL,
    company_name text,
    normalized_name text,
    risk_score integer,
    risk_level character varying(50),
    calculated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.company_risk_scores OWNER TO gongsi_admin;

--
-- Name: company_risk_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.company_risk_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.company_risk_scores_id_seq OWNER TO gongsi_admin;

--
-- Name: company_risk_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.company_risk_scores_id_seq OWNED BY public.company_risk_scores.id;


--
-- Name: contractor_licenses; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.contractor_licenses (
    id integer NOT NULL,
    company_name text NOT NULL,
    normalized_name text,
    license_number character varying(100),
    license_type character varying(100),
    status character varying(50),
    issue_date date,
    expiry_date date,
    state character varying(50),
    source_url text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.contractor_licenses OWNER TO gongsi_admin;

--
-- Name: contractor_licenses_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.contractor_licenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contractor_licenses_id_seq OWNER TO gongsi_admin;

--
-- Name: contractor_licenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.contractor_licenses_id_seq OWNED BY public.contractor_licenses.id;


--
-- Name: data_sources; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.data_sources (
    id integer NOT NULL,
    source_name character varying(100),
    source_url text,
    last_fetched_at timestamp without time zone,
    notes text
);


ALTER TABLE public.data_sources OWNER TO gongsi_admin;

--
-- Name: data_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.data_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.data_sources_id_seq OWNER TO gongsi_admin;

--
-- Name: data_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.data_sources_id_seq OWNED BY public.data_sources.id;


--
-- Name: osha_inspections; Type: TABLE; Schema: public; Owner: gongsi_admin
--

CREATE TABLE public.osha_inspections (
    id integer NOT NULL,
    company_name text NOT NULL,
    normalized_name text,
    inspection_date date,
    inspection_type character varying(100),
    violation_type character varying(100),
    severity character varying(50),
    penalty numeric,
    open_case boolean,
    state character varying(50),
    city character varying(100),
    source_url text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.osha_inspections OWNER TO gongsi_admin;

--
-- Name: osha_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: gongsi_admin
--

CREATE SEQUENCE public.osha_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.osha_inspections_id_seq OWNER TO gongsi_admin;

--
-- Name: osha_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gongsi_admin
--

ALTER SEQUENCE public.osha_inspections_id_seq OWNED BY public.osha_inspections.id;


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: company_pages id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_pages ALTER COLUMN id SET DEFAULT nextval('public.company_pages_id_seq'::regclass);


--
-- Name: company_registrations id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_registrations ALTER COLUMN id SET DEFAULT nextval('public.company_registrations_id_seq'::regclass);


--
-- Name: company_risk_scores id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_risk_scores ALTER COLUMN id SET DEFAULT nextval('public.company_risk_scores_id_seq'::regclass);


--
-- Name: contractor_licenses id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.contractor_licenses ALTER COLUMN id SET DEFAULT nextval('public.contractor_licenses_id_seq'::regclass);


--
-- Name: data_sources id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.data_sources ALTER COLUMN id SET DEFAULT nextval('public.data_sources_id_seq'::regclass);


--
-- Name: osha_inspections id; Type: DEFAULT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.osha_inspections ALTER COLUMN id SET DEFAULT nextval('public.osha_inspections_id_seq'::regclass);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.companies (id, name, normalized_name, state, city, created_at) FROM stdin;
1	ABC Construction LLC	abc construction	California	Los Angeles	2026-04-03 09:51:20.959936
2	Atlas Concrete Co	atlas concrete	Florida	Miami	2026-04-03 09:51:20.959936
3	Blue Ridge Contractors Inc	blue ridge contractors	Illinois	Chicago	2026-04-03 09:51:20.959936
4	Canyon Steel Works LLC	canyon steel works	Washington	Seattle	2026-04-03 09:51:20.959936
5	Coastal General Builders Co	coastal general builders	Virginia	Richmond	2026-04-03 09:51:20.959936
6	Delta Site Solutions Inc	delta site solutions	Georgia	Atlanta	2026-04-03 09:51:20.959936
7	Eagle Site Services LLC	eagle site services	New York	New York	2026-04-03 09:51:20.959936
8	Evergreen Contracting LLC	evergreen contracting	North Carolina	Charlotte	2026-04-03 09:51:20.959936
9	Golden State Framing LLC	golden state framing	Arizona	Phoenix	2026-04-03 09:51:20.959936
10	Harborline Builders Inc	harborline builders	California	Los Angeles	2026-04-03 09:51:20.959936
11	Iron Peak Construction Co	iron peak construction	Virginia	Richmond	2026-04-03 09:51:20.959936
12	Liberty Mechanical Inc	liberty mechanical	Georgia	Atlanta	2026-04-03 09:51:20.959936
13	Metro Civil Group LLC	metro civil group	North Carolina	Charlotte	2026-04-03 09:51:20.959936
14	North Star Roofing Co	north star roofing	Florida	Miami	2026-04-03 09:51:20.959936
15	Pioneer Industrial Co	pioneer industrial	Washington	Seattle	2026-04-03 09:51:20.959936
16	Prime Earthmoving Co	prime earthmoving	Arizona	Phoenix	2026-04-03 09:51:20.959936
17	Redwood Utility Services Inc	redwood utility services	Illinois	Chicago	2026-04-03 09:51:20.959936
18	Summit Builders Inc	summit builders	Texas	Houston	2026-04-03 09:51:20.959936
19	Sunrise Scaffold LLC	sunrise scaffold	New York	New York	2026-04-03 09:51:20.959936
20	Westfield Paving LLC	westfield paving	Texas	Houston	2026-04-03 09:51:20.959936
\.


--
-- Data for Name: company_pages; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.company_pages (id, slug, company_name, state, city, last_generated_at, updated_at) FROM stdin;
1	/company/liberty-mechanical-georgia	Liberty Mechanical Inc	Georgia	Atlanta	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
2	/company/harborline-builders-california	Harborline Builders Inc	California	Los Angeles	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
3	/company/pioneer-industrial-washington	Pioneer Industrial Co	Washington	Seattle	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
4	/company/evergreen-contracting-north-carolina	Evergreen Contracting LLC	North Carolina	Charlotte	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
5	/company/delta-site-solutions-georgia	Delta Site Solutions Inc	Georgia	Atlanta	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
6	/company/westfield-paving-texas	Westfield Paving LLC	Texas	Houston	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
7	/company/sunrise-scaffold-new-york	Sunrise Scaffold LLC	New York	New York	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
8	/company/atlas-concrete-florida	Atlas Concrete Co	Florida	Miami	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
9	/company/blue-ridge-contractors-illinois	Blue Ridge Contractors Inc	Illinois	Chicago	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
10	/company/golden-state-framing-arizona	Golden State Framing LLC	Arizona	Phoenix	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
11	/company/north-star-roofing-florida	North Star Roofing Co	Florida	Miami	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
12	/company/canyon-steel-works-washington	Canyon Steel Works LLC	Washington	Seattle	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
13	/company/redwood-utility-services-illinois	Redwood Utility Services Inc	Illinois	Chicago	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
14	/company/eagle-site-services-new-york	Eagle Site Services LLC	New York	New York	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
15	/company/abc-construction-california	ABC Construction LLC	California	Los Angeles	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
16	/company/summit-builders-texas	Summit Builders Inc	Texas	Houston	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
17	/company/prime-earthmoving-arizona	Prime Earthmoving Co	Arizona	Phoenix	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
18	/company/metro-civil-group-north-carolina	Metro Civil Group LLC	North Carolina	Charlotte	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
19	/company/coastal-general-builders-virginia	Coastal General Builders Co	Virginia	Richmond	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
20	/company/iron-peak-construction-virginia	Iron Peak Construction Co	Virginia	Richmond	2026-04-03 09:51:20.962879	2026-04-03 09:51:20.962879
\.


--
-- Data for Name: company_registrations; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.company_registrations (id, company_name, normalized_name, registration_number, status, incorporation_date, state, registered_agent, source_url, created_at) FROM stdin;
\.


--
-- Data for Name: company_risk_scores; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.company_risk_scores (id, company_name, normalized_name, risk_score, risk_level, calculated_at) FROM stdin;
\.


--
-- Data for Name: contractor_licenses; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.contractor_licenses (id, company_name, normalized_name, license_number, license_type, status, issue_date, expiry_date, state, source_url, created_at) FROM stdin;
\.


--
-- Data for Name: data_sources; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.data_sources (id, source_name, source_url, last_fetched_at, notes) FROM stdin;
\.


--
-- Data for Name: osha_inspections; Type: TABLE DATA; Schema: public; Owner: gongsi_admin
--

COPY public.osha_inspections (id, company_name, normalized_name, inspection_date, inspection_type, violation_type, severity, penalty, open_case, state, city, source_url, created_at) FROM stdin;
1	Summit Builders Inc	summit builders	2023-01-02	Unprogrammed	Scaffolding	other-than-serious	2000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
2	North Star Roofing Co	north star roofing	2023-01-03	Programmed	Electrical Safety	other-than-serious	3000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
3	Eagle Site Services LLC	eagle site services	2023-01-04	Unprogrammed	Ladder Safety	serious	4000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
4	Blue Ridge Contractors Inc	blue ridge contractors	2023-01-05	Programmed	Hazard Communication	other-than-serious	5000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
5	Pioneer Industrial Co	pioneer industrial	2023-01-06	Unprogrammed	Respiratory Protection	willful	6000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
6	Golden State Framing LLC	golden state framing	2023-01-07	Programmed	Trenching and Excavation	serious	7000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
7	Liberty Mechanical Inc	liberty mechanical	2023-01-08	Unprogrammed	PPE Violation	other-than-serious	8000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
8	Metro Civil Group LLC	metro civil group	2023-01-09	Programmed	Machine Guarding	other-than-serious	9000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
9	Iron Peak Construction Co	iron peak construction	2023-01-10	Unprogrammed	Lockout/Tagout	serious	10000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
10	Harborline Builders Inc	harborline builders	2023-01-11	Programmed	Fall Protection	willful	11000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
11	Westfield Paving LLC	westfield paving	2023-01-12	Unprogrammed	Scaffolding	other-than-serious	12000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
12	Atlas Concrete Co	atlas concrete	2023-01-13	Programmed	Electrical Safety	serious	13000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
13	Sunrise Scaffold LLC	sunrise scaffold	2023-01-14	Unprogrammed	Ladder Safety	other-than-serious	14000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
14	Redwood Utility Services Inc	redwood utility services	2023-01-15	Programmed	Hazard Communication	other-than-serious	15000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
15	Canyon Steel Works LLC	canyon steel works	2023-01-16	Unprogrammed	Respiratory Protection	serious	16000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
16	Prime Earthmoving Co	prime earthmoving	2023-01-17	Programmed	Trenching and Excavation	other-than-serious	17000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
17	Delta Site Solutions Inc	delta site solutions	2023-01-18	Unprogrammed	PPE Violation	other-than-serious	18000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
18	Evergreen Contracting LLC	evergreen contracting	2023-01-19	Programmed	Machine Guarding	serious	19000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
19	Coastal General Builders Co	coastal general builders	2023-01-20	Unprogrammed	Lockout/Tagout	other-than-serious	20000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
20	ABC Construction LLC	abc construction	2023-01-21	Programmed	Fall Protection	willful	21000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
21	Summit Builders Inc	summit builders	2023-01-22	Unprogrammed	Scaffolding	serious	22000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
22	North Star Roofing Co	north star roofing	2023-01-23	Programmed	Electrical Safety	other-than-serious	23000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
23	Eagle Site Services LLC	eagle site services	2023-01-24	Unprogrammed	Ladder Safety	other-than-serious	24000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
24	Blue Ridge Contractors Inc	blue ridge contractors	2023-01-25	Programmed	Hazard Communication	serious	25000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
25	Pioneer Industrial Co	pioneer industrial	2023-01-26	Unprogrammed	Respiratory Protection	willful	1000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
26	Golden State Framing LLC	golden state framing	2023-01-27	Programmed	Trenching and Excavation	other-than-serious	2000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
27	Liberty Mechanical Inc	liberty mechanical	2023-01-28	Unprogrammed	PPE Violation	serious	3000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
28	Metro Civil Group LLC	metro civil group	2023-01-29	Programmed	Machine Guarding	other-than-serious	4000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
29	Iron Peak Construction Co	iron peak construction	2023-01-30	Unprogrammed	Lockout/Tagout	other-than-serious	5000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
30	Harborline Builders Inc	harborline builders	2023-01-31	Programmed	Fall Protection	serious	6000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
31	Westfield Paving LLC	westfield paving	2023-02-01	Unprogrammed	Scaffolding	other-than-serious	7000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
32	Atlas Concrete Co	atlas concrete	2023-02-02	Programmed	Electrical Safety	other-than-serious	8000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
33	Sunrise Scaffold LLC	sunrise scaffold	2023-02-03	Unprogrammed	Ladder Safety	serious	9000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
34	Redwood Utility Services Inc	redwood utility services	2023-02-04	Programmed	Hazard Communication	other-than-serious	10000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
35	Canyon Steel Works LLC	canyon steel works	2023-02-05	Unprogrammed	Respiratory Protection	willful	11000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
36	Prime Earthmoving Co	prime earthmoving	2023-02-06	Programmed	Trenching and Excavation	serious	12000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
37	Delta Site Solutions Inc	delta site solutions	2023-02-07	Unprogrammed	PPE Violation	other-than-serious	13000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
38	Evergreen Contracting LLC	evergreen contracting	2023-02-08	Programmed	Machine Guarding	other-than-serious	14000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
39	Coastal General Builders Co	coastal general builders	2023-02-09	Unprogrammed	Lockout/Tagout	serious	15000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
40	ABC Construction LLC	abc construction	2023-02-10	Programmed	Fall Protection	willful	16000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
41	Summit Builders Inc	summit builders	2023-02-11	Unprogrammed	Scaffolding	other-than-serious	17000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
42	North Star Roofing Co	north star roofing	2023-02-12	Programmed	Electrical Safety	serious	18000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
43	Eagle Site Services LLC	eagle site services	2023-02-13	Unprogrammed	Ladder Safety	other-than-serious	19000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
44	Blue Ridge Contractors Inc	blue ridge contractors	2023-02-14	Programmed	Hazard Communication	other-than-serious	20000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
45	Pioneer Industrial Co	pioneer industrial	2023-02-15	Unprogrammed	Respiratory Protection	serious	21000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
46	Golden State Framing LLC	golden state framing	2023-02-16	Programmed	Trenching and Excavation	other-than-serious	22000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
47	Liberty Mechanical Inc	liberty mechanical	2023-02-17	Unprogrammed	PPE Violation	other-than-serious	23000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
48	Metro Civil Group LLC	metro civil group	2023-02-18	Programmed	Machine Guarding	serious	24000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
49	Iron Peak Construction Co	iron peak construction	2023-02-19	Unprogrammed	Lockout/Tagout	other-than-serious	25000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
50	Harborline Builders Inc	harborline builders	2023-02-20	Programmed	Fall Protection	willful	1000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
51	Westfield Paving LLC	westfield paving	2023-02-21	Unprogrammed	Scaffolding	serious	2000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
52	Atlas Concrete Co	atlas concrete	2023-02-22	Programmed	Electrical Safety	other-than-serious	3000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
53	Sunrise Scaffold LLC	sunrise scaffold	2023-02-23	Unprogrammed	Ladder Safety	other-than-serious	4000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
54	Redwood Utility Services Inc	redwood utility services	2023-02-24	Programmed	Hazard Communication	serious	5000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
55	Canyon Steel Works LLC	canyon steel works	2023-02-25	Unprogrammed	Respiratory Protection	willful	6000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
56	Prime Earthmoving Co	prime earthmoving	2023-02-26	Programmed	Trenching and Excavation	other-than-serious	7000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
57	Delta Site Solutions Inc	delta site solutions	2023-02-27	Unprogrammed	PPE Violation	serious	8000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
58	Evergreen Contracting LLC	evergreen contracting	2023-02-28	Programmed	Machine Guarding	other-than-serious	9000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
59	Coastal General Builders Co	coastal general builders	2023-03-01	Unprogrammed	Lockout/Tagout	other-than-serious	10000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
60	ABC Construction LLC	abc construction	2023-03-02	Programmed	Fall Protection	serious	11000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
61	Summit Builders Inc	summit builders	2023-03-03	Unprogrammed	Scaffolding	other-than-serious	12000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
62	North Star Roofing Co	north star roofing	2023-03-04	Programmed	Electrical Safety	other-than-serious	13000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
63	Eagle Site Services LLC	eagle site services	2023-03-05	Unprogrammed	Ladder Safety	serious	14000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
64	Blue Ridge Contractors Inc	blue ridge contractors	2023-03-06	Programmed	Hazard Communication	other-than-serious	15000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
65	Pioneer Industrial Co	pioneer industrial	2023-03-07	Unprogrammed	Respiratory Protection	willful	16000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
66	Golden State Framing LLC	golden state framing	2023-03-08	Programmed	Trenching and Excavation	serious	17000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
67	Liberty Mechanical Inc	liberty mechanical	2023-03-09	Unprogrammed	PPE Violation	other-than-serious	18000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
68	Metro Civil Group LLC	metro civil group	2023-03-10	Programmed	Machine Guarding	other-than-serious	19000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
69	Iron Peak Construction Co	iron peak construction	2023-03-11	Unprogrammed	Lockout/Tagout	serious	20000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
70	Harborline Builders Inc	harborline builders	2023-03-12	Programmed	Fall Protection	willful	21000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
71	Westfield Paving LLC	westfield paving	2023-03-13	Unprogrammed	Scaffolding	other-than-serious	22000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
72	Atlas Concrete Co	atlas concrete	2023-03-14	Programmed	Electrical Safety	serious	23000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
73	Sunrise Scaffold LLC	sunrise scaffold	2023-03-15	Unprogrammed	Ladder Safety	other-than-serious	24000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
74	Redwood Utility Services Inc	redwood utility services	2023-03-16	Programmed	Hazard Communication	other-than-serious	25000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
75	Canyon Steel Works LLC	canyon steel works	2023-03-17	Unprogrammed	Respiratory Protection	serious	1000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
76	Prime Earthmoving Co	prime earthmoving	2023-03-18	Programmed	Trenching and Excavation	other-than-serious	2000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
77	Delta Site Solutions Inc	delta site solutions	2023-03-19	Unprogrammed	PPE Violation	other-than-serious	3000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
78	Evergreen Contracting LLC	evergreen contracting	2023-03-20	Programmed	Machine Guarding	serious	4000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
79	Coastal General Builders Co	coastal general builders	2023-03-21	Unprogrammed	Lockout/Tagout	other-than-serious	5000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
80	ABC Construction LLC	abc construction	2023-03-22	Programmed	Fall Protection	willful	6000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
81	Summit Builders Inc	summit builders	2023-03-23	Unprogrammed	Scaffolding	serious	7000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
82	North Star Roofing Co	north star roofing	2023-03-24	Programmed	Electrical Safety	other-than-serious	8000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
83	Eagle Site Services LLC	eagle site services	2023-03-25	Unprogrammed	Ladder Safety	other-than-serious	9000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
84	Blue Ridge Contractors Inc	blue ridge contractors	2023-03-26	Programmed	Hazard Communication	serious	10000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
85	Pioneer Industrial Co	pioneer industrial	2023-03-27	Unprogrammed	Respiratory Protection	willful	11000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
86	Golden State Framing LLC	golden state framing	2023-03-28	Programmed	Trenching and Excavation	other-than-serious	12000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
87	Liberty Mechanical Inc	liberty mechanical	2023-03-29	Unprogrammed	PPE Violation	serious	13000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
88	Metro Civil Group LLC	metro civil group	2023-03-30	Programmed	Machine Guarding	other-than-serious	14000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
89	Iron Peak Construction Co	iron peak construction	2023-03-31	Unprogrammed	Lockout/Tagout	other-than-serious	15000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
90	Harborline Builders Inc	harborline builders	2023-04-01	Programmed	Fall Protection	serious	16000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
91	Westfield Paving LLC	westfield paving	2023-04-02	Unprogrammed	Scaffolding	other-than-serious	17000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
92	Atlas Concrete Co	atlas concrete	2023-04-03	Programmed	Electrical Safety	other-than-serious	18000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
93	Sunrise Scaffold LLC	sunrise scaffold	2023-04-04	Unprogrammed	Ladder Safety	serious	19000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
94	Redwood Utility Services Inc	redwood utility services	2023-04-05	Programmed	Hazard Communication	other-than-serious	20000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
95	Canyon Steel Works LLC	canyon steel works	2023-04-06	Unprogrammed	Respiratory Protection	willful	21000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
96	Prime Earthmoving Co	prime earthmoving	2023-04-07	Programmed	Trenching and Excavation	serious	22000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
97	Delta Site Solutions Inc	delta site solutions	2023-04-08	Unprogrammed	PPE Violation	other-than-serious	23000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
98	Evergreen Contracting LLC	evergreen contracting	2023-04-09	Programmed	Machine Guarding	other-than-serious	24000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
99	Coastal General Builders Co	coastal general builders	2023-04-10	Unprogrammed	Lockout/Tagout	serious	25000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
100	ABC Construction LLC	abc construction	2023-04-11	Programmed	Fall Protection	willful	1000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
101	Summit Builders Inc	summit builders	2023-04-12	Unprogrammed	Scaffolding	other-than-serious	2000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
102	North Star Roofing Co	north star roofing	2023-04-13	Programmed	Electrical Safety	serious	3000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
103	Eagle Site Services LLC	eagle site services	2023-04-14	Unprogrammed	Ladder Safety	other-than-serious	4000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
104	Blue Ridge Contractors Inc	blue ridge contractors	2023-04-15	Programmed	Hazard Communication	other-than-serious	5000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
105	Pioneer Industrial Co	pioneer industrial	2023-04-16	Unprogrammed	Respiratory Protection	serious	6000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
106	Golden State Framing LLC	golden state framing	2023-04-17	Programmed	Trenching and Excavation	other-than-serious	7000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
107	Liberty Mechanical Inc	liberty mechanical	2023-04-18	Unprogrammed	PPE Violation	other-than-serious	8000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
108	Metro Civil Group LLC	metro civil group	2023-04-19	Programmed	Machine Guarding	serious	9000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
109	Iron Peak Construction Co	iron peak construction	2023-04-20	Unprogrammed	Lockout/Tagout	other-than-serious	10000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
110	Harborline Builders Inc	harborline builders	2023-04-21	Programmed	Fall Protection	willful	11000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
111	Westfield Paving LLC	westfield paving	2023-04-22	Unprogrammed	Scaffolding	serious	12000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
112	Atlas Concrete Co	atlas concrete	2023-04-23	Programmed	Electrical Safety	other-than-serious	13000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
113	Sunrise Scaffold LLC	sunrise scaffold	2023-04-24	Unprogrammed	Ladder Safety	other-than-serious	14000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
114	Redwood Utility Services Inc	redwood utility services	2023-04-25	Programmed	Hazard Communication	serious	15000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
115	Canyon Steel Works LLC	canyon steel works	2023-04-26	Unprogrammed	Respiratory Protection	willful	16000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
116	Prime Earthmoving Co	prime earthmoving	2023-04-27	Programmed	Trenching and Excavation	other-than-serious	17000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
117	Delta Site Solutions Inc	delta site solutions	2023-04-28	Unprogrammed	PPE Violation	serious	18000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
118	Evergreen Contracting LLC	evergreen contracting	2023-04-29	Programmed	Machine Guarding	other-than-serious	19000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
119	Coastal General Builders Co	coastal general builders	2023-04-30	Unprogrammed	Lockout/Tagout	other-than-serious	20000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
120	ABC Construction LLC	abc construction	2023-05-01	Programmed	Fall Protection	serious	21000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
121	Summit Builders Inc	summit builders	2023-05-02	Unprogrammed	Scaffolding	other-than-serious	22000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
122	North Star Roofing Co	north star roofing	2023-05-03	Programmed	Electrical Safety	other-than-serious	23000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
123	Eagle Site Services LLC	eagle site services	2023-05-04	Unprogrammed	Ladder Safety	serious	24000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
124	Blue Ridge Contractors Inc	blue ridge contractors	2023-05-05	Programmed	Hazard Communication	other-than-serious	25000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
125	Pioneer Industrial Co	pioneer industrial	2023-05-06	Unprogrammed	Respiratory Protection	willful	1000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
126	Golden State Framing LLC	golden state framing	2023-05-07	Programmed	Trenching and Excavation	serious	2000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
127	Liberty Mechanical Inc	liberty mechanical	2023-05-08	Unprogrammed	PPE Violation	other-than-serious	3000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
128	Metro Civil Group LLC	metro civil group	2023-05-09	Programmed	Machine Guarding	other-than-serious	4000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
129	Iron Peak Construction Co	iron peak construction	2023-05-10	Unprogrammed	Lockout/Tagout	serious	5000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
130	Harborline Builders Inc	harborline builders	2023-05-11	Programmed	Fall Protection	willful	6000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
131	Westfield Paving LLC	westfield paving	2023-05-12	Unprogrammed	Scaffolding	other-than-serious	7000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
132	Atlas Concrete Co	atlas concrete	2023-05-13	Programmed	Electrical Safety	serious	8000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
133	Sunrise Scaffold LLC	sunrise scaffold	2023-05-14	Unprogrammed	Ladder Safety	other-than-serious	9000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
134	Redwood Utility Services Inc	redwood utility services	2023-05-15	Programmed	Hazard Communication	other-than-serious	10000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
135	Canyon Steel Works LLC	canyon steel works	2023-05-16	Unprogrammed	Respiratory Protection	serious	11000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
136	Prime Earthmoving Co	prime earthmoving	2023-05-17	Programmed	Trenching and Excavation	other-than-serious	12000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
137	Delta Site Solutions Inc	delta site solutions	2023-05-18	Unprogrammed	PPE Violation	other-than-serious	13000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
138	Evergreen Contracting LLC	evergreen contracting	2023-05-19	Programmed	Machine Guarding	serious	14000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
139	Coastal General Builders Co	coastal general builders	2023-05-20	Unprogrammed	Lockout/Tagout	other-than-serious	15000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
140	ABC Construction LLC	abc construction	2023-05-21	Programmed	Fall Protection	willful	16000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
141	Summit Builders Inc	summit builders	2023-05-22	Unprogrammed	Scaffolding	serious	17000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
142	North Star Roofing Co	north star roofing	2023-05-23	Programmed	Electrical Safety	other-than-serious	18000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
143	Eagle Site Services LLC	eagle site services	2023-05-24	Unprogrammed	Ladder Safety	other-than-serious	19000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
144	Blue Ridge Contractors Inc	blue ridge contractors	2023-05-25	Programmed	Hazard Communication	serious	20000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
145	Pioneer Industrial Co	pioneer industrial	2023-05-26	Unprogrammed	Respiratory Protection	willful	21000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
146	Golden State Framing LLC	golden state framing	2023-05-27	Programmed	Trenching and Excavation	other-than-serious	22000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
147	Liberty Mechanical Inc	liberty mechanical	2023-05-28	Unprogrammed	PPE Violation	serious	23000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
148	Metro Civil Group LLC	metro civil group	2023-05-29	Programmed	Machine Guarding	other-than-serious	24000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
149	Iron Peak Construction Co	iron peak construction	2023-05-30	Unprogrammed	Lockout/Tagout	other-than-serious	25000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
150	Harborline Builders Inc	harborline builders	2023-05-31	Programmed	Fall Protection	serious	1000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
151	Westfield Paving LLC	westfield paving	2023-06-01	Unprogrammed	Scaffolding	other-than-serious	2000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
152	Atlas Concrete Co	atlas concrete	2023-06-02	Programmed	Electrical Safety	other-than-serious	3000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
153	Sunrise Scaffold LLC	sunrise scaffold	2023-06-03	Unprogrammed	Ladder Safety	serious	4000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
154	Redwood Utility Services Inc	redwood utility services	2023-06-04	Programmed	Hazard Communication	other-than-serious	5000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
155	Canyon Steel Works LLC	canyon steel works	2023-06-05	Unprogrammed	Respiratory Protection	willful	6000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
156	Prime Earthmoving Co	prime earthmoving	2023-06-06	Programmed	Trenching and Excavation	serious	7000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
157	Delta Site Solutions Inc	delta site solutions	2023-06-07	Unprogrammed	PPE Violation	other-than-serious	8000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
158	Evergreen Contracting LLC	evergreen contracting	2023-06-08	Programmed	Machine Guarding	other-than-serious	9000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
159	Coastal General Builders Co	coastal general builders	2023-06-09	Unprogrammed	Lockout/Tagout	serious	10000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
160	ABC Construction LLC	abc construction	2023-06-10	Programmed	Fall Protection	willful	11000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
161	Summit Builders Inc	summit builders	2023-06-11	Unprogrammed	Scaffolding	other-than-serious	12000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
162	North Star Roofing Co	north star roofing	2023-06-12	Programmed	Electrical Safety	serious	13000	f	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
163	Eagle Site Services LLC	eagle site services	2023-06-13	Unprogrammed	Ladder Safety	other-than-serious	14000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
164	Blue Ridge Contractors Inc	blue ridge contractors	2023-06-14	Programmed	Hazard Communication	other-than-serious	15000	t	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
165	Pioneer Industrial Co	pioneer industrial	2023-06-15	Unprogrammed	Respiratory Protection	serious	16000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
166	Golden State Framing LLC	golden state framing	2023-06-16	Programmed	Trenching and Excavation	other-than-serious	17000	f	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
167	Liberty Mechanical Inc	liberty mechanical	2023-06-17	Unprogrammed	PPE Violation	other-than-serious	18000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
168	Metro Civil Group LLC	metro civil group	2023-06-18	Programmed	Machine Guarding	serious	19000	t	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
169	Iron Peak Construction Co	iron peak construction	2023-06-19	Unprogrammed	Lockout/Tagout	other-than-serious	20000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
170	Harborline Builders Inc	harborline builders	2023-06-20	Programmed	Fall Protection	willful	21000	f	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
171	Westfield Paving LLC	westfield paving	2023-06-21	Unprogrammed	Scaffolding	serious	22000	f	Texas	Houston	https://www.osha.gov/data	2026-04-03 09:51:20.955764
172	Atlas Concrete Co	atlas concrete	2023-06-22	Programmed	Electrical Safety	other-than-serious	23000	t	Florida	Miami	https://www.osha.gov/data	2026-04-03 09:51:20.955764
173	Sunrise Scaffold LLC	sunrise scaffold	2023-06-23	Unprogrammed	Ladder Safety	other-than-serious	24000	f	New York	New York	https://www.osha.gov/data	2026-04-03 09:51:20.955764
174	Redwood Utility Services Inc	redwood utility services	2023-06-24	Programmed	Hazard Communication	serious	25000	f	Illinois	Chicago	https://www.osha.gov/data	2026-04-03 09:51:20.955764
175	Canyon Steel Works LLC	canyon steel works	2023-06-25	Unprogrammed	Respiratory Protection	willful	1000	f	Washington	Seattle	https://www.osha.gov/data	2026-04-03 09:51:20.955764
176	Prime Earthmoving Co	prime earthmoving	2023-06-26	Programmed	Trenching and Excavation	other-than-serious	2000	t	Arizona	Phoenix	https://www.osha.gov/data	2026-04-03 09:51:20.955764
177	Delta Site Solutions Inc	delta site solutions	2023-06-27	Unprogrammed	PPE Violation	serious	3000	f	Georgia	Atlanta	https://www.osha.gov/data	2026-04-03 09:51:20.955764
178	Evergreen Contracting LLC	evergreen contracting	2023-06-28	Programmed	Machine Guarding	other-than-serious	4000	f	North Carolina	Charlotte	https://www.osha.gov/data	2026-04-03 09:51:20.955764
179	Coastal General Builders Co	coastal general builders	2023-06-29	Unprogrammed	Lockout/Tagout	other-than-serious	5000	f	Virginia	Richmond	https://www.osha.gov/data	2026-04-03 09:51:20.955764
180	ABC Construction LLC	abc construction	2023-06-30	Programmed	Fall Protection	serious	6000	t	California	Los Angeles	https://www.osha.gov/data	2026-04-03 09:51:20.955764
\.


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.companies_id_seq', 20, true);


--
-- Name: company_pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.company_pages_id_seq', 20, true);


--
-- Name: company_registrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.company_registrations_id_seq', 1, false);


--
-- Name: company_risk_scores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.company_risk_scores_id_seq', 1, false);


--
-- Name: contractor_licenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.contractor_licenses_id_seq', 1, false);


--
-- Name: data_sources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.data_sources_id_seq', 1, false);


--
-- Name: osha_inspections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: gongsi_admin
--

SELECT pg_catalog.setval('public.osha_inspections_id_seq', 180, true);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_pages company_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_pages
    ADD CONSTRAINT company_pages_pkey PRIMARY KEY (id);


--
-- Name: company_pages company_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_pages
    ADD CONSTRAINT company_pages_slug_key UNIQUE (slug);


--
-- Name: company_registrations company_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_registrations
    ADD CONSTRAINT company_registrations_pkey PRIMARY KEY (id);


--
-- Name: company_risk_scores company_risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.company_risk_scores
    ADD CONSTRAINT company_risk_scores_pkey PRIMARY KEY (id);


--
-- Name: contractor_licenses contractor_licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.contractor_licenses
    ADD CONSTRAINT contractor_licenses_pkey PRIMARY KEY (id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- Name: osha_inspections osha_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: gongsi_admin
--

ALTER TABLE ONLY public.osha_inspections
    ADD CONSTRAINT osha_inspections_pkey PRIMARY KEY (id);


--
-- Name: idx_companies_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_companies_name ON public.companies USING btree (name);


--
-- Name: idx_companies_normalized_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_companies_normalized_name ON public.companies USING btree (normalized_name);


--
-- Name: idx_company_pages_slug; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_company_pages_slug ON public.company_pages USING btree (slug);


--
-- Name: idx_license_company_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_license_company_name ON public.contractor_licenses USING btree (company_name);


--
-- Name: idx_license_normalized_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_license_normalized_name ON public.contractor_licenses USING btree (normalized_name);


--
-- Name: idx_osha_company_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_osha_company_name ON public.osha_inspections USING btree (company_name);


--
-- Name: idx_osha_normalized_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_osha_normalized_name ON public.osha_inspections USING btree (normalized_name);


--
-- Name: idx_registration_company_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_registration_company_name ON public.company_registrations USING btree (company_name);


--
-- Name: idx_registration_normalized_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_registration_normalized_name ON public.company_registrations USING btree (normalized_name);


--
-- Name: idx_risk_company_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_risk_company_name ON public.company_risk_scores USING btree (company_name);


--
-- Name: idx_trgm_companies_name; Type: INDEX; Schema: public; Owner: gongsi_admin
--

CREATE INDEX idx_trgm_companies_name ON public.companies USING gin (name public.gin_trgm_ops);


--
-- PostgreSQL database dump complete
--

\unrestrict zmf5UbLjTbq0t1bz0JdMnwMK5rd4c8rpnz28b5ozOn0IvljgFmCBR8jA0qGB3su

