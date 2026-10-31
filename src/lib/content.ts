import fs from 'node:fs';
import path from 'node:path';
import { newsItemSchema, runRecordSchema, type NewsItem, type RunRecord } from './schema.ts';
import { tagName, tags } from '../config/taxonomy.ts';
import { regionIssues, coveredRegions, type Region, type RegionSlug } from '../config/regions.ts';
import { site } from '../config/site.ts';

const ROOT = process.cwd();
const NEWS_DIR = path.join(ROOT, 'content', 'news');
const META_DIR = path.join(ROOT, 'content', '_meta');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

let cache: NewsItem[] | null = null;

/**
 * 读取并校验全部内容。任何一份文件不合规都会中止构建，
 * 并打印文件路径与出错字段——这是无人值守模式下第一道硬门禁。
 */
export function loadNews(): NewsItem[] {
  if (cache) return cache;

  const knownTags = new Set(tags.map((t) => t.slug));
  const items: NewsItem[] = [];
  const errors: string[] = [];
  const seenSlug = new Map<string, string>();
  const seenId = new Map<string, string>();

  for (const file of walk(NEWS_DIR)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`${rel}\n  · JSON 解析失败：${(err as Error).message}`);
      continue;
    }

    const parsed = newsItemSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `  · ${i.path.join('.') || '(根节点)'}：${i.message}`)
        .join('\n');
      errors.push(`${rel}\n${detail}`);
      continue;
    }

    const item = parsed.data;

    const unknown = item.tags.filter((t) => !knownTags.has(t));
    if (unknown.length) {
      errors.push(`${rel}\n  · 未在 taxonomy 中定义的标签：${unknown.join(', ')}`);
      continue;
    }

    const regionProblem = regionIssues(item);
    if (regionProblem.length) {
      errors.push(`${rel}\n  · ${regionProblem.join('；')}`);
      continue;
    }

    if (seenSlug.has(item.slug)) {
      errors.push(`${rel}\n  · slug 与 ${seenSlug.get(item.slug)} 重复：${item.slug}`);
      continue;
    }
    if (seenId.has(item.id)) {
      errors.push(`${rel}\n  · id 与 ${seenId.get(item.id)} 重复：${item.id}`);
      continue;
    }

    seenSlug.set(item.slug, rel);
    seenId.set(item.id, rel);
    items.push(item);
  }

  if (errors.length) {
    throw new Error(`内容校验失败，共 ${errors.length} 处：\n\n${errors.join('\n\n')}`);
  }

  // 同一批次发布的内容时间戳相同，此时按置信度降序，
  // 避免"抓取顺序"变成"重要性顺序"
  items.sort((a, b) => {
    const byTime = b.publishedAt.localeCompare(a.publishedAt);
    return byTime !== 0 ? byTime : b.confidence - a.confidence;
  });
  cache = items;
  return items;
}

/** 对外可见的内容：已发布，不含被撤下的 */
export function publishedNews(): NewsItem[] {
  return loadNews().filter((n) => n.status === 'published');
}

export function byIndustry(slug: string): NewsItem[] {
  return publishedNews().filter((n) => n.industry === slug);
}

export function byTag(slug: string): NewsItem[] {
  return publishedNews().filter((n) => n.tags.includes(slug));
}

/** 主区域在前，涉及区域在后，去重。筛选用它；覆盖统计用主区域。 */
export function allRegions(item: NewsItem): string[] {
  return [item.region, ...item.regions.filter((r) => r !== item.region)];
}

/** 把带时区的时间归入站点时区的日期，用于日期归档页 */
export function toDateKey(iso: string, timeZone = site.timeZone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function byDate(dateKey: string): NewsItem[] {
  return publishedNews().filter((n) => toDateKey(n.publishedAt) === dateKey);
}

/** 按日历日加减，输入输出都是站点时区的 YYYY-MM-DD */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * 某天的区域覆盖。只按主区域统计——用 regions 统计会让一条七市场通稿
 * 被算成七次覆盖。global 不计入门槛。
 */
export function coverageOf(
  dateKey: string,
  items: NewsItem[] = publishedNews()
): { covered: Region[]; missing: Region[] } {
  const present = new Set(
    items.filter((i) => toDateKey(i.publishedAt) === dateKey).map((i) => i.region)
  );
  return {
    covered: coveredRegions.filter((r) => present.has(r.slug)),
    missing: coveredRegions.filter((r) => !present.has(r.slug)),
  };
}

/** 以某天为终点，往前 days 个自然日里各区域各有几天有稿 */
export function regionCoverage(
  latestDateKey: string,
  days: number,
  items: NewsItem[] = publishedNews()
): { slug: RegionSlug; days: number; total: number }[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const key = shiftDateKey(latestDateKey, -i);
    const present = new Set(
      items.filter((it) => toDateKey(it.publishedAt) === key).map((it) => it.region)
    );
    for (const slug of present) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return coveredRegions.map((r) => ({
    slug: r.slug,
    days: counts.get(r.slug) ?? 0,
    total: days,
  }));
}

export function allDateKeys(): string[] {
  const set = new Set(publishedNews().map((n) => toDateKey(n.publishedAt)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

/** 按月分组，用于归档索引与搜索索引分片 */
export function groupByMonth(dateKeys: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key of dateKeys) {
    const month = key.slice(0, 7);
    const list = map.get(month) ?? [];
    list.push(key);
    map.set(month, list);
  }
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

export function latestDateKey(): string | null {
  return allDateKeys()[0] ?? null;
}

/** 当条内容涉及的全部标签名（用于详情页与搜索） */
export function localizedTagNames(item: NewsItem, locale: 'zh' | 'en' | 'es'): string[] {
  return item.tags.map((t) => tagName(t, locale));
}

let runsCache: RunRecord[] | null = null;

export function loadRuns(): RunRecord[] {
  if (runsCache) return runsCache;
  const file = path.join(META_DIR, 'runs.json');
  if (!fs.existsSync(file)) {
    runsCache = [];
    return runsCache;
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const parsed = runRecordSchema.array().safeParse(raw);
  if (!parsed.success) {
    throw new Error(`content/_meta/runs.json 校验失败：\n${parsed.error.issues.map((i) => `  · ${i.path.join('.')}：${i.message}`).join('\n')}`);
  }
  runsCache = parsed.data.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  return runsCache;
}
