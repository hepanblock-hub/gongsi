# Gongsihegui SEO 审计报告 & 修复方案
**日期**: 2026年5月1日  
**项目**: Gongsihegui (公司合规审查平台)

---

## 📊 审计总结

**收录下降主要原因**：
1. **❌ Sitemap 不完整** — 百万级 company 页面完全不在 sitemap
2. **❌ 页面内容过度机械化** — `pickVariant()` 生成相似句式，Google 判定为低质
3. **⚠️ 标题和描述不够优化** — 缺乏关键词和地域信息
4. **⚠️ 内链结构薄弱** — 页面间关系未充分建立
5. **⚠️ H1/H2 标题层级混乱** — 影响语义理解

---

## 🔍 逐页面审计详情

### 📄 1. 首页 (Home Page)

**现状：**
```
Title: "Compliance Lookup | OSHA, License & Registration Records"
Description: "Search public compliance records for companies and contractors..."
```

**问题：**
- ✓ 标题可接受，但缺乏地域信息 (完全美国化，可能不够精准)
- ⚠️ 第一段内容过于类似模板，开头重复多次 "Compliance Lookup"
- ⚠️ 内容段落雷同，没有独特价值主张

**修复建议：**
```
标题改为（加入结构化关键词）:
"Company Compliance Lookup | OSHA Violations, Contractor License & Registration Records"

描述改为:
"Find public OSHA inspection records, contractor license status, and business registration details for companies across all US states. Verify compliance history before hiring contractors."

首段改为（消除重复）:
"Gongsihegui provides comprehensive access to public company compliance records across the United States. Search OSHA violations, contractor license status, business registration status, and workplace safety history for millions of companies."
```

---

### 📄 2. 公司页面 (Company Page) — **最严重**

**现状：**
- 完全 **不在 sitemap** 中
- 页面标题: `{companyName} OSHA Violations & License Status in {city}, {state}` ✓ OK
- 内容: 大量使用 `pickVariant()` 生成随机相似句式

**问题代码：**
```typescript
const locationLine = pickVariant(`${page.company_name}:location`, [
  `${page.company_name} is a registered business entity based in ${page.city}, ${stateName}.`,
  `${page.company_name} is a company headquartered in ${page.city}, ${stateName}.`,
  `${page.company_name} operates as a business entity in ${page.city}, ${stateName}.`,
])

const oshaLine = osha.length > 0
  ? `According to publicly available records, the company has ${osha.length} OSHA inspection records...`
  : 'According to publicly available records, OSHA inspection records were not observed...'
```

**Google 看到什么：**
- 相同的开头短语 ("According to publicly available records")
- 相似的句式结构 → 判定为 **低质量生成内容** (AI-generated content signal)
- 同一公司在不同访问时页面文本不同 → 内容不稳定 (algorithmic signal: inconsistency)

**修复建议：**
1. **删除所有 `pickVariant()`** → 使用单一、高质量的文本
2. **增加独特内容** → 行业背景、安全建议、验证步骤
3. **加入 sitemap** → 最关键！

**修复文本示例：**
```typescript
// ❌ 现在 (3个几乎相同的变体)
const locationLine = pickVariant(...)

// ✅ 改为 (单一版本)
const locationLine = 
  page.city 
    ? `${page.company_name} is a business entity based in ${page.city}, ${stateName}.`
    : `${page.company_name} is registered in ${stateName}.`;

// ✅ 增加独特内容
const industryContext = `${getIndustryWarning(page.company_name)}. 
  Before hiring, verify current status through official ${stateName} licensing portals.`;
```

---

### 📄 3. 州页面 (State Page)

**现状：**
```
Title: "{stateName} — Company Compliance Lookup | OSHA Records by State"
Description: "Browse {stateName} companies with OSHA violations, contractor licenses, and registration records..."
```

**问题：**
- ⚠️ 标题太长，不够吸引人
- ⚠️ 缺乏关键词多样性 (只关注 "OSHA" 和 "compliance")
- ✓ 内容质量相对好

**修复建议：**
```
标题改为（更短、更吸引、包含关键词变体）:
"{stateName} Contractor License Lookup & OSHA Violations | Company Compliance"

描述改为:
"Search {stateName} contractors and companies by OSHA violations, license status, and registration. Verify compliance history before hiring. Free public records lookup."

H1改为（更吸引）:
"Find {stateName} Contractors with OSHA Violations and License Status"
（而不是 "Company Compliance Lookup in {stateName}"）
```

---

### 📄 4. 城市页面 (City Page)

**现状：**
- 标题: 动态生成，接受
- 内容: 主要是公司列表表格

**问题：**
- ⚠️ 新用户不太明白为什么看这个城市的公司
- ⚠️ 缺乏城市背景信息 (人口, 主要产业等)
- ⚠️ H2 标题不够优化

**修复建议：**
```
加入城市背景段落 (50-80字):
"Example: Austin, Texas is a growing tech hub with ~950,000 residents. Below are Austin-based contractors and companies with public compliance records. Search by license status, OSHA violations, and inspection history."

改进表格标题:
"Austin Contractors & Companies with Public Compliance Records" 
（而不是 "Indexed Companies"）
```

---

### 📄 5. 城市列表页 (State → Cities Index)

**现状：**
```
Title: "{stateName} Cities Overview | OSHA, License & Company Records"
Description: "Browse cities in {stateName} with public compliance records..."
```

**问题：**
- ✓ 不错，但可以更优化

**修复建议：**
```
Title 改为:
"Browse All {stateName} Cities with Contractor License & OSHA Records"

Description 改为:
"Find contractors and companies in {stateName} cities. Search by city for OSHA violations, license status, and registration details. Free public compliance records lookup."
```

---

## 🛠️ 立即需要做的修复（按优先级）

### 🔴 优先级 1（紧急）

#### 修复 1.1: 添加 Company 页面到 Sitemap
**作用**: 让 Google 发现 100+ 万个 company 页面  
**文件**: `app/sitemap-companies-index.xml/route.ts`  
**预计恢复周期**: 2-4 周

```typescript
// 创建分片 URL 列表（避免单个 sitemap >50k URL）
// 每个分片包含 50,000 个 company URL
```

#### 修复 1.2: 删除页面文本的 `pickVariant()` 调用
**作用**: 停止生成相似内容  
**文件**: `app/company/[slug]/page.tsx`  
**影响**: 
- 公司页面从"低质"变为"高质"
- 预计 2-3 周后 Google 重新爬取并重新评分

**改动量**: ~15-20 处文本生成代码需要改

---

### 🟠 优先级 2（高）

#### 修复 2.1: 优化所有页面的 Title 和 Description
**文件**: 
- `app/page.tsx` (首页元数据)
- `app/state/[stateSlug]/page.tsx` (州页元数据)
- `app/state/[stateSlug]/city/[citySlug]/page.tsx` (城市页元数据)

**行动**: 按照上面建议改动 generateMetadata 函数

#### 修复 2.2: 在城市和州页面加入描述性文本段落
**文件**: 
- `app/state/[stateSlug]/city/[citySlug]/page.tsx`
- `app/state/[stateSlug]/page.tsx`

**文本量**: 各加入 1-2 段 (100-150 字)

---

### 🟡 优先级 3（中）

#### 修复 3.1: 改进 H1/H2 标题层级
**文件**: 所有页面的 PageTitle 和 SectionCard 组件

#### 修复 3.2: 增强内链
**方向**: 在州页链接到城市页；城市页链接到公司页

---

## 📈 预期效果

| 修复 | 收录提升 | 排名提升 | 时间 |
|------|---------|---------|------|
| Sitemap + company 页面 | **+50-70%** | +1-2 位 | 2-4w |
| 删除 pickVariant | **+20-30%** | +2-5 位 | 3-6w |
| 优化 Title/Desc | **+10-15%** | +1-2 位 | 1-2w |
| 加入描述性文本 | **+15-25%** | +1-3 位 | 2-4w |
| **总体预期** | **+100-150%** | **+5-15 位** | **6-10w** |

---

## 🚀 完整修复代码（下一步）

需要我帮你生成以下文件吗？
1. ✅ `app/sitemap-companies-index.xml/route.ts` (company sitemap)
2. ✅ 修改 `app/company/[slug]/page.tsx` (删除 pickVariant)
3. ✅ 修改所有 generateMetadata 函数
4. ✅ 补充城市页面描述文本
5. ✅ 优化州页面描述文本

---

## 📌 注意

- **立即向 Google Search Console 提交**: Sitemap 更新后，手动提交新的 sitemap-companies-index.xml
- **请求重新爬取**: 在 GSC 中提交 2-3 个重要的 company URL 给 Google
- **监控**: 两周后检查收录数量，四周后检查排名变化
