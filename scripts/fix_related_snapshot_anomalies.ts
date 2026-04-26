import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CompanySnapshot = {
  related?: unknown;
};

type AnomalyReason = 'parse-error' | 'missing-related' | 'null-related' | 'non-array-related';

type AnomalyEntry = {
  relativePath: string;
  absolutePath: string;
  state: string;
  reason: AnomalyReason;
  error?: string;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, '..');
const DATA_ROOT = process.env.SNAPSHOT_DATA_ROOT || path.join(ROOT, 'kuaizhao', 'data');
const COMPANY_DIR = path.join(DATA_ROOT, 'company');
const OUTPUT_DIR = path.join(DATA_ROOT, '_failed');

const DELETE_FILES = (process.env.FIX_RELATED_DELETE || 'false') === 'true';

const stateAliasMap: Record<string, string> = {
  california: 'ca',
  ca: 'ca',
  florida: 'fl',
  fl: 'fl',
  texas: 'tx',
  tx: 'tx',
};

function normalizeStates(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)) {
    const normalized = stateAliasMap[part] ?? part;
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

const STATES = normalizeStates(process.env.FIX_RELATED_STATES || 'ca,fl,tx');
const STATE_SUFFIX_SET = new Set(STATES);
const STATE_TAG = STATES.join('-');
const LIST_FILE = path.join(OUTPUT_DIR, `related-anomaly-upload-list-${STATE_TAG}.txt`);
const REPORT_FILE = path.join(OUTPUT_DIR, `related-anomaly-report-${STATE_TAG}.json`);

function detectStateFromFile(fileName: string): string | null {
  const match = fileName.match(/-([a-z]{2})\.json$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function summarize(anomalies: AnomalyEntry[]) {
  const byState: Record<string, Record<AnomalyReason, number>> = {};
  for (const state of STATES) {
    byState[state] = {
      'parse-error': 0,
      'missing-related': 0,
      'null-related': 0,
      'non-array-related': 0,
    };
  }

  for (const item of anomalies) {
    if (!byState[item.state]) {
      byState[item.state] = {
        'parse-error': 0,
        'missing-related': 0,
        'null-related': 0,
        'non-array-related': 0,
      };
    }
    byState[item.state][item.reason] += 1;
  }

  return byState;
}

async function main() {
  if (!fsSync.existsSync(COMPANY_DIR)) {
    throw new Error(`company snapshot dir not found: ${COMPANY_DIR}`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const files = await fs.readdir(COMPANY_DIR);
  const anomalies: AnomalyEntry[] = [];

  for (const fileName of files) {
    if (!fileName.endsWith('.json')) continue;
    const state = detectStateFromFile(fileName);
    if (!state || !STATE_SUFFIX_SET.has(state)) continue;

    const absolutePath = path.join(COMPANY_DIR, fileName);
    const relativePath = `company/${fileName}`;

    let raw: string;
    try {
      raw = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      anomalies.push({
        relativePath,
        absolutePath,
        state,
        reason: 'parse-error',
        error: String(error),
      });
      continue;
    }

    let parsed: CompanySnapshot;
    try {
      parsed = JSON.parse(raw) as CompanySnapshot;
    } catch (error) {
      anomalies.push({
        relativePath,
        absolutePath,
        state,
        reason: 'parse-error',
        error: String(error),
      });
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(parsed, 'related')) {
      anomalies.push({ relativePath, absolutePath, state, reason: 'missing-related' });
      continue;
    }

    if (parsed.related === null) {
      anomalies.push({ relativePath, absolutePath, state, reason: 'null-related' });
      continue;
    }

    if (!Array.isArray(parsed.related)) {
      anomalies.push({ relativePath, absolutePath, state, reason: 'non-array-related' });
    }
  }

  if (DELETE_FILES) {
    for (const item of anomalies) {
      try {
        await fs.unlink(item.absolutePath);
      } catch {
        // ignore delete failures so the report can still be produced
      }
    }
  }

  const uploadList = `${anomalies.map((item) => item.relativePath).join('\n')}${anomalies.length ? '\n' : ''}`;
  await fs.writeFile(LIST_FILE, uploadList, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    states: STATES,
    deleteFiles: DELETE_FILES,
    anomalyCount: anomalies.length,
    summary: summarize(anomalies),
    listFile: path.relative(ROOT, LIST_FILE).replace(/\\/g, '/'),
    anomalies: anomalies.map((item) => ({
      relativePath: item.relativePath,
      state: item.state,
      reason: item.reason,
      error: item.error ?? null,
    })),
  };

  await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('▶ Related 快照异常扫描完成');
  console.log(`  州: ${STATES.join(', ')}`);
  console.log(`  异常文件: ${anomalies.length}`);
  console.log(`  已删除: ${DELETE_FILES ? anomalies.length : 0}`);
  console.log(`  上传名单: ${path.relative(ROOT, LIST_FILE).replace(/\\/g, '/')}`);
  console.log(`  详细报告: ${path.relative(ROOT, REPORT_FILE).replace(/\\/g, '/')}`);

  const summary = summarize(anomalies);
  for (const state of STATES) {
    const stateSummary = summary[state];
    console.log(
      `  ${state.toUpperCase()}: parse=${stateSummary['parse-error']} missing=${stateSummary['missing-related']} null=${stateSummary['null-related']} nonArray=${stateSummary['non-array-related']}`
    );
  }
}

main().catch((error) => {
  console.error('❌ 修复 related 快照异常失败');
  console.error(error);
  process.exit(1);
});