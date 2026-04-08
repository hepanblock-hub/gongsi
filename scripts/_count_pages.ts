import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://gongsi_admin:gongsi_pass_2026@localhost:54333/gongsihegui_db',
  });

  const CA_WHERE = "(lower(trim(state)) IN ('ca','california') OR lower(regexp_replace(state, '\\s+', '-', 'g'))='california')";

  const [caCompanies, caCities, releasedCities, byState] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM company_pages WHERE ${CA_WHERE} AND company_name ~* '[A-Za-z]' AND lower(trim(company_name)) <> '- select -'`),
    pool.query(`SELECT COUNT(DISTINCT lower(trim(city))) FROM company_pages WHERE ${CA_WHERE} AND city IS NOT NULL AND trim(city) <> '' AND company_name ~* '[A-Za-z]'`),
    pool.query(`SELECT COUNT(*) FROM released_cities`).catch(() => ({ rows: [{ count: '?' }] })),
    pool.query(`SELECT lower(trim(state)) AS state, COUNT(*) AS cnt FROM company_pages WHERE company_name ~* '[A-Za-z]' AND lower(trim(company_name)) <> '- select -' GROUP BY lower(trim(state)) ORDER BY cnt DESC`),
  ]);

  const PF = 14;
  const tc = Number(caCompanies.rows[0].count);
  const cc = Number(caCities.rows[0].count);
  const sc = 1; // 主站仅 California

  console.log('\n========== California 站点页面统计 ==========\n');
  console.log(`公司页   /company/[slug]           ${tc.toLocaleString()}`);
  console.log(`州页面   /state/california          1`);
  console.log(`城市页   /state/.../city/[city]     ${cc.toLocaleString()}（全部） / ${releasedCities.rows[0].count}（已发布）`);
  console.log(`筛选页   /state/.../filter/[filter] ${PF}`);
  console.log(`城市列表 /state/california/cities   1`);
  console.log(`首页                                1`);
  console.log(`搜索页   /search                    实时，不需要快照`);
  console.log(`静态页   about/faq等                ~8（不需要快照）`);
  const total = tc + sc + cc + PF + sc + 1;
  console.log(`\n可快照总页面数                      ~${total.toLocaleString()}`);

  const stateRows = byState.rows as { state: string; cnt: string }[];
  const others = stateRows.filter((r) => !['ca', 'california'].includes(r.state));
  const otherCount = others.reduce((sum, r) => sum + Number(r.cnt), 0);
  if (otherCount > 0) {
    console.log('\n---------- 非 CA 脏数据（建议忽略/清理） ----------');
    for (const r of others) console.log(`${r.state.padEnd(20)} ${String(r.cnt).padStart(8)}`);
    console.log(`合计非 CA 记录: ${otherCount}`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
