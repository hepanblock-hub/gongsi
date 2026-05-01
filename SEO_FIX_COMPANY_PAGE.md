/**
 * SEO 修复清单 - Company 页面
 * 
 * 修改内容：
 * 1. 删除 pickVariant() 随机文本生成
 * 2. 用单一、高质量的文本替换
 * 3. 增加独特的内容价值
 */

// ❌ 现有代码 (需删除 pickVariant)：
// 
// const locationLine = page.city
//   ? pickVariant(`${page.company_name}:location`, [
//       `${page.company_name} is a registered business entity based in ${page.city}, ${stateName}.`,
//       `${page.company_name} is a company headquartered in ${page.city}, ${stateName}.`,
//       `${page.company_name} operates as a business entity in ${page.city}, ${stateName}.`,
//     ])
//   : pickVariant(...);

// ✅ 新代码应该是：

const locationLine = page.city
  ? `${page.company_name} is a business entity based in ${page.city}, ${stateName}.`
  : `${page.company_name} is registered in ${stateName}.`;

// ---

// ❌ 现有代码：
// const oshaLine = osha.length > 0
//   ? `According to publicly available records, the company has ${osha.length} OSHA inspection records, and ${formatInspectionNarrative(...)}.`
//   : 'According to publicly available records, OSHA inspection records were not observed in the current dataset.';

// ✅ 新代码应该是：

const oshaLine = osha.length > 0
  ? `${page.company_name} has ${osha.length} OSHA inspection record${osha.length > 1 ? 's' : ''} in public government databases. ${formatInspectionNarrative(osha[0]?.inspection_date ?? null, osha[0]?.severity ?? null)}.`
  : `OSHA does not show inspection records for ${page.company_name} in the current public dataset.`;

// ---

// ❌ 现有代码：
// const riskIntro = pickVariant(page.company_name, [
//   'Based on available public records, this company has recorded OSHA inspections...',
//   'Publicly available compliance data shows OSHA inspection activity...',
//   'Available government records indicate...',
// ]);

// ✅ 新代码应该是：

const riskIntro = `Based on public government records, ${page.company_name} has OSHA inspection history. Below is a detailed breakdown of compliance signals to help inform your decision.`;

// ---

// 如果需要快速替换，复制下面的替换对到你的编辑器：

/*
SEARCH (在 app/company/[slug]/page.tsx):
  const locationLine = page.city
    ? pickVariant(`${page.company_name}:location`, [
      `${page.company_name} is a registered business entity based in ${page.city}, ${stateName}.`,
      `${page.company_name} is a company headquartered in ${page.city}, ${stateName}.`,
      `${page.company_name} operates as a business entity in ${page.city}, ${stateName}.`,
    ])
    : pickVariant(`${page.company_name}:location`, [
      `${page.company_name} is a registered business entity based in ${stateName}.`,
      `${page.company_name} is a company operating in ${stateName}.`,
      `${page.company_name} is listed as a business entity in ${stateName}.`,
    ]);

REPLACE WITH:
  const locationLine = page.city
    ? `${page.company_name} is a business entity based in ${page.city}, ${stateName}.`
    : `${page.company_name} is registered in ${stateName}.`;
*/

/*
SEARCH (在 app/company/[slug]/page.tsx):
  const oshaLine = osha.length > 0
    ? `According to publicly available records, the company has ${osha.length} OSHA inspection records, and ${formatInspectionNarrative(osha[0]?.inspection_date ?? null, osha[0]?.severity ?? null)}.`
    : 'According to publicly available records, OSHA inspection records were not observed in the current dataset.';

REPLACE WITH:
  const oshaLine = osha.length > 0
    ? `${page.company_name} has ${osha.length} OSHA inspection record${osha.length > 1 ? 's' : ''} in public government databases. ${formatInspectionNarrative(osha[0]?.inspection_date ?? null, osha[0]?.severity ?? null)}.`
    : `OSHA does not show inspection records for ${page.company_name} in the current public dataset.`;
*/

/*
SEARCH (在 app/company/[slug]/page.tsx):
  const riskIntro = pickVariant(page.company_name, [
    'Based on available public records, this company has recorded OSHA inspections, indicating past workplace safety activity.',
    'Publicly available compliance data shows OSHA inspection activity for this company, indicating prior workplace safety oversight.',
    'Available government records indicate that this company has OSHA inspection history, reflecting prior workplace safety review.',
  ]);

REPLACE WITH:
  const riskIntro = `Based on public government records, ${page.company_name} has OSHA inspection history. Below is a detailed breakdown of compliance signals to help inform your decision.`;
*/
