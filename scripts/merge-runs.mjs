/**
 * 合并三个行业编辑任务写下的 partial，生成一天的运行记录。
 *
 * 用法：node scripts/merge-runs.mjs YYYY-MM-DD
 * 读 content/_meta/runs.partial-*.json，合并后写回 runs.json，再删除 partial。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { coverageOf } from '../src/lib/content.ts';

const META = path.join(process.cwd(), 'content', '_meta');

/**
 * 纯合并：不读盘、不写盘。四个计数由各行业求和得出，
 * 缺席的行业不补 0——「没有记录」和「记了 0 条」不是一回事。
 */
export function mergePartials(partials) {
  if (!partials.length) throw new Error('没有可合并的 partial');
  const dates = new Set(partials.map((p) => p.date));
  if (dates.size > 1) throw new Error(`partial 的 date 不一致：${[...dates].join(', ')}`);

  const industries = {};
  const rejected = [];
  const failed = new Map();
  const supplement = { triggered: false, items: 0, sources: [] };
  let costUsd = 0;

  for (const partial of partials) {
    Object.assign(industries, partial.industries ?? {});
    rejected.push(...(partial.rejected ?? []));
    for (const item of partial.failedSources ?? []) {
      failed.set(`${item.name}|${item.error}`, item);
    }
    costUsd += partial.costUsd ?? 0;
    if (partial.supplement?.triggered) {
      supplement.triggered = true;
      supplement.items += partial.supplement.items ?? 0;
      supplement.sources.push(...(partial.supplement.sources ?? []));
    }
  }

  const sum = (key) =>
    Object.values(industries).reduce((acc, entry) => acc + (entry[key] ?? 0), 0);

  return {
    date: partials[0].date,
    startedAt: partials.map((p) => p.startedAt).sort()[0],
    durationMs: Math.max(...partials.map((p) => p.durationMs ?? 0)),
    fetched: sum('fetched'),
    afterDedup: sum('afterDedup'),
    passed: sum('passed'),
    published: sum('published'),
    industries,
    regions: [],
    missing: [],
    supplement,
    rejected,
    failedSources: [...failed.values()],
    costUsd: Number(costUsd.toFixed(4)),
    migrated: false,
  };
}

function main() {
  const date = process.argv[2];
  if (!date) {
    console.error('用法：node scripts/merge-runs.mjs YYYY-MM-DD');
    process.exit(2);
  }

  const partials = fs
    .readdirSync(META)
    .filter((name) => name.startsWith('runs.partial-') && name.endsWith('.json'))
    .map((name) => ({ file: path.join(META, name), data: JSON.parse(fs.readFileSync(path.join(META, name), 'utf8')) }))
    .filter((entry) => !entry.data.date || entry.data.date === date);

  if (!partials.length) {
    console.log(`没有 ${date} 的 partial，未做改动`);
    return;
  }

  const day = mergePartials(partials.map((entry) => entry.data));
  const coverage = coverageOf(date);
  day.regions = coverage.covered.map((region) => region.slug);
  day.missing = coverage.missing.map((region) => region.slug);

  const file = path.join(META, 'runs.json');
  const days = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const next = [day, ...days.filter((item) => item.date !== date)].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  for (const entry of partials) fs.unlinkSync(entry.file);

  console.log(
    `已合并 ${date}：发布 ${day.published} 条，覆盖 ${day.regions.length} 区，缺 ${day.missing.length} 区，清理 partial ${partials.length} 个`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
