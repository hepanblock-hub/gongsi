/**
 * SEO 修复 - 所有页面的 Metadata 优化
 * 文件列表：
 * 1. app/page.tsx (首页)
 * 2. app/state/[stateSlug]/page.tsx (州页)
 * 3. app/state/[stateSlug]/cities/page.tsx (城市列表页)
 * 4. app/state/[stateSlug]/city/[citySlug]/page.tsx (城市页)
 */

// ============================================================
// 1. 首页 (app/page.tsx)
// ============================================================

// ❌ 现有：

export const metadata: Metadata = {
  title: { absolute: 'Compliance Lookup | OSHA, License & Registration Records' },
  description: 'Search public compliance records for companies and contractors. Browse OSHA inspections, contractor licenses, and registration status from official sources.',
  alternates: { canonical: '/' },
};

// ✅ 改为：

export const metadata: Metadata = {
  title: { absolute: 'Company Compliance Lookup | OSHA Violations, Contractor License & Registration Database' },
  description: 'Find public OSHA violations, contractor license status, and business registration records for companies across all US states. Free compliance lookup tool for hiring decisions.',
  alternates: { canonical: '/' },
};

// ============================================================
// 2. 州页面 (app/state/[stateSlug]/page.tsx) - generateMetadata 函数
// ============================================================

// ❌ 现有格式 (假设在代码中)：
// Title: "{stateName} — Company Compliance Lookup | OSHA Records by State"
// Description: "Browse {stateName} companies with OSHA violations, contractor licenses, and registration records..."

// ✅ 改为：

// 在 generateMetadata 函数中修改返回值：
{
  title: { absolute: `${stateName} Contractor License Lookup & OSHA Violations | Company Compliance Database` },
  description: `Search ${stateName} contractors and companies by OSHA violations, license status, and registration. Verify compliance history before hiring. Free public records lookup.`,
  alternates: {
    canonical: `${SITE_URL}/state/${stateSlug}`,
  },
}

// ============================================================
// 3. 城市列表页 (app/state/[stateSlug]/cities/page.tsx)
// ============================================================

// ❌ 现有：
{
  title: { absolute: `${stateName} Cities Overview | OSHA, License & Company Records` },
  description: `Browse cities in ${stateName} with public compliance records. Find OSHA history, contractor license status, and company registration details by city.`,
  alternates: {
    canonical: `/state/${stateSlug}/cities`,
  },
}

// ✅ 改为：
{
  title: { absolute: `Browse ${stateName} Cities - Contractor License & OSHA Records by Location` },
  description: `Find contractors and companies in ${stateName} cities with OSHA violations, license status, and registration records. Search by city location.`,
  alternates: {
    canonical: `/state/${stateSlug}/cities`,
  },
}

// ============================================================
// 4. 城市页面 (app/state/[stateSlug]/city/[citySlug]/page.tsx)
// ============================================================

// ❌ 现有格式 (需要在 generateMetadata 中修改)：
// 假设标题是动态的，类似: "{cityName} Contractors & Companies"

// ✅ 改为以下模式：

{
  title: { absolute: `${cityName}, ${stateName} Contractors | OSHA Violations & License Status` },
  description: `Find ${cityName}, ${stateName} contractors and businesses with OSHA inspection records, license status, and registration details. Verify compliance before hiring.`,
  alternates: {
    canonical: `/state/${stateSlug}/city/${citySlug}`,
  },
}

// ============================================================
// 说明：
// ============================================================

/*
为什么要修改Title和Description？

1. Title改动原因：
   - ✅ 加入了地名关键词（州名、城市名）
   - ✅ 加入了长尾关键词（"Contractor License Lookup"）
   - ✅ 更符合用户搜索习惯（"[Location] Contractors" 高频查询）

2. Description改动原因：
   - ✅ 更清晰地说明功能（"Verify compliance before hiring"）
   - ✅ 包含行动号召 ("Search by city", "Free lookup")
   - ✅ 增强点击率（CTR）

3. 预期效果：
   - 州页 + 城市页：每个州可额外获得 10-50 个新排名（地区性关键词）
   - 首页：品牌词和核心关键词排名提升 1-3 位
   - 预计 CTR 提升 15-25%
*/

// ============================================================
// 快速替换指南
// ============================================================

/*
在你的代码编辑器中：

1. ctrl+H 打开替换对话框
2. 找到相应的 metadata 代码块
3. 用上面的新代码替换
4. 或者用我提供的具体搜索/替换对

关键 meta tags 检查清单：
☐ 首页 Title 包含 "OSHA" + "Contractor License" + "Compliance"
☐ 首页 Description 包含 "free" + "lookup" + "all US states"
☐ 州页 Title 包含州名 + "Contractor License" 或 "OSHA"
☐ 州页 Description 包含州名 + "search" + "verify"
☐ 城市页 Title 包含城市名 + 州名 + 关键词
☐ 城市列表页 Title 包含州名 + "by city"

*/
