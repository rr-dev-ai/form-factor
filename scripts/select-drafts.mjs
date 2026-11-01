/**
 * 从备选池里选出当天的发布名单。
 *
 * 判定顺序是「区域保底 > 行业下限 > 按分补满」：宁可某个行业少一条，
 * 也不让某个区域整片缺席。取舍规则写死在这里，模型不参与计算。
 *
 * 用法：node scripts/select-drafts.mjs <date> [--days 3] [--auto]
 * 产出：content/_pool/<date>.selection.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listPools, POOL_DIR } from './lib/pool.mjs';
import { coveredRegions } from '../src/config/regions.ts';
import { industries } from '../src/config/taxonomy.ts';

const COVERED = coveredRegions.map((r) => r.slug);
const INDUSTRIES = industries.map((i) => i.slug);
const WINDOW_HOURS = 72;

const urlsOf = (draft) => new Set((draft.sources ?? []).map((s) => s.url).filter(Boolean));

/**
 * 纯函数：不读盘、不写盘。
 * @param {{docs: any[], broken: any[], index: any, date: string, now: Date, limit?: number, perIndustry?: number}} input
 */
export function selectDrafts({ docs, broken = [], index, date, now, limit = 15, perIndustry = 5, perIndustryMin = 3 }) {
  const conflicts = [];
  const gaps = [];
  const expired = [];

  for (const b of broken) {
    conflicts.push({ kind: 'industry-invalid', detail: `${b.date} ${b.industry} 池文件无法解析：${b.error}`, resolved: false });
  }

  const raw = [];
  for (const entry of docs) {
    for (const draft of entry.doc?.drafts ?? []) raw.push({ ...draft, _sourceDate: entry.date });
  }

  // 1. 时效：按 sources 里最晚的事件时间算，不按池文件日期算
  const inWindow = [];
  for (const draft of raw) {
    const times = (draft.sources ?? [])
      .map((s) => s.publishedAt)
      .filter(Boolean)
      .map((t) => Date.parse(t))
      .filter((n) => !Number.isNaN(n));

    if (!times.length) {
      conflicts.push({ kind: 'undated', detail: `${draft.industry}/${draft.slug} 的 sources 缺 publishedAt，无法判定时效`, resolved: false });
      continue;
    }

    const eventAt = Math.max(...times);
    const hours = (now.getTime() - eventAt) / 3600000;
    if (hours > WINDOW_HOURS) {
      expired.push({ slug: draft.slug, eventAt: new Date(eventAt).toISOString(), hours: Math.round(hours) });
      continue;
    }
    inWindow.push({ ...draft, eventAt });
  }

  // 2. 跨行业重复：按 url 集合求交，保留分数高的
  const byConfidence = [...inWindow].sort((a, b) => b.confidence - a.confidence || a.slug.localeCompare(b.slug));
  const accepted = [];
  const urlOwner = new Map();
  for (const draft of byConfidence) {
    const clash = [...urlsOf(draft)].map((u) => urlOwner.get(u)).find(Boolean);
    if (clash) {
      conflicts.push({ kind: 'cross-industry-duplicate', detail: `${draft.industry}/${draft.slug} 与 ${clash.industry}/${clash.slug} 报道同一事件`, resolved: false });
      continue;
    }
    for (const url of urlsOf(draft)) urlOwner.set(url, draft);
    accepted.push(draft);
  }

  // 3. 排序：分数降序，同分按该区候选稀缺度（越少越前）
  const regionCounts = new Map();
  for (const draft of accepted) regionCounts.set(draft.region, (regionCounts.get(draft.region) ?? 0) + 1);
  const scored = [...accepted].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      (regionCounts.get(a.region) ?? 0) - (regionCounts.get(b.region) ?? 0) ||
      a.slug.localeCompare(b.slug)
  );

  // 4. 三轮选择
  const selected = [];
  const taken = new Set();
  const countOf = (industry) => selected.filter((s) => s.industry === industry).length;

  const regionOrder = [...COVERED].sort(
    (a, b) => (regionCounts.get(a) ?? 0) - (regionCounts.get(b) ?? 0) || COVERED.indexOf(a) - COVERED.indexOf(b)
  );

  for (const region of regionOrder) {
    if (selected.length >= limit) break;
    const inRegion = scored.filter((d) => d.region === region && !taken.has(d));
    const pick = inRegion.find((d) => countOf(d.industry) < perIndustry);
    if (!pick) {
      if (inRegion.length) {
        conflicts.push({
          kind: 'region-blocked-by-industry-cap',
          region,
          detail: `${region} 有 ${inRegion.length} 条候选，但所属行业已达上限 ${perIndustry}`,
          resolved: false,
        });
      }
      continue;
    }
    taken.add(pick);
    selected.push({ industry: pick.industry, slug: pick.slug, score: pick.confidence, reason: 'region-floor', region, sourceDate: pick._sourceDate });
  }

  for (const industry of INDUSTRIES) {
    while (countOf(industry) < perIndustryMin && selected.length < limit) {
      const next = scored.find((d) => d.industry === industry && !taken.has(d));
      if (!next) break;
      taken.add(next);
      selected.push({ industry, slug: next.slug, score: next.confidence, reason: 'industry-floor', region: next.region, sourceDate: next._sourceDate });
    }
  }

  while (selected.length < limit) {
    const next = scored.find((d) => !taken.has(d) && countOf(d.industry) < perIndustry);
    if (!next) break;
    taken.add(next);
    selected.push({ industry: next.industry, slug: next.slug, score: next.confidence, reason: 'fill', region: next.region, sourceDate: next._sourceDate });
  }

  // 5. 缺口：以实际入选结果为准，不看矩阵
  for (const region of COVERED) {
    if (selected.some((s) => s.region === region)) continue;
    const inRegion = scored.filter((d) => d.region === region);
    gaps.push({ region, note: inRegion.length ? '候选所属行业已满额' : '池内 0 条' });
  }

  // 6. 高置信对账：index 说有、池里既没稿也没拒稿记录
  // 拒稿记录可能没带 url（历史数据就如此），所以 url 与标题两条线都要对，
  // 否则每天的「漏网」会涨到十几条，这个信号就没人看了。
  const normalize = (text) => (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const knownUrls = new Set();
  const knownTitles = new Set();
  for (const draft of raw) {
    for (const url of urlsOf(draft)) knownUrls.add(url);
    for (const locale of ['zh', 'en', 'es']) {
      const title = normalize(draft.title?.[locale]);
      if (title) knownTitles.add(title);
    }
  }
  for (const entry of docs) {
    for (const rejection of entry.doc?.rejected ?? []) {
      if (rejection.url) knownUrls.add(rejection.url);
      const title = normalize(rejection.title);
      if (title) knownTitles.add(title);
    }
  }
  const unaccounted = (index?.items ?? [])
    .filter((item) => (item.confidence ?? 0) >= 0.6 && item.url)
    .filter((item) => !knownUrls.has(item.url) && !knownTitles.has(normalize(item.title)))
    .map((item) => ({ title: item.title, url: item.url, confidence: item.confidence }));

  // 7. 断言：宁可进程失败，也不带病输出
  if (selected.length > limit) throw new Error(`入选 ${selected.length} 条，超过上限 ${limit}`);
  for (const pick of selected) {
    if (!INDUSTRIES.includes(pick.industry)) throw new Error(`行业 ${pick.industry} 不在 taxonomy 内：${pick.slug}`);
    const found = docs.some((entry) =>
      (entry.doc?.drafts ?? []).some((draft) => draft.slug === pick.slug && draft.industry === pick.industry)
    );
    if (!found) throw new Error(`选中的 ${pick.slug} 在池里找不到`);
  }
  for (const industry of INDUSTRIES) {
    if (countOf(industry) > perIndustry) throw new Error(`${industry} 入选 ${countOf(industry)} 条，超过上限 ${perIndustry}`);
  }
  const uncovered = COVERED.filter((r) => !selected.some((s) => s.region === r));
  if (uncovered.join() !== gaps.map((g) => g.region).join()) {
    throw new Error(`缺口与入选结果不一致：uncovered=${uncovered.join()} gaps=${gaps.map((g) => g.region).join()}`);
  }

  const alternates = scored
    .filter((d) => !taken.has(d))
    .map((d) => ({ industry: d.industry, slug: d.slug, score: d.confidence, reason: 'fill' }));

  return { date, generatedAt: now.toISOString(), selected, alternates, expired, gaps, unaccounted, conflicts };
}

function main() {
  const date = process.argv[2];
  if (!date) {
    console.error('用法：node scripts/select-drafts.mjs <date> [--days 3] [--auto]');
    process.exit(2);
  }

  const { docs, broken } = listPools(date, 3);
  const indexFile = path.join(process.cwd(), 'content', '_raw', `${date}.index.json`);
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;

  const selection = selectDrafts({ docs, broken, index, date, now: new Date() });

  fs.mkdirSync(POOL_DIR, { recursive: true });
  const out = path.join(POOL_DIR, `${date}.selection.json`);
  fs.writeFileSync(out, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');

  const regions = new Set(selection.selected.map((s) => s.region)).size;
  console.log(
    `已选 ${selection.selected.length} 条（覆盖 ${regions}/${COVERED.length} 区），候补 ${selection.alternates.length}，` +
      `缺口 [${selection.gaps.map((g) => g.region).join(' ')}]，冲突 ${selection.conflicts.length}，漏网 ${selection.unaccounted.length}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
