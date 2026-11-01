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
import { tags } from '../src/config/taxonomy.ts';
import { regionIssues } from '../src/config/regions.ts';
import { listPools, POOL_DIR, writePool } from './lib/pool.mjs';
import { selectDrafts } from './select-drafts.mjs';

const KNOWN_TAGS = new Set(tags.map((t) => t.slug));

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

    // 池缺 startedAt 时用编辑窗口起点兜底：宁可记一个近似值，也不要整池作废。
    const ingestedAt = pool.doc.startedAt ?? `${date}T02:30:00+08:00`;
    const item = { ...draft, status: 'published', publishedAt, ingestedAt };
    const parsed = newsItemSchema.safeParse(item);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(根节点)'}: ${i.message}`).join('; ');
      skipped.push({ slug: draft.slug, reason: `invalid: ${detail}` });
      continue;
    }

    // zod 表达不了跨字段规则，这两项由 loadNews() 在构建时兜底；
    // 在这里先拦一道，免得坏稿落进 content/news 之后才让整站构建失败。
    const unknownTags = (item.tags ?? []).filter((tag) => !KNOWN_TAGS.has(tag));
    const crossField = regionIssues(item);
    if (unknownTags.length || crossField.length) {
      const detail = [...unknownTags.map((tag) => `未在 taxonomy 中定义的标签：${tag}`), ...crossField].join('; ');
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

  // 读 3 天：草稿能在池里留 72 小时，昨天的稿今天照样可以被提升。
  // 只读当天会让终审选出一批找不到的条目，当晚白选。
  const { docs, broken } = listPools(date, 3);

  let selection;
  if (target === '--auto' || !target) {
    const indexFile = path.join(process.cwd(), 'content', '_raw', `${date}.index.json`);
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;
    selection = selectDrafts({ docs, broken, index, date, now: new Date() });
    selection.fallback = true;
    // 落盘：merge-runs 只读 selection.json，不写下来 fallback 永远是 false。
    fs.mkdirSync(POOL_DIR, { recursive: true });
    fs.writeFileSync(path.join(POOL_DIR, `${date}.selection.json`), `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
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
    // writePool 用 doc 内的 date/industry 拼路径，以 listPools 的键为准，
    // 否则内容字段一旦缺失就会写到 undefined-banking.json，真池子永远清不掉。
    pools[i].doc.date = pools[i].date;
    pools[i].doc.industry = pools[i].industry;
    writePool(pools[i].doc);
  }

  console.log(`已写入 ${written.length} 条，跳过 ${skipped.length} 条`);
  for (const row of skipped) console.log(`  · ${row.slug}：${row.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
