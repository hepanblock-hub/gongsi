import SectionCard from '../common/SectionCard';

type RiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk';

export type BottomLineAssessment = {
  verdict: string;
  plainAnswer: string;
  action: string;
  riskBand: string;
  screeningPriority: string;
};

export function buildBottomLineAssessment(input: {
  riskLevel: RiskLevel;
  score: number;
  hasLicense: boolean;
  hasRegistration: boolean;
  licenseStatus: string;
  registrationStatus: string;
  entityLooksReal: boolean;
  fatalityEvents: number;
}): BottomLineAssessment {
  const license = input.licenseStatus.toLowerCase();
  const registration = input.registrationStatus.toLowerCase();

  const riskBand = input.score >= 80
    ? 'Higher-confidence documentation band (within this screening model)'
    : input.score >= 60
      ? 'Mixed-evidence band (within this screening model)'
      : 'Higher verification-priority band (within this screening model)';

  if (!input.entityLooksReal) {
    return {
      verdict: 'Entity identity requires manual confirmation',
      plainAnswer: 'Identity details were not fully confirmed in the current dataset. Verify legal entity fields through official state systems.',
      action: 'Verify legal entity name and registration number directly in official state systems before further review.',
      riskBand,
      screeningPriority: 'High verification priority',
    };
  }

  if (input.fatalityEvents > 0 || input.riskLevel === 'High Risk') {
    return {
      verdict: 'Elevated verification priority based on available signals',
      plainAnswer: 'Current records show stronger risk indicators. Additional verification is recommended before shortlisting decisions.',
      action: 'Require full manual verification and supporting documentation before shortlisting.',
      riskBand,
      screeningPriority: 'High verification priority',
    };
  }

  if (!input.hasLicense && !input.hasRegistration) {
    return {
      verdict: 'Limited legal-status evidence in current dataset',
      plainAnswer: 'No confirmed license or registration record was observed in the current dataset. Verify directly with official state systems.',
      action: 'Confirm license and entity standing on official portals before considering procurement or hiring decisions.',
      riskBand,
      screeningPriority: 'Moderate-to-high verification priority',
    };
  }

  if (input.riskLevel === 'Low Risk' && license === 'active' && input.hasRegistration && registration !== 'unknown') {
    return {
      verdict: 'No major verification blockers observed in current records',
      plainAnswer: 'Available records indicate comparatively stronger documentation coverage in the current dataset.',
      action: 'Proceed to standard due diligence and keep documentary verification in the file.',
      riskBand,
      screeningPriority: 'Lower verification priority',
    };
  }

  return {
    verdict: 'Mixed signals: further verification recommended',
    plainAnswer: 'This profile does not show a clear pass/fail outcome from current public data alone and should be verified source-by-source.',
    action: 'Run targeted verification for missing or unclear fields before a final decision.',
    riskBand,
    screeningPriority: 'Moderate verification priority',
  };
}

export default function DecisionSupportLayers({
  companyName,
  stateName,
  bottomLine,
}: {
  companyName: string;
  stateName: string;
  bottomLine: BottomLineAssessment;
}) {
  return (
    <>
      <SectionCard title="Bottom-line screening conclusion">
        <p><strong>Verdict:</strong> {bottomLine.verdict}</p>
        <p><strong>Direct verification takeaway:</strong> {bottomLine.plainAnswer}</p>
        <p><strong>Recommended action:</strong> {bottomLine.action}</p>
        <p><strong>Relative position:</strong> {bottomLine.riskBand}.</p>
      </SectionCard>

      <SectionCard title="Who should care and when this matters">
        <ul>
          <li><strong>Property owners / buyers:</strong> review this before signing contracts that involve regulated work.</li>
          <li><strong>Procurement teams:</strong> use it at pre-qualification stage to avoid avoidable compliance exposure.</li>
          <li><strong>HR / site operations:</strong> prioritize manual checks when onboarding vendors with mixed signals.</li>
        </ul>
        <p>
          This page matters most when you are deciding whether to shortlist, approve, or escalate {companyName} for deeper compliance review in {stateName}.
        </p>
      </SectionCard>

      <SectionCard title="Typical risk scenarios to verify first">
        <ul>
          <li>OSHA activity is present, but license/registration evidence is missing or unclear.</li>
          <li>License status is not active, or status fields are stale/unknown across sources.</li>
          <li>Entity naming pattern looks atypical and requires identity confirmation.</li>
        </ul>
      </SectionCard>
    </>
  );
}