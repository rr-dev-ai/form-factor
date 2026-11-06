/**
 * 抓取 sources.json 中启用的源，输出原始条目到 content/_raw/YYYY-MM-DD.json。
 * 文件名里的日期是**站点时区**（Asia/Shanghai）的日期，不是 UTC 日期，也不是
 * 脚本启动时刻的日期：定时任务在北京时间 23:40 跨日跑，这一跑服务的是次日，
 * 所以 workflow 显式传 `--for-date`。不传时退回站点日期，用于手工补跑。
 *
 * 每个源只有两种取链接的方式：
 *   rss    — 解析 feed（RSS 2.0 / Atom）
 *   scrape — 抓列表页，按 css 选择器或 urlPattern 提取
 *
 * 只做两件判断：
 *   1. 按 72 小时时效窗剪枝（AGENTS.md 的规则）。feed 一次给最近 25 条，
 *      其中过半是往期稿子；不剪的话标注任务每天要把它们重标一遍。
 *      没有 publishedAt 的条目一律保留——判不了时效，砍了会误伤整源。
 *      前一天的文件缺失说明上次抓取失败，此时自动放宽窗口把那天捞回来。
 *   2. 按「近三天见过」过滤。72 小时窗口意味着同一篇会被连抓三次，
 *      见得过了就不再交给标注，只在 results[].seen 里留证。
 *
 * 行业判断与摘要不在这里做，本脚本只负责"把没见过的候选搬回来"。
 *
 * 用法：
 *   node scripts/fetch-sources.mjs            # 全部启用源
 *   node scripts/fetch-sources.mjs --rss-only # 只跑 rss 源
 *   node scripts/fetch-sources.mjs gsma-newsroom esim-report  # 指定 id
 *   node scripts/fetch-sources.mjs --no-write <id>  # 只看结果，不落盘
 *   node scripts/fetch-sources.mjs --window-hours 120 # 手动放宽时效窗
 *   node scripts/fetch-sources.mjs --no-prune       # 关闭剪枝，取全量（排查源用）
 *   node scripts/fetch-sources.mjs --no-seen        # 不过滤见过的，取全量（排查用）
 *   node scripts/fetch-sources.mjs --for-date 2026-11-06  # 指定归属日期（23:40 跨日跑必须带）
 *
 * 单源验证请一律带 `--no-write`：本脚本按站点日期写 `content/_raw/YYYY-MM-DD.json`，
 * 单源跑会用这一条源的结果覆盖当天的全量抓取。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { load } from 'cheerio';
import { pickTargets } from './lib/targets.mjs';
import { pruneByWindow, resolveWindowHours } from './lib/prune.mjs';
import { collectSeen } from './lib/seen.mjs';
import { shiftDate, resolveForDate } from './lib/site-date.mjs';

const ROOT = process.cwd();
const CFG_PATH = path.join(ROOT, 'config', 'sources.json');
const OUT_DIR = path.join(ROOT, 'content', '_raw');

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

/**
 * 「见过」的回看天数。与 72 小时时效窗对齐：窗口内最多被抓三次，
 * 取三天就够；放大到 7 天会把仍在窗口内、但昨天因行业满额没被采用的
 * 候选也挡掉，那是排期问题不是重复问题。
 */
const SEEN_DAYS = 3;

const args = process.argv.slice(2);
const rssOnly = args.includes('--rss-only');
const noWrite = args.includes('--no-write');
const noPrune = args.includes('--no-prune');
const noSeen = args.includes('--no-seen');

/** 带值的参数，它的值不能当成源 id */
const VALUE_FLAGS = new Set(['--window-hours', '--for-date']);
const onlyIds = [];
let windowArg;
let forDateArg;
for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];
  if (VALUE_FLAGS.has(flag)) {
    const value = args[i + 1];
    if (flag === '--window-hours') windowArg = value;
    else forDateArg = value;
    i += 1;
    continue;
  }
  if (!flag.startsWith('--')) onlyIds.push(flag);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const targets = pickTargets(cfg.sources, { ids: onlyIds, rssOnly });

if (targets.length === 0) {
  const hint = onlyIds.length
    ? `没有匹配到 id：${onlyIds.join(', ')}${rssOnly ? '（--rss-only 会排除 scrape 源）' : ''}`
    : '没有启用任何源';
  console.error(`${hint}。未写入任何文件。`);
  process.exit(1);
}

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

async function runSource(source, { now, windowHours }) {
  const started = Date.now();
  try {
    const { text, type } = await fetchText(source.fetch.url);

    if (source.fetch.kind === 'rss') {
      const looksHtml = /^\s*<(!doctype|html)/i.test(text);
      if (looksHtml) throw new Error(`期望 feed，实际返回 HTML (${type})`);

      const parsed = parseFeed(text);
      if (parsed.length === 0) throw new Error('feed 解析出 0 条');

      // 剪枝在截断之前：feed 按时间倒序，先滤掉往期稿子，25 条的额度才落到新鲜内容上
      const { kept, pruned } = noPrune
        ? { kept: parsed, pruned: [] }
        : pruneByWindow(parsed, { now, hours: windowHours });

      return {
        source,
        ok: true,
        items: kept.slice(0, MAX_ITEMS_PER_SOURCE),
        parsedCount: parsed.length,
        prunedCount: pruned.length,
        ms: Date.now() - started,
      };
    }

    const items = parseListPage(text, source.url, source.fetch).slice(0, MAX_ITEMS_PER_SOURCE);
    if (items.length === 0) throw new Error('列表页未提取到条目，需调整 selector/urlPattern');
    return { source, ok: true, items, parsedCount: items.length, prunedCount: 0, ms: Date.now() - started };
  } catch (err) {
    return { source, ok: false, error: err.message, ms: Date.now() - started };
  }
}

async function pool(list, limit = 5, options = {}) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await runSource(list[index], options);
    }
  });
  await Promise.all(workers);
  return results;
}

// 同一个时刻同时决定 fetchedAt、剪枝基准与文件内容；
// 归属日期 fetchedFor 单独解析——cron 已提前到北京 23:40，启动时站点时区还停在
// 前一天，靠 now 推会写错文件名。
const now = new Date();
let fetchedFor;
try {
  ({ date: fetchedFor } = resolveForDate({ now, arg: forDateArg }));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

// 前一天的文件不在，说明上次抓取没成功——放宽窗口把那天的稿子捞回来，
// 否则一次失败会让 D-3 的内容在恢复当天全部过期。
// anchor 必须跟着 fetchedFor 走，不能跟着 now：跨日跑时两者差一天。
const yesterday = shiftDate(fetchedFor, -1);
const yesterdayExists = fs.existsSync(path.join(OUT_DIR, `${yesterday}.json`));

let windowHours;
let catchUp;
try {
  ({ hours: windowHours, catchUp } = resolveWindowHours({ windowArg, yesterdayExists }));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

const fetched = await pool(targets, 5, { now, windowHours });

// 见过的不再交给标注：72 小时窗会把同一篇连抓三天，只对比前一天不够——
// D+1 被剔掉后它就不在 D+1 的 raw 里，D+2 会复活。所以取前 SEEN_DAYS 天并集。
// 只过滤 items，被剔的进 seen：prunedBySource 的健康度信号与 artifact 排查都还要用。
const seen = noSeen ? new Map() : collectSeen({ root: ROOT, date: fetchedFor, days: SEEN_DAYS });
let seenTotal = 0;
const seenBySource = {};

const results = fetched.map((result) => {
  if (!result.ok || !result.items?.length) return { ...result, seen: [] };
  const fresh = [];
  const dropped = [];
  for (const item of result.items) {
    const at = seen.get(item.url);
    if (at) dropped.push({ ...item, seenBefore: at });
    else fresh.push(item);
  }
  if (dropped.length === 0) return { ...result, seen: [] };
  seenTotal += dropped.length;
  seenBySource[result.source.id] = dropped.length;
  return { ...result, items: fresh, seen: dropped };
});

const fetchedTotal = results.reduce((sum, r) => sum + (r.parsedCount ?? 0), 0);
const keptTotal = results.reduce((sum, r) => sum + (r.items?.length ?? 0), 0);
const prunedTotal = results.reduce((sum, r) => sum + (r.prunedCount ?? 0), 0);
const prunedBySource = Object.fromEntries(
  results.filter((r) => (r.prunedCount ?? 0) > 0).map((r) => [r.source.id, r.prunedCount])
);

const payload = {
  fetchedAt: now.toISOString(),
  /** 本次抓取归属的站点日期。下游按这个字段找候选，不要靠文件名猜。 */
  fetchedFor,
  stats: {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    /** 解析出的条目总数，剪枝前 */
    fetched: fetchedTotal,
    /** 写入 items 的条目数 */
    items: keptTotal,
    pruned: prunedTotal,
    windowHours,
    catchUp,
    /** 按源记录剪掉的条数：某源长期被砍空说明它更新慢，是健康度信号 */
    prunedBySource,
    /** 因近 SEEN_DAYS 天已处理过（抓过 / 进池 / 已发布）而不再交给标注的条数 */
    seen: seenTotal,
    /** 按源记录剔掉的条数：某源长期只给旧闻，同样值得看 */
    seenBySource,
    seenDays: SEEN_DAYS,
  },
  results: results.map((r) => ({
    id: r.source.id,
    name: r.source.name,
    kind: r.source.fetch.kind,
    industries: r.source.industries,
    ok: r.ok,
    ms: r.ms,
    ...(r.ok
      ? {
          count: r.items.length,
          items: r.items,
          // seen 只留证，不参与标注；保留 count/items 的语义不变
          ...(r.seen?.length ? { seenCount: r.seen.length, seen: r.seen } : {}),
        }
      : { error: r.error }),
  })),
};

console.log(JSON.stringify(payload.stats, null, 2));
console.log(
  `\n时效窗 ${windowHours}h${catchUp ? '（前一天抓取缺失，已自动放宽）' : ''}：` +
    `解析 ${fetchedTotal} 条，保留 ${keptTotal} 条新条目，剪掉 ${prunedTotal}`
);
console.log(
  noSeen
    ? '--no-seen：未过滤近三天已处理过的条目'
    : `近 ${SEEN_DAYS} 天已处理过 ${seenTotal} 条，未交给标注（--no-seen 可关闭）`
);
if (noPrune) console.log('--no-prune：未做时效剪枝');
console.log('\nfailed:');
for (const r of results.filter((x) => !x.ok)) {
  console.log(`  ${r.source.id} — ${r.error}`);
}

if (noWrite) {
  console.log('\n--no-write：结果未落盘');
} else {
  const daily = pickTargets(cfg.sources, { rssOnly }).length;
  const outFile = path.join(OUT_DIR, `${fetchedFor}.json`);
  if (targets.length < daily && fs.existsSync(outFile)) {
    console.error(
      `\n警告：本次只跑了 ${targets.length}/${daily} 个源，将覆盖 ${path.relative(ROOT, outFile)} 的当日全量结果。` +
        `\n若只是验证单个源，请加 --no-write。`
    );
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`\nwritten to ${path.relative(ROOT, outFile)}`);
}
