export type CompanyPageQuality = {
  sourceCount: number;
  hasAnyRecords: boolean;
  sparse: boolean;
  indexable: boolean;
};

export function isLikelyRealCompanyName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^-?\s*select\s*-?$/i.test(trimmed)) return false;
  if (/^\d+[\w\s-]*$/.test(trimmed)) return false;
  // Only reject actual street addresses that begin with a house number
  if (/^\d+\s+\w+.*\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr)\b/i.test(trimmed)) return false;
  // Only reject code-like strings with no spaces (e.g. "ABCD1234XYZ")
  if (/^[A-Z0-9-]{10,}$/.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
}

export function assessCompanyPageQuality(input: {
  oshaCount: number;
  licenseCount: number;
  registrationCount: number;
  entityLooksReal: boolean;
}): CompanyPageQuality {
  const sourceCount = [input.oshaCount > 0, input.licenseCount > 0, input.registrationCount > 0].filter(Boolean).length;
  const hasAnyRecords = sourceCount > 0;
  const sparse = !hasAnyRecords || !input.entityLooksReal;

  return {
    sourceCount,
    hasAnyRecords,
    sparse,
    indexable: hasAnyRecords && input.entityLooksReal,
  };
}

export type CollectionPageQuality = {
  companyCount: number;
  evidenceCompanyCount: number;
  evidenceRatio: number;
  thin: boolean;
  indexable: boolean;
};

export function assessCollectionPageQuality(input: {
  companyCount: number;
  evidenceCompanyCount: number;
  minCompanies: number;
  minEvidenceRatio?: number;
  minEvidenceCompanies?: number;
}): CollectionPageQuality {
  const evidenceRatio = input.evidenceCompanyCount / Math.max(1, input.companyCount);
  const minEvidenceRatio = input.minEvidenceRatio ?? 0.35;
  const minEvidenceCompanies = input.minEvidenceCompanies ?? Math.min(input.minCompanies, 10);
  const thin = input.companyCount < input.minCompanies || evidenceRatio < minEvidenceRatio || input.evidenceCompanyCount < minEvidenceCompanies;

  return {
    companyCount: input.companyCount,
    evidenceCompanyCount: input.evidenceCompanyCount,
    evidenceRatio,
    thin,
    indexable: !thin,
  };
}
