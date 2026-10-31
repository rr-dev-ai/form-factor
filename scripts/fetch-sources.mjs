/**
 * 抓取 sources.json 中启用的源，输出原始条目到 content/_raw/YYYY-MM-DD.json。
 * 文件名里的日期是**站点时区**（Asia/Shanghai）的日期，不是 UTC 日期：
 * 定时任务在北京时间 00:20 跑，UTC 还停在前一天，用 UTC 命名会和归档页差一天。
 *
 * 每个源只有两种取链接的方式：
 *   rss    — 解析 feed（RSS 2.0 / Atom）
 *   scrape — 抓列表页，按 css 选择器或 urlPattern 提取
 * 其余处理（去重、筛选、摘要）不在这里做，本脚本只负责"把候选搬回来"。
 *
 * 用法：
 *   node scripts/fetch-sources.mjs            # 全部启用源
 *   node scripts/fetch-sources.mjs --rss-only # 只跑 rss 源
 *   node scripts/fetch-sources.mjs gsma-newsroom esim-report  # 指定 id
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { load } from 'cheerio';

const ROOT = process.cwd();
const CFG_PATH = path.join(ROOT, 'config', 'sources.json');
const OUT_DIR = path.join(ROOT, 'content', '_raw');

/** 站点时区。与 src/config/site.ts 的 site.timeZone 保持一致。 */
const SITE_TZ = 'Asia/Shanghai';

/** 按站点时区取日期（YYYY-MM-DD），不依赖运行机器的本地时区 */
function siteDate(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'user-agent': UA,
  'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'upgrade-insecure-requests': '1',
};
const MAX_ITEMS_PER_SOURCE = 25;
const TIMEOUT_MS = 20000;

const args = process.argv.slice(2);
const rssOnly = args.includes('--rss-only');
const onlyIds = args.filter((a) => !a.startsWith('--'));

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
let targets = cfg.sources.filter((s) => s.enabled);
if (rssOnly) targets = targets.filter((s) => s.fetch.kind === 'rss');
if (onlyIds.length) targets = targets.filter((s) => onlyIds.includes(s.id));

/**
 * 部分站点（Cloudflare 等）会按 TLS 指纹拦截 Node 原生 fetch，
 * 但同机器的 curl 能通过。403 / 429 时降级用 curl 重试一次。
 */
function curlFetch(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['-sSL', '--compressed', '--max-time', '20', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
      { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        ...BASE_HEADERS,
        accept:
          'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    const text = await res.text();
    return { text, type };
  } catch (err) {
    if (!/HTTP (403|429)/.test(err.message)) throw err;
    const text = await curlFetch(url);
    if (!text || text.length < 200) throw new Error(`curl 降级后内容为空`);
    return { text, type: 'curl-fallback' };
  }
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function parseFeed(xml) {
  const $ = load(xml, { xmlMode: true });
  const items = [];

  $('item').each((_, el) => {
    const $el = $(el);
    const title = clean($el.find('title').first().text());
    let url = clean($el.find('link').first().text());
    if (!url) url = clean($el.find('guid').first().text());
    if (!title || !/^https?:\/\//.test(url)) return;
    items.push({ title, url, publishedAt: toIso($el.find('pubDate').first().text()) });
  });

  if (items.length === 0) {
    $('entry').each((_, el) => {
      const $el = $(el);
      const title = clean($el.find('title').first().text());
      const url = clean($el.find('link').first().attr('href') ?? '');
      if (!title || !/^https?:\/\//.test(url)) return;
      items.push({
        title,
        url,
        publishedAt: toIso($el.find('published').first().text() || $el.find('updated').first().text()),
      });
    });
  }

  return items;
}

function parseListPage(html, baseUrl, fetchCfg) {
  const $ = load(html);
  const items = [];
  const seen = new Set();

  const push = (title, href) => {
    if (!title || !href) return;
    if (title.length < 24) return; // 导航项、栏目名通常很短
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    items.push({ title, url, publishedAt: null });
  };

  if (fetchCfg.selector) {
    $(fetchCfg.selector).each((_, el) => {
      const $el = $(el);
      const $a = $el.is('a') ? $el : $el.find('a').first();
      push(clean($a.attr('title') || $a.text()), $a.attr('href'));
    });
    return items;
  }

  if (fetchCfg.urlPattern) {
    const re = new RegExp(fetchCfg.urlPattern);
    $('a').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href || !re.test(href)) return;
      push(clean($a.attr('title') || $a.text()), href);
    });
  }

  return items;
}

async function runSource(source) {
  const started = Date.now();
  try {
    const { text, type } = await fetchText(source.fetch.url);

    if (source.fetch.kind === 'rss') {
      const looksHtml = /^\s*<(!doctype|html)/i.test(text);
      if (looksHtml) throw new Error(`期望 feed，实际返回 HTML (${type})`);
      const items = parseFeed(text).slice(0, MAX_ITEMS_PER_SOURCE);
      if (items.length === 0) throw new Error('feed 解析出 0 条');
      return { source, ok: true, items, ms: Date.now() - started };
    }

    const items = parseListPage(text, source.url, source.fetch).slice(0, MAX_ITEMS_PER_SOURCE);
    if (items.length === 0) throw new Error('列表页未提取到条目，需调整 selector/urlPattern');
    return { source, ok: true, items, ms: Date.now() - started };
  } catch (err) {
    return { source, ok: false, error: err.message, ms: Date.now() - started };
  }
}

async function pool(list, limit = 5) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await runSource(list[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const results = await pool(targets);

// 同一个时刻同时决定 fetchedAt、fetchedFor 与文件名，避免跨越时区零点时三者不一致
const now = new Date();
const fetchedFor = siteDate(now);

const payload = {
  fetchedAt: now.toISOString(),
  /** 本次抓取归属的站点日期。下游按这个字段找候选，不要靠文件名猜。 */
  fetchedFor,
  stats: {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    items: results.reduce((sum, r) => sum + (r.items?.length ?? 0), 0),
  },
  results: results.map((r) => ({
    id: r.source.id,
    name: r.source.name,
    kind: r.source.fetch.kind,
    industries: r.source.industries,
    ok: r.ok,
    ms: r.ms,
    ...(r.ok ? { count: r.items.length, items: r.items } : { error: r.error }),
  })),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `${fetchedFor}.json`);
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(payload.stats, null, 2));
console.log('\nfailed:');
for (const r of results.filter((x) => !x.ok)) {
  console.log(`  ${r.source.id} — ${r.error}`);
}
console.log(`\nwritten to ${path.relative(ROOT, outFile)}`);
