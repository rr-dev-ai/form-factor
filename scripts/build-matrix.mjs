/**
 * 按「还剩什么」重算候选矩阵，覆盖 index.json 里标注任务交上来的 matrix。
 *
 * 标注任务的矩阵统计的是「标了什么」：把已经发布过的旧闻、超出 72 小时
 * 时效窗的条目一并算进去。缺口因此被旧闻填平，02:00 的补位任务读到的是
 * 一张虚高的表——某个区域看着有货，实际全是上周发过的稿。
 *
 * 这里只统计同时满足三个条件的条目：
 *   1. 不在 content/news 里（没发过）
 *   2. 有 publishedAt，且事件时间在 72 小时内
 *   3. confidence >= 0.6
 *
 * 三者的顺序也是分桶的顺序：先剔已发布，再剔过期的，最后看置信度。
 * 这样 dropped 里留下的是真实的工作量结构，而不是被低置信条目淹掉。
 *
 * 用法：
 *   node scripts/build-matrix.mjs 2026-11-03
 *   node scripts/build-matrix.mjs 2026-11-03 --now 2026-11-03T01:30:00+08:00
 *   node scripts/build-matrix.mjs 2026-11-03 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { coveredRegions, regions } from '../src/config/regions.ts';
import { industries } from '../src/config/taxonomy.ts';
import { publishedNews } from '../src/lib/content.ts';

export const CONFIDENCE_FLOOR = 0.6;
export const WINDOW_HOURS = 72;

const REGION_SLUGS = regions.map((r) => r.slug);
const INDUSTRY_SLUGS = industries.map((i) => i.slug);
const COVERED = coveredRegions.map((r) => r.slug);

function emptyMatrix() {
  const matrix = {};
  for (const region of REGION_SLUGS) {
    matrix[region] = Object.fromEntries(INDUSTRY_SLUGS.map((industry) => [industry, 0]));
  }
  return matrix;
}

/**
 * 纯函数：不读盘、不写盘。
 * @returns {{matrix: Record<string, Record<string, number>>, gaps: string[], counted: number, dropped: object}}
 */
export function buildMatrix({
  index,
  raw,
  publishedUrls,
  now,
  confidenceFloor = CONFIDENCE_FLOOR,
  windowHours = WINDOW_HOURS,
}) {
  if (!Array.isArray(index?.items) || index.items.length === 0) {
    throw new Error('index.items 为空或缺失，无法核算矩阵');
  }
  if (!Array.isArray(raw?.results)) {
    throw new Error('raw.results 缺失，无法判定时效');
  }

  const eventAtByUrl = new Map();
  for (const result of raw.results) {
    for (const item of result.items ?? []) {
      if (item.url) eventAtByUrl.set(item.url, item.publishedAt ?? null);
    }
  }

  const matrix = emptyMatrix();
  const dropped = { published: 0, expired: 0, undated: 0, lowConfidence: 0, invalid: 0 };
  let counted = 0;

  for (const item of index.items) {
    if (!INDUSTRY_SLUGS.includes(item.industry) || !REGION_SLUGS.includes(item.region)) {
      dropped.invalid += 1;
      continue;
    }
    if (publishedUrls.has(item.url)) {
      dropped.published += 1;
      continue;
    }

    const eventAt = eventAtByUrl.get(item.url);
    const timestamp = eventAt ? Date.parse(eventAt) : NaN;
    if (Number.isNaN(timestamp)) {
      dropped.undated += 1;
      continue;
    }
    if ((now.getTime() - timestamp) / 3600000 > windowHours) {
      dropped.expired += 1;
      continue;
    }
    if ((item.confidence ?? 0) < confidenceFloor) {
      dropped.lowConfidence += 1;
      continue;
    }

    matrix[item.region][item.industry] += 1;
    counted += 1;
  }

  const gaps = COVERED.filter((region) => INDUSTRY_SLUGS.every((industry) => matrix[region][industry] === 0));

  return { matrix, gaps, counted, dropped };
}

/** 已发布内容引用的 url。跨来源转载同一事件仍会各自计数，这一步只认 url。 */
function publishedUrlSet() {
  const urls = new Set();
  for (const item of publishedNews()) {
    for (const source of item.sources ?? []) {
      if (source.url) urls.add(source.url);
    }
  }
  return urls;
}

function main() {
  const args = process.argv.slice(2);
  const date = args.find((arg) => !arg.startsWith('--') && !/^\d{4}-\d{2}-\d{2}T/.test(arg));
  const dryRun = args.includes('--dry-run');
  const nowArg = args[args.indexOf('--now') + 1];

  if (!date) {
    console.error('用法：node scripts/build-matrix.mjs <YYYY-MM-DD> [--now <iso>] [--dry-run]');
    process.exit(2);
  }

  const indexFile = path.join(process.cwd(), 'content', '_raw', `${date}.index.json`);
  const rawFile = path.join(process.cwd(), 'content', '_raw', `${date}.json`);

  if (!fs.existsSync(indexFile)) {
    console.error(`缺少 ${path.relative(process.cwd(), indexFile)}，先让标注任务跑完。未写入任何文件。`);
    process.exit(1);
  }
  if (!fs.existsSync(rawFile)) {
    console.error(`缺少 ${path.relative(process.cwd(), rawFile)}，无法判定时效。未写入任何文件。`);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const now = nowArg ? new Date(nowArg) : new Date();

  if (Number.isNaN(now.getTime())) {
    console.error(`--now 无法解析：${nowArg}`);
    process.exit(2);
  }
  if (raw.fetchedFor && raw.fetchedFor !== date) {
    console.error(`raw.fetchedFor=${raw.fetchedFor} 与 ${date} 不一致，拒绝混用两天的数据。`);
    process.exit(1);
  }

  const { matrix, gaps, counted, dropped } = buildMatrix({
    index,
    raw,
    publishedUrls: publishedUrlSet(),
    now,
  });

  const matrixBasis = {
    computedAt: now.toISOString(),
    confidenceFloor: CONFIDENCE_FLOOR,
    windowHours: WINDOW_HOURS,
    counted,
    dropped,
  };

  if (dryRun) {
    console.log(JSON.stringify({ date, matrix, gaps, matrixBasis }, null, 2));
    console.log('\n--dry-run：未写入');
    return;
  }

  const payload = { ...index, matrix, gaps, matrixBasis };
  fs.writeFileSync(indexFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(
    `矩阵已重算：计入 ${counted} 条，剔除 已发布 ${dropped.published} / 超窗 ${dropped.expired} / ` +
      `无日期 ${dropped.undated} / 低置信 ${dropped.lowConfidence}` +
      `${dropped.invalid ? ` / 非法 ${dropped.invalid}` : ''}`
  );
  console.log(`缺口区域：${gaps.length ? gaps.join(' ') : '无'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
