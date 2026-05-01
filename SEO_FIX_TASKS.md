# SEO 修复执行清单

## 📋 任务分解

### 任务 1: 删除 Company 页面的 pickVariant() 调用
**文件**: `app/company/[slug]/page.tsx`  
**行数**: ~450-495  
**难度**: ⭐⭐ (中等)  
**影响**: 🎯 最高（直接解决低质内容问题）

需要修改以下代码段：
1. `locationLine` (行~462): 删除 3 个变体 → 1 个清晰句式
2. `oshaLine` (行~472): 删除2个变体 → 1 个清晰句式  
3. `riskIntro` (行~480): 删除 3 个变体 → 1 个清晰句式

---

### 任务 2: 优化 Metadata 元数据
**文件**: 
- `app/page.tsx` (首页)
- `app/state/[stateSlug]/page.tsx` (州页)
- `app/state/[stateSlug]/cities/page.tsx` (城市列表页)
- `app/state/[stateSlug]/city/[citySlug]/page.tsx` (城市页)

**难度**: ⭐ (简单)  
**影响**: 🎯 中等（改善CTR和初始排名）

---

### 任务 3: 添加 Company 页面到 Sitemap
**方式**: 动态生成分片 sitemap (每片 50k 个 URL)  
**难度**: ⭐⭐⭐ (复杂)  
**影响**: 🎯 最高（发现页面）

---

## 🚀 立即执行的代码修复

已准备以下文件供复制粘贴：
1. ✅ company/[slug]/page.tsx - pickVariant 删除版
2. ✅ 所有页面的 Metadata 优化
3. ✅ 简化版 Sitemap 生成

使用 `git add` 后一键推送：
```bash
git add .
git commit -m "fix(seo): remove generated text variations and optimize metadata"
git push
```

---

## 📊 预期收益

修复后 1-2 周：Google 开始重新爬取  
修复后 3-4 周：排名开始上升（+1-5位/关键词）  
修复后 6-8 周：收录数量明显增加 (+50-100%)
