# Gongsihegui SEO 修复 - 完整执行清单

## ✅ 已完成的修复

### 1. ✅ Company 页面文本质量优化
**文件**: `app/company/[slug]/page.tsx`  
**修改**: 
- ✅ 删除 `locationLine` 的 pickVariant (3→1)  
- ✅ 删除 `oshaLine` 的 pickVariant (2→1)
- ✅ 删除 `riskIntro` 的 pickVariant (3→1)
- ✅ 增加独特价值内容（验证指导）

**预期效果**: Google 重新评分，识别为"高质内容" 而非 "AI生成"  
**时间**: 1-2 周后 Google 重新爬取，排名提升

---

## 🔄 需要手工完成的修复

### 2. 📝 优化所有页面 Metadata（标题和描述）

| 页面 | 文件 | 优先级 | 预期CTR↑ |
|------|------|--------|---------|
| 首页 | `app/page.tsx` | 🔴 高 | +20% |
| 州页 | `app/state/[stateSlug]/page.tsx` | 🔴 高 | +15% |
| 城市列表 | `app/state/[stateSlug]/cities/page.tsx` | 🟡 中 | +10% |
| 城市页 | `app/state/[stateSlug]/city/[citySlug]/page.tsx` | 🟡 中 | +15% |

**修改指南**: 查看 `SEO_FIX_METADATA.md` 获取具体替换文本

---

### 3. 📊 Company 页面 Sitemap（可选+高价值）

**方式**: 分片生成 sitemap (每片 50k 个 URL)  
**难度**: ⭐⭐⭐  
**影响**: 🎯 最高（发现 100+ 万个页面）

暂时建议：  
- 先完成上述 2 个修复并观察排名变化
- 2-3 周后如排名未改善，再实施 Sitemap 修复

---

## 🚀 立即执行的 Git 命令

```bash
cd d:\gongsihegui

# 1. 检查修改
git status

# 2. 提交已完成的修复
git add app/company/\[slug\]/page.tsx
git commit -m "fix(seo): remove AI-generated text variations from company pages"

# 3. 推送到远程
git push
```

---

## 📋 后续手工操作清单

**今天/明天完成：**
- [ ] 打开 `SEO_FIX_METADATA.md`
- [ ] 修改首页 metadata (Title + Description)
- [ ] 修改州页 generateMetadata 函数
- [ ] 修改城市页面 metadata
- [ ] git add + commit + push

**一周后：**
- [ ] 在 Google Search Console 手动刷新 Sitemap (`https://yourcitycompliancelookup.com/sitemap.xml`)
- [ ] 提交 5-10 个 company 页面 URL 给 Google 重新爬取

**两周后：**
- [ ] 检查 GSC → Performance 报告
- [ ] 查看排名是否上升

**四周后：**
- [ ] 汇总数据，评估修复效果
- [ ] 如需进一步优化，申请 Sitemap 修复

---

## 📊 预期修复效果时间表

```
Day 0:    修改代码 + 推送 ✅
Day 1-3:  Google Bot 抓取新内容
Day 7-14: Google 重新评分 
          预期: 排名↑ 1-3 位, CTR↑ 15-20%
Day 21-30: 累积排名提升明显
          预期: 总体排名↑ 3-8 位, 收录稳定
```

---

##注意

❌ **请勿做以下事情**:
- 删除旧内容（旧链接要保持 redirect）
- 大量改动其他页面（可能引入新问题）
- 过度优化（堆砌关键词）

✅ **推荐做以下**:
- 按步骤修改（一个修复→验证效果→下一个）
- 监控 GSC 数据
- 保持现有内链结构

---

## 📞 如需帮助

文件参考：
- `SEO_AUDIT_REPORT.md` - 完整审计看板
- `SEO_FIX_COMPANY_PAGE.md` - Company 页面修复详情
- `SEO_FIX_METADATA.md` - Metadata 修复详情
- `SEO_FIX_TASKS.md` - 任务分解
