# Form Factor

追踪三条凭证链路——**SIM/eSIM**、**发卡与收单**、**证照与身份识别**——的形态演进。AI 每日采集、去重、筛选、三语翻译，静态生成，托管于 GitHub Pages。

三条链路共用同一套分析框架：凭证如何被签发、如何被分发、如何被受理，以及物理载体如何一步步消失。详见 `docs/requirements-outline.md` §1.1。

当前状态：**已接入真实采集**。电信链路跑通一次完整抓取（21 个源、276 条原始条目、55 条命中），支付链路入库一条；身份链路尚未开始。

- 来源池：`config/sources.json`（60 个启用，7 个已放弃）
- 抓取：`node scripts/fetch-sources.mjs --rss-only`

> 需求文档、运维编排、来源调研与 `AGENTS.md` 只保存在本地，不进入远端仓库。远端仅承载构建产物所需的最小文件集。

前端改版前请先读本地的 `AGENTS.md`——核心是一条：让版式承担解释，不用标签和说明文字替代排版。

## 命令

```bash
npm install      # 首次
npm run dev      # 本地开发 http://localhost:4321
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

## 目录

```
content/
  news/YYYY/MM/{id}.json   ← 一条新闻一个文件，唯一内容源
  _meta/runs.json          ← 每日运行记录，供 /status 展示
  _seeds/                  ← 样例数据源，仅用于生成初始文件
src/
  config/site.ts           ← 站名、语言、indexable 开关、时区
  config/taxonomy.ts       ← 行业与标签定义（3 行业 / 23 标签）
  lib/schema.ts            ← zod 契约（改字段必须同步所有内容）
  lib/content.ts           ← 读取 + 校验 + 聚合
  lib/search.ts            ← 分词与索引配置
  pages/[lang]/            ← 三语路由
  pages/search-index/      ← 搜索索引分片端点
scripts/split-seeds.mjs    ← 把 _seeds 拆成一条一文件
```

## 内容契约

一条新闻的字段定义在 `src/lib/schema.ts`，核心约束：

- `title` / `summary` / `whyItMatters` 必须三语齐全（`zh` / `en` / `es`）
- `sources` 至少一条，URL 必须是 http(s)
- `tags` 必须在 `taxonomy.ts` 中已定义，否则构建失败
- `slug` 与 `id` 全局唯一
- `publishedAt` 决定归档到哪一天（按 `site.timeZone` 换算）

任何一条不满足，`npm run build` 会中止并打印「文件路径 + 字段名 + 原因」。这是无人值守模式下的第一道门禁，不要绕过它。

## 新增内容

1. 在 `content/news/YYYY/MM/` 下新建 `{id}.json`
2. `npm run build` 验证
3. 提交并推送，GitHub Actions 自动发布

## 部署

首次：

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
2. 推送到 `main`，`.github/workflows/deploy.yml` 自动构建发布

若部署为项目站（`username.github.io/repo`）而非用户站，需在 `astro.config.mjs` 把 `base` 改为 `'/repo'`，页面内链接已统一走 `src/lib/url.ts`，无需逐处修改。

## 已知待办

- [ ] 39 个 scrape 源尚未配解析规则，当前只跑 RSS
- [ ] G1 门禁的标题相似度与链接可达性校验未实现
- [ ] 搜索历史月份按需加载未实现
- [ ] 身份链路尚未接入采集
- [ ] 远程仓库与 Git 凭据未配置，定时任务无法推送
