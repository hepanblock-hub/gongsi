import SectionCard from '../common/SectionCard';

type RiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk';

export type BottomLineAssessment = {
  verdict: string;
  plainAnswer: string;
  action: string;
  riskBand: string;
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
    ? 'Top 20% safer-profile band (within this scoring model)'
    : input.score >= 60
      ? 'Middle 40% mixed-profile band (within this scoring model)'
      : 'Bottom 40% higher-risk band (within this scoring model)';

  if (!input.entityLooksReal) {
    return {
      verdict: 'Identity confidence is low in the current dataset',
      plainAnswer: 'Legitimacy cannot be confirmed from current records alone.',
      action: 'Verify legal entity name and registration number directly in official state systems before further review.',
      riskBand,
    };
  }

  if (input.fatalityEvents > 0 || input.riskLevel === 'High Risk') {
    return {
      verdict: 'Elevated compliance risk signal detected',
      plainAnswer: 'This profile shows meaningful risk indicators and should be treated as high-friction during screening.',
      action: 'Require full manual verification and supporting documentation before shortlisting.',
      riskBand,
    };
  }

  if (!input.hasLicense && !input.hasRegistration) {
    return {
      verdict: 'Insufficient legal standing evidence in current records',
      plainAnswer: 'Public safety/compliance data exists, but legal status evidence is incomplete.',
      action: 'Confirm license and entity standing on official portals before considering procurement or hiring decisions.',
      riskBand,
    };
  }

  if (input.riskLevel === 'Low Risk' && license === 'active' && input.hasRegistration && registration !== 'unknown') {
    return {
      verdict: 'No major compliance red flags observed in current records',
      plainAnswer: 'Available records indicate a comparatively lower screening risk at this time.',
      action: 'Proceed to standard due diligence and keep documentary verification in the file.',
      riskBand,
    };
  }

  return {
    verdict: 'Mixed signals: further verification recommended',
    plainAnswer: 'This profile does not show a clear pass/fail outcome from public data alone.',
    action: 'Run targeted verification for missing or unclear fields before a final decision.',
    riskBand,
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
        <p><strong>Direct answer for "is this company legit?":</strong> {bottomLine.plainAnswer}</p>
        <p><strong>Recommended action:</strong> {bottomLine.action}</p>
        <p><strong>Relative risk position:</strong> {bottomLine.riskBand}.</p>
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