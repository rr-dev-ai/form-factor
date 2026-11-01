/**
 * 把选中的草稿提升为正式内容。
 *
 * 只做机械动作：补 status / publishedAt / ingestedAt，校验唯一性与合法性，
 * 写进 content/news，再从池里移出。不判断该不该发——那是 select 和终审的事。
 *
 * 用法：node scripts/promote-drafts.mjs <date> <selection.json>
 *       node scripts/promote-drafts.mjs <date> --auto
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { newsItemSchema } from '../src/lib/schema.ts';
import { loadNews } from '../src/lib/content.ts';
import { listPools, writePool } from './lib/pool.mjs';
import { selectDrafts } from './select-drafts.mjs';

/** 站点时区固定 +08:00（Asia/Shanghai 无夏令时），只为把 now 格式化成带偏移的 ISO。 */
export function formatIso(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function nextIndexFor(existing, date, industry) {
  const pattern = new RegExp(`^${date}-${industry}-(\\d+)$`);
  let max = 0;
  for (const item of existing) {
    const matched = pattern.exec(item.id ?? '');
    if (matched) max = Math.max(max, Number(matched[1]));
  }
  return max + 1;
}

/**
 * 纯函数：不写盘，返回要写的内容。
 * @returns {{written: {slug: string, path: string, item: any}[], skipped: {slug: string, reason: string}[], pools: any[]}}
 */
export function promote({ date, selection, docs, existing, now, newsDir }) {
  const written = [];
  const skipped = [];
  const pools = docs.map((entry) => ({ ...entry, doc: { ...entry.doc, drafts: [...(entry.doc?.drafts ?? [])] } }));

  const idBySlug = new Map(existing.map((item) => [item.slug, item.id]));
  const seenId = new Set(existing.map((item) => item.id));
  const publishedAt = formatIso(now);
  const nextByIndustry = new Map();

  for (const entry of selection.selected ?? []) {
    const pool = pools.find((p) => p.industry === entry.industry && (p.doc.drafts ?? []).some((d) => d.slug === entry.slug));
    if (!pool) {
      skipped.push({ slug: entry.slug, reason: 'draft-missing' });
      continue;
    }

    const draft = pool.doc.drafts.find((d) => d.slug === entry.slug);

    if (idBySlug.has(draft.slug)) {
      const reason = idBySlug.get(draft.slug) === draft.id ? 'already-exists' : 'slug-conflict';
      skipped.push({ slug: draft.slug, reason });
      continue;
    }
    if (seenId.has(draft.id)) {
      skipped.push({ slug: draft.slug, reason: 'id-conflict' });
      continue;
    }

    const item = { ...draft, status: 'published', publishedAt, ingestedAt: pool.doc.startedAt };
    const parsed = newsItemSchema.safeParse(item);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(根节点)'}: ${i.message}`).join('; ');
      skipped.push({ slug: draft.slug, reason: `invalid: ${detail}` });
      continue;
    }

    if (!nextByIndustry.has(entry.industry)) {
      nextByIndustry.set(entry.industry, nextIndexFor(existing, date, entry.industry));
    }
    const seq = String(nextByIndustry.get(entry.industry)).padStart(2, '0');
    nextByIndustry.set(entry.industry, nextByIndustry.get(entry.industry) + 1);

    const fileName = `${date}-${entry.industry}-${seq}.json`;
    written.push({
      slug: draft.slug,
      path: path.join(newsDir, date.slice(0, 4), date.slice(5, 7), fileName),
      item: parsed.data,
    });

    idBySlug.set(draft.slug, draft.id);
    seenId.add(draft.id);
    pool.doc.drafts = pool.doc.drafts.filter((d) => d.slug !== draft.slug);
  }

  return { written, skipped, pools };
}

function main() {
  const date = process.argv[2];
  const target = process.argv[3];
  if (!date) {
    console.error('用法：node scripts/promote-drafts.mjs <date> <selection.json> | --auto');
    process.exit(2);
  }

  const { docs, broken } = listPools(date, 1);

  let selection;
  if (target === '--auto' || !target) {
    const indexFile = path.join(process.cwd(), 'content', '_raw', `${date}.index.json`);
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;
    selection = selectDrafts({ docs, broken, index, date, now: new Date() });
    selection.fallback = true;
  } else {
    selection = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), target), 'utf8'));
  }

  const existing = loadNews();
  const newsDir = path.join(process.cwd(), 'content', 'news');
  const { written, skipped, pools } = promote({ date, selection, docs, existing, now: new Date(), newsDir });

  for (const row of written) {
    fs.mkdirSync(path.dirname(row.path), { recursive: true });
    fs.writeFileSync(row.path, `${JSON.stringify(row.item, null, 2)}\n`, 'utf8');
  }

  // 回写池：先把编辑收工时刻记下来，再写。回写会刷新 mtime，不记就再也算不出耗时。
  for (let i = 0; i < pools.length; i += 1) {
    if (pools[i].doc.drafts.length === (docs[i].doc?.drafts ?? []).length) continue;
    pools[i].doc.finishedAt = new Date(pools[i].mtimeMs).toISOString();
    writePool(pools[i].doc);
  }

  console.log(`已写入 ${written.length} 条，跳过 ${skipped.length} 条`);
  for (const row of skipped) console.log(`  · ${row.slug}：${row.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
