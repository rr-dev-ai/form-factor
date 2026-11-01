/**
 * 生成一天的运行记录。
 *
 * 所有数字都从产物推得——池、选择结果、raw、实际内容——不再接受模型自报。
 * 2026-11-01 那次 `fetched: 256`（实际 389）、`durationMs: 303s`（实际 15 分钟）
 * 就是自报的产物，页面上照单全收。
 *
 * 用法：node scripts/merge-runs.mjs YYYY-MM-DD
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { byDate, coverageOf } from '../src/lib/content.ts';
import { industries } from '../src/config/taxonomy.ts';
import { listPools } from './lib/pool.mjs';

const META = path.join(process.cwd(), 'content', '_meta');
const RAW = path.join(process.cwd(), 'content', '_raw');
const POOL = path.join(process.cwd(), 'content', '_pool');

/**
 * 纯函数：不读盘、不写盘。
 * @param {{date: string, docs: any[], broken?: any[], selection: any, items: any[], raw: any, supplement: any}} input
 */
export function buildDayRecord({ date, docs, broken = [], selection, items, raw, supplement }) {
  const list = Array.isArray(items) ? items : [];
  const results = raw?.results ?? [];

  const fetched = results.reduce((sum, row) => sum + (row.count ?? 0), 0);

  const industrySlugs = [...new Set(docs.map((entry) => entry.industry))];
  const dayIndustries = {};
  for (const industry of industrySlugs) {
    const entries = docs.filter((entry) => entry.industry === industry);
    const stat = (key) => entries.reduce((sum, entry) => sum + (entry.doc?.stats?.[key] ?? 0), 0);
    const drafted = entries.reduce((sum, entry) => sum + (entry.doc?.drafts?.length ?? 0), 0);
    dayIndustries[industry] = {
      fetched: results
        .filter((row) => (row.industries ?? []).includes(industry))
        .reduce((sum, row) => sum + (row.count ?? 0), 0),
      afterDedup: Math.max(0, stat('candidates') - stat('skippedByDedup')),
      passed: drafted + list.filter((item) => item.industry === industry).length,
      published: list.filter((item) => item.industry === industry).length,
    };
  }

  const durations = docs.map((entry) => {
    const start = Date.parse(entry.doc?.startedAt ?? '');
    const end = entry.doc?.finishedAt ? Date.parse(entry.doc.finishedAt) : entry.mtimeMs;
    if (Number.isNaN(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, end - start);
  });

  const startedAt =
    docs.map((entry) => entry.doc?.startedAt).filter(Boolean).sort()[0] ?? `${date}T00:00:00+08:00`;
  const coverage = coverageOf(date, list);
  const supplementItems = supplement?.items ?? [];

  return {
    date,
    startedAt,
    // mtimeMs 是浮点，dayRecordSchema 要求整数；取整不然 runs.json 过不了校验，
    // 而那条记录不会自愈——之后每次构建都会在 loadDays() 抛错。
    durationMs: durations.length ? Math.round(Math.max(...durations)) : 0,
    fetched,
    afterDedup: industrySlugs.reduce((sum, slug) => sum + dayIndustries[slug].afterDedup, 0),
    passed: industrySlugs.reduce((sum, slug) => sum + dayIndustries[slug].passed, 0),
    published: list.length,
    industries: dayIndustries,
    regions: coverage.covered.map((region) => region.slug),
    missing: coverage.missing.map((region) => region.slug),
    candidates: docs.reduce((sum, entry) => sum + (entry.doc?.stats?.written ?? 0), 0),
    pooled: docs.reduce((sum, entry) => sum + (entry.doc?.drafts?.length ?? 0), 0),
    fallback: Boolean(selection?.fallback),
    conflicts: selection?.conflicts ?? [],
    supplement: {
      triggered: supplementItems.length > 0,
      items: supplementItems.length,
      sources: supplement?.gap ?? [],
    },
    rejected: docs.flatMap((entry) =>
      (entry.doc?.rejected ?? []).map((row) => ({ title: row.title, reason: row.reason, industry: entry.industry }))
    ),
    failedSources: broken.map((row) => ({ name: `${row.industry} 池`, stage: 'draft', error: row.error })),
    costUsd: 0,
    migrated: false,
  };
}

/** spec §7 的告警口径。days 按日期倒序，days[0] 是今天。 */
export function detectAlerts(days, today) {
  const recent = (days ?? [])
    .filter((day) => day?.date && day.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const alerts = [];

  if (recent.length >= 2 && !recent[0].published && !recent[1].published) {
    alerts.push(`连续两天无发布（${recent[1].date} 起）`);
  }

  if (recent.length >= 3) {
    for (const industry of industries) {
      const counts = recent.slice(0, 3).map((day) => day.industries?.[industry.slug]?.published ?? 0);
      if (counts.every((count) => count < 3)) {
        alerts.push(`行业 ${industry.slug} 连续三天低于 3 条（近三天 ${counts.join('/')}）`);
      }
    }
  }

  return alerts;
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function main() {
  const date = process.argv[2];
  if (!date) {
    console.error('用法：node scripts/merge-runs.mjs YYYY-MM-DD');
    process.exit(2);
  }

  const { docs, broken } = listPools(date, 1);
  const day = buildDayRecord({
    date,
    docs,
    broken,
    selection: readJsonIfExists(path.join(POOL, `${date}.selection.json`)),
    items: byDate(date),
    raw: readJsonIfExists(path.join(RAW, `${date}.json`)),
    supplement: readJsonIfExists(path.join(RAW, `${date}.supplement.json`)),
  });

  const file = path.join(META, 'runs.json');
  const days = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const next = [day, ...days.filter((row) => row.date !== date)].sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  console.log(
    `已写入 ${date}：发布 ${day.published} 条，候选 ${day.candidates}，余量 ${day.pooled}，` +
      `覆盖 ${day.regions.length} 区，缺 ${day.missing.length} 区`
  );
  for (const alert of detectAlerts(next, date)) console.log(`ALERT: ${alert}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
