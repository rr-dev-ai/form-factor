/**
 * 抓取阶段的「见过就不再交给标注」清单。
 *
 * 72 小时窗口 + 每天抓一次，同一篇稿子必然被抓三次。只对比前一天不够：
 * D+1 被过滤后它就不在 D+1 的 raw 里，D+2 会重新冒出来。所以按日期滚动取并集。
 *
 * 三类来源，缺一不可：
 * - content/news：已发布，永久计入
 * - 前 N 天 _raw：抓过的。包含「出现过但没进池」的条目——它们已经占过一天的
 *   标注预算，重新给一遍只是重复劳动（2026-11-06 的决定）。
 * - 前 N 天 _pool：草稿与拒稿。拒稿可能引用 raw 里没有的 URL（编辑自己搜的），
 *   只扫 raw 会漏掉这一类。
 *
 * 只做字符串比对。跨源转载换了 URL 拦不住，那是编辑环节的判据，不是这里的。
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * 纯日历加减，不经过 Date 的时区换算。
 * 与 src/lib/content.ts 的 shiftDateKey 同义，这里不 import 它是为了让本模块
 * 能被 GitHub Actions 上的 node 直接跑，不依赖 TS 加载器。
 */
export function shiftDateKey(date, delta) {
  const [year, month, day] = String(date).split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day) + delta * 86400000;
  const next = new Date(stamp);
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * 纯函数：不读盘。
 * 返回 Map<url, 日期>。同一个 URL 出现多次时保留先遍历到的那个日期：
 * news 在前，所以已发布的记发布日；raw 从昨天往回，所以抓过的记最近一次抓到的日期。
 *
 * @param {{news?: any[], raws?: {date: string, doc: any}[], pools?: {date: string, doc: any}[]}} input
 */
export function seenUrlsFrom({ news = [], raws = [], pools = [] }) {
  const seen = new Map();

  const put = (url, at) => {
    if (typeof url !== 'string' || url.length === 0) return;
    if (!seen.has(url)) seen.set(url, at);
  };

  for (const item of news) {
    const at = typeof item?.publishedAt === 'string' ? item.publishedAt.slice(0, 10) : 'published';
    for (const source of item?.sources ?? []) put(source?.url, at);
  }

  for (const entry of raws) {
    const at = entry?.date ?? 'raw';
    for (const result of entry?.doc?.results ?? []) {
      for (const item of result?.items ?? []) put(item?.url, at);
    }
  }

  for (const entry of pools) {
    const at = entry?.date ?? 'pool';
    for (const draft of entry?.doc?.drafts ?? []) {
      for (const source of draft?.sources ?? []) put(source?.url, at);
    }
    for (const rejection of entry?.doc?.rejected ?? []) put(rejection?.url, at);
  }

  return seen;
}

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 读盘。坏文件一律跳过：抓取阶段不该因为一份池文件写了一半就整批失败，
 * 内容合规由构建期的 loadNews() 兜底。
 *
 * @param {{root?: string, date: string, days?: number, newsDir?: string, rawDir?: string, poolDir?: string}} input
 */
export function readSeenInputs({
  root = process.cwd(),
  date,
  days = 3,
  newsDir,
  rawDir,
  poolDir,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    throw new Error(`readSeenInputs 需要 YYYY-MM-DD 的 date，收到：${date}`);
  }

  const news = [];
  for (const file of walkJson(newsDir ?? path.join(root, 'content', 'news'))) {
    const doc = readJson(file);
    if (doc) news.push(doc);
  }

  const raws = [];
  const rawRoot = rawDir ?? path.join(root, 'content', '_raw');
  // 从 date-1 开始：当天的那份是本次抓取正在生成的产物，算进来会把自己全过滤掉。
  // 重跑（文件已存在）时同样适用，否则第二次跑会得到 0 条。
  for (let i = 1; i <= days; i += 1) {
    const key = shiftDateKey(date, -i);
    const file = path.join(rawRoot, `${key}.json`);
    if (!fs.existsSync(file)) continue;
    const doc = readJson(file);
    if (doc) raws.push({ date: key, doc });
  }

  const pools = [];
  const poolRoot = poolDir ?? path.join(root, 'content', '_pool');
  const oldest = shiftDateKey(date, -days);
  if (fs.existsSync(poolRoot)) {
    for (const name of fs.readdirSync(poolRoot)) {
      // 只认 YYYY-MM-DD-<industry>.json；selection / run-log 都不算池
      const matched = /^(\d{4}-\d{2}-\d{2})-[a-z]+\.json$/.exec(name);
      if (!matched) continue;
      const key = matched[1];
      // 当天的池同理排除：那是本轮编辑还没写出来的东西
      if (key >= date || key < oldest) continue;
      const doc = readJson(path.join(poolRoot, name));
      if (doc) pools.push({ date: key, doc });
    }
  }

  return { news, raws, pools };
}

/** 读盘 + 合并。抓取脚本只用这一个入口。 */
export function collectSeen(options) {
  return seenUrlsFrom(readSeenInputs(options));
}
