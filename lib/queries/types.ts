export type CompanyPageRow = {
  slug: string;
  company_name: string;
  state: string;
  city: string | null;
  updated_at: string | null;
};

export type RecentCompanyRow = CompanyPageRow & {
  has_osha: boolean;
  has_license: boolean;
  has_registration: boolean;
};

export type SearchCompanyRow = CompanyPageRow & {
  osha_count: number;
  license_status: string;
  registration_status: string;
};

export type OshaRow = {
  inspection_date: string | null;
  inspection_type: string | null;
  violation_type: string | null;
  severity: string | null;
  penalty: string | null;
  open_case: boolean | null;
  source_url: string | null;
};

export type LicenseRow = {
  license_number: string | null;
  license_type: string | null;
  status: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  source_url: string | null;
};

export type RegistrationRow = {
  registration_number: string | null;
  status: string | null;
  incorporation_date: string | null;
  registered_agent: string | null;
  source_url: string | null;
};

export type CompanyTimelineRow = {
  event_date: string | null;
  event_type: string;
  detail: string;
};

export type SearchOptions = {
  query: string;
  state?: string;
  city?: string;
  hasOsha?: boolean;
  sort?: 'name' | 'updated' | 'osha';
};
