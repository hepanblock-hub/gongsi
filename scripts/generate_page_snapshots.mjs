import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:39017';
const OUTPUT_DIR = './public/page_snapshots';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const pages = [
  // State page
  {
    name: '01_state_california',
    url: '/state/california',
    description: 'State Page - California Overview'
  },
  // City page
  {
    name: '02_city_los_angeles',
    url: '/state/california/city/los-angeles',
    description: 'City Page - Los Angeles'
  },
  // Filter pages
  {
    name: '03_filter_quality',
    url: '/state/california/filter/quality',
    description: 'Filter Page - Quality Rankings'
  },
  {
    name: '04_filter_osha',
    url: '/state/california/filter/osha',
    description: 'Filter Page - OSHA Records'
  },
  {
    name: '05_filter_contractor_licenses',
    url: '/state/california/filter/contractor-licenses',
    description: 'Filter Page - Contractor Licenses'
  },
  // Company pages (will be populated after querying DB)
];

// Sample companies to fetch from DB for screenshots
const companyQueries = [
  // High risk company
  "SELECT slug FROM company_pages WHERE state = 'california' AND risk_score > 70 LIMIT 1",
  // Medium risk
  "SELECT slug FROM company_pages WHERE state = 'california' AND risk_score BETWEEN 40 AND 70 LIMIT 1",
  // Low risk
  "SELECT slug FROM company_pages WHERE state = 'california' AND risk_score < 40 LIMIT 1",
  // With OSHA
  "SELECT DISTINCT cp.slug FROM company_pages cp JOIN osha_inspections oi ON cp.slug = oi.company_slug WHERE cp.state = 'california' LIMIT 1",
  // With License
  "SELECT DISTINCT cp.slug FROM company_pages cp JOIN contractor_licenses cl ON cp.slug = cl.company_slug WHERE cp.state = 'california' LIMIT 1",
  // With Registration
  "SELECT DISTINCT cp.slug FROM company_pages cp JOIN company_registrations cr ON cp.slug = cr.company_slug WHERE cp.state = 'california' LIMIT 1",
  // Popular company (by mentions)
  "SELECT slug FROM company_pages WHERE state = 'california' ORDER BY mentions DESC LIMIT 1",
  // Recent company
  "SELECT slug FROM company_pages WHERE state = 'california' ORDER BY last_seen_at DESC LIMIT 1",
  // Company with address data
  "SELECT DISTINCT cp.slug FROM company_pages cp JOIN osha_inspections oi ON cp.slug = oi.company_slug WHERE cp.state = 'california' AND oi.city ~ '^[0-9]' LIMIT 1",
  // Company with injury records
  "SELECT DISTINCT cp.slug FROM company_pages cp JOIN osha_inspections oi ON cp.slug = oi.company_slug WHERE cp.state = 'california' AND oi.injury_count > 0 LIMIT 1",
];

async function getCompanySlugs() {
  try {
    // Import pg module dynamically
    const pg = await import('pg');
    const { Client } = pg.default;

    const client = new Client({
      host: 'localhost',
      port: 54333,
      database: 'gongsihegui_db',
      user: 'gongsi_admin',
      password: 'gongsi_pass_2026'
    });

    await client.connect();

    console.log('🔍 Fetching company slugs from database...');
    for (const query of companyQueries) {
      try {
        const res = await client.query(query);
        if (res.rows.length > 0) {
          const slug = res.rows[0].slug;
          pages.push({
            name: `06_company_${slug.substring(0, 25)}`,
            url: `/company/${slug}`,
            description: `Company Page - ${slug}`
          });
        }
      } catch (err) {
        console.warn(`⚠️ Query failed: ${query.substring(0, 50)}...`);
      }
    }

    await client.end();
    console.log(`✅ Found ${pages.length - 5} unique pages to snapshot`);
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    console.log('Using fallback company pages...');
    // Fallback to common company slugs
    const fallbackCompanies = [
      'pacific-west-site-services-ca',
      'bjs-services-ca',
      'best-roofing-ca',
      'california-contractors-inc',
      'elite-construction-ca'
    ];
    fallbackCompanies.forEach((slug, idx) => {
      if (idx < 5) {
        pages.push({
          name: `06_company_${idx + 1}`,
          url: `/company/${slug}`,
          description: `Company Page ${idx + 1}`
        });
      }
    });
  }
}

async function generateSnapshots() {
  let browser;
  try {
    console.log('🚀 Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const snapshotSummary = [];

    for (const page_config of pages) {
      const browserPage = await browser.newPage();
      const fullUrl = `${BASE_URL}${page_config.url}`;

      try {
        console.log(`\n📸 Capturing: ${page_config.description}`);
        console.log(`   URL: ${fullUrl}`);

        // Set viewport for full-page screenshot
        await browserPage.setViewport({ width: 1440, height: 900 });

        // Navigate and wait for page to load
        await browserPage.goto(fullUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Wait for content to render
        await browserPage.waitForTimeout(2000);

        // Get page metrics and metadata
        const pageMetrics = await browserPage.evaluate(() => {
          return {
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            robotsNoindex: document.querySelector('meta[name="robots"]')?.content?.includes('noindex') || false,
            canonical: document.querySelector('link[rel="canonical"]')?.href || '',
            structuredData: document.querySelector('script[type="application/ld+json"]')?.textContent || '',
            headings: {
              h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
              h2: Array.from(document.querySelectorAll('h2')).slice(0, 5).map(h => h.textContent.trim())
            },
            externalLinks: Array.from(document.querySelectorAll('a[href^="http"]')).slice(0, 5).map(a => ({
              text: a.textContent.trim(),
              href: a.href
            })),
            bodyText: document.body.innerText.substring(0, 500)
          };
        });

        // Capture full-page screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `${page_config.name}.png`);
        await browserPage.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        // Save metadata HTML
        const htmlPath = path.join(OUTPUT_DIR, `${page_config.name}_metadata.json`);
        fs.writeFileSync(htmlPath, JSON.stringify(pageMetrics, null, 2));

        snapshotSummary.push({
          name: page_config.name,
          description: page_config.description,
          url: page_config.url,
          title: pageMetrics.title,
          description: pageMetrics.description,
          noindex: pageMetrics.robotsNoindex,
          h1: pageMetrics.headings.h1,
          externalLinksCount: pageMetrics.externalLinks.length,
          screenshotPath: screenshotPath
        });

        console.log(`   ✅ Screenshot saved: ${screenshotPath}`);
        console.log(`   📝 Title: ${pageMetrics.title}`);
        console.log(`   🔗 noindex: ${pageMetrics.robotsNoindex}`);

      } catch (err) {
        console.error(`   ❌ Error capturing ${page_config.description}: ${err.message}`);
      } finally {
        await browserPage.close();
      }
    }

    // Generate summary report
    const reportPath = path.join(OUTPUT_DIR, '_SEO_ANALYSIS_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(snapshotSummary, null, 2));

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ Snapshot Generation Complete');
    console.log(`${'='.repeat(80)}`);
    console.log(`📁 All snapshots saved to: ${OUTPUT_DIR}`);
    console.log(`📊 Report saved to: ${reportPath}`);
    console.log(`\n📌 Summary:`);
    snapshotSummary.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.description}`);
      console.log(`   Title: ${item.title}`);
      console.log(`   noindex: ${item.noindex}`);
      console.log(`   External Links: ${item.externalLinksCount}`);
    });

  } catch (err) {
    console.error('❌ Fatal error:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Main execution
(async () => {
  await getCompanySlugs();
  await generateSnapshots();
})();
