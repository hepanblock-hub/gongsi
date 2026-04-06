# California Data Status

## 当前结论

- **OSHA**：已有官方公开数据入口，且 DOL Open Data Portal 提供 API 模式，适合做批量拉取与分页导入。
- **California CSLB contractor license**：当前公开看到的是在线查询入口（按 license / business name / personnel / ZIP / city），未确认到官方 bulk download 或公开 API。
- **California Secretary of State company registration**：公开搜索入口存在，但当前未确认到稳定的 bulk download 或公开 API。

## 已加入仓库的可执行能力

- `scripts/ingest_california_osha.mjs`
  - 通过 DOL Open Data API 分页拉取 California OSHA 数据。
  - 清洗公司名、日期、罚款、状态、城市。
  - 回填 `companies`、`osha_inspections`、`company_pages`。
  - 自动写入 `data_sources`。
- `scripts/verify_california_data.mjs`
  - 汇总加州各表行数。
  - 展示 OSHA 日期范围与 Top 城市。

## 运行前需要补的环境变量

在根目录 `.env` 中增加：

- `DOL_API_KEY=你的_dol_api_key`
- `OSHA_DOL_AGENCY=osha`
- `OSHA_DOL_ENDPOINT=从 DOL dataset/query builder 确认的 endpoint`
- `OSHA_DOL_STATE_FIELD=state`
- `OSHA_DOL_LIMIT=1000`
- `OSHA_DOL_MAX_RECORDS=0`

## 为什么 OSHA 脚本做成“可配置 endpoint”

DOL 官方文档已经明确 API 模式为：

- `https://apiprod.dol.gov/v4/get/<agency>/<endpoint>/<format>?...`

但官方开放目录页当前对具体 OSHA enforcement endpoint 暴露得不稳定，且目录接口返回异常。为避免把错误 endpoint 写死到项目里，脚本把 `agency`、`endpoint`、`state_field` 都做成了环境变量。

## 当前边界

- 现在可以把 **California OSHA** 这一路做成真实导入。
- **CSLB** 与 **Secretary of State** 两路尚未确认官方 bulk 源；在没有稳定官方批量接口前，不应该伪造“全量已完成”。
- 如果后续确认这两路只能网页查询，就需要再决定是否接受“合规抓取 + 节流 + 审计日志”的方案。
