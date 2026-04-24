import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Methodology | How Compliance Records Are Collected' },
  description: 'See how public OSHA, contractor license, and registration records are collected, normalized, and updated across our database.',
  alternates: {
    canonical: '/methodology',
  },
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function MethodologyPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Methodology' }]} />
      <PageTitle
        title="Methodology"
        description="How data is collected, normalized, matched, and presented."
      />

      <SectionCard title="Ownership and accountability consistency">
        <p><strong>Operating team:</strong> HEPANBLOCK</p>
        <p><strong>Responsible person:</strong> QI CHEN</p>
        <p>
          The same operating entity is referenced across <a href="/about">About</a>, <a href="/sources">Sources</a>, and <a href="/contact">Contact</a>
          to keep public accountability signals consistent.
        </p>
      </SectionCard>

      <SectionCard title="How data is collected">
        <p>Data is collected from official public-record systems and state authorities, then standardized for search and comparison.</p>
        <ul>
          <li>
            <a href="https://www.osha.gov/data" target="_blank" rel="dofollow noopener noreferrer">
              Occupational Safety and Health Administration (OSHA)
            </a>
            {' '}— inspections, violations, and penalties.
          </li>
          <li>
            State contractor licensing authorities (state-specific boards and portals).
          </li>
          <li>
            Secretary of State business registries (entity status and filing visibility).
          </li>
        </ul>
        <p>
          For source inventory and state links, see{' '}
          <a href="/sources">Data Sources</a>.
        </p>
      </SectionCard>

      <SectionCard title="How data is normalized">
        <p>
          Company names are normalized (case, punctuation, legal-suffix handling, and spacing cleanup)
          to support cross-source matching with lower false positives.
        </p>
        <p>
          Example: “ABC Roofing, LLC” and “ABC ROOFING LLC” are normalized into a comparable form,
          while preserving original source text for traceability.
        </p>
      </SectionCard>

      <SectionCard title="How matching works">
        <p>
          Matching uses normalized company name + state context + record-type constraints
          (OSHA/license/registration) to reduce cross-entity collisions.
        </p>
        <p>
          Results are aggregated conservatively. If confidence is weak, records are not merged into a single
          “certain” profile and may remain partial until stronger corroboration appears.
        </p>
        <p>
          Example edge case: two similarly named companies in the same state are kept separated when source identifiers
          or filing context do not support high-confidence consolidation.
        </p>
      </SectionCard>

      <SectionCard title="Scoring, ranking, and aggregation logic">
        <p>
          This site does not publish subjective star ratings. It uses deterministic aggregation and coverage tiers
          to summarize public-record completeness.
        </p>
        <p>
          These tiers are derived strictly from record availability and are not predictive or reputational scores.
        </p>
        <ul>
          <li><strong>Record-type aggregation:</strong> OSHA, license, and registration signals are combined per company profile.</li>
          <li><strong>Coverage tiers:</strong> full / partial / basic tiers are derived from record-type availability.</li>
          <li><strong>State and filter views:</strong> pages group entities by transparent filter logic (e.g., OSHA-only, license-only, full profiles).</li>
          <li><strong>No hidden weighting:</strong> no proprietary “trust score” is injected to override source records.</li>
        </ul>
        <p>
          In short, aggregation is rules-based and auditable, not opinion-based.
        </p>
      </SectionCard>

      <SectionCard title="Entity disambiguation standards">
        <p>
          Entity resolution follows explicit identifier precedence and state-scoped matching rules to reduce false merges.
        </p>
        <ul>
          <li><strong>ID precedence:</strong> official source identifiers (e.g., inspection/license/registration IDs) are preferred over name-only matches whenever available.</li>
          <li><strong>State-scoped matching:</strong> same-name entities are matched within state context first before any broader comparison.</li>
          <li><strong>Cross-state duplicates:</strong> similarly named companies in different states are treated as distinct entities unless official records explicitly support consolidation.</li>
          <li><strong>Conflict handling:</strong> when identifiers and names disagree, records are flagged for review instead of force-merged.</li>
        </ul>
      </SectionCard>

      <SectionCard title="AI-assisted processing disclosure">
        <p>
          We use AI-assisted systems to help structure text summaries and improve consistency of explanatory content.
        </p>
        <p>
          AI does <strong>not</strong> generate official numeric/source records. Public record values and statuses come from
          official source systems and rule-based ingestion pipelines.
        </p>
      </SectionCard>

      <SectionCard title="Error handling and boundary cases">
        <ul>
          <li><strong>Schema changes:</strong> if source fields change, ingestion rules are reviewed before release.</li>
          <li><strong>Null or missing fields:</strong> missing values are preserved as missing rather than fabricated.</li>
          <li><strong>Duplicate control:</strong> duplicate source rows are flagged and deduplicated by deterministic rules.</li>
          <li><strong>Conflict resolution:</strong> when records conflict, official issuing-agency records take precedence.</li>
        </ul>
      </SectionCard>

      <SectionCard title="State-level official links (CA / TX / FL / NY)">
        <ul>
          <li>
            <strong>California:</strong>{' '}
            <a href="https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx" target="_blank" rel="dofollow noopener noreferrer">
              CSLB License Check
            </a>
            {' '}·{' '}
            <a href="https://bizfileonline.sos.ca.gov/search/business" target="_blank" rel="dofollow noopener noreferrer">
              California Secretary of State Business Search
            </a>
          </li>
          <li>
            <strong>Texas:</strong>{' '}
            <a href="https://www.sos.state.tx.us/corp/sosda/index.shtml" target="_blank" rel="dofollow noopener noreferrer">
              Texas Secretary of State Business Filings
            </a>
          </li>
          <li>
            <strong>Florida:</strong>{' '}
            <a href="https://search.sunbiz.org/Inquiry/CorporationSearch/ByName" target="_blank" rel="dofollow noopener noreferrer">
              Florida Sunbiz Business Search
            </a>
            {' '}·{' '}
            <a href="https://www.myfloridalicense.com/wl11.asp?mode=0&SID=" target="_blank" rel="dofollow noopener noreferrer">
              Florida DBPR License Lookup
            </a>
          </li>
          <li>
            <strong>New York:</strong>{' '}
            <a href="https://data.cityofnewyork.us/resource/ipu4-2q9a.json" target="_blank" rel="dofollow noopener noreferrer">
              NYC DOB Permit Issuance (raw API)
            </a>
            {' '}·{' '}
            <a href="https://data.ny.gov/resource/ucu3-8265.json" target="_blank" rel="dofollow noopener noreferrer">
              NY DOS Appearance & Barber Licenses (raw API)
            </a>
            {' '}·{' '}
            <a href="https://data.ny.gov/resource/q35v-e8qb.json" target="_blank" rel="dofollow noopener noreferrer">
              NY DOS Manufactured Housing Certified Entities (raw API)
            </a>
            {' '}·{' '}
            <a href="https://www.osha.gov/data" target="_blank" rel="dofollow noopener noreferrer">
              OSHA Data Portal (NY records included)
            </a>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="What is not included">
        <p>No subjective ratings, legal opinions, or private personal data are provided.</p>
      </SectionCard>

      <SectionCard title="Update frequency and limitations">
        <p>Refresh intervals vary by source and may introduce delays. Verify critical details directly with the source agency.</p>
        <ul>
          <li><strong>Not real-time:</strong> this site reflects periodic ingestion, not continuous live replication of all agency systems.</li>
          <li><strong>Delay window:</strong> newly published agency records may take additional time to pass validation and appear on profiles.</li>
          <li><strong>Coverage variance:</strong> availability differs by state, record type, and historical period.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Data boundary statement">
        <ul>
          <li><strong>State coverage is uneven:</strong> some states provide richer machine-readable access than others.</li>
          <li><strong>Local-only records:</strong> county/city permit systems may be out of scope unless officially integrated.</li>
          <li><strong>Historical gaps:</strong> not all agencies expose complete historical archives through public endpoints.</li>
          <li><strong>Identity uncertainty:</strong> when evidence is insufficient, records are kept separate rather than force-merged.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Editorial and update accountability">
        <p>Each dataset has an assigned refresh cadence and validation checks before publication.</p>
        <p>When source systems change schema or publication format, ingestion rules are reviewed and adjusted before the next release.</p>
      </SectionCard>

      <SectionCard title="Quality control and correction handling">
        <p>Quality checks include duplicate control, date validity checks, null-value handling, and normalization consistency.</p>
        <p>Reported issues are triaged, source-verified, and resolved through a tracked correction process with data re-run when required.</p>
        <p>Related trust documents: <a href="/sources">Sources</a> · <a href="/editorial-policy">Editorial Policy</a></p>
      </SectionCard>
    </main>
  );
}
