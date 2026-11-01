import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDrafts } from '../scripts/select-drafts.mjs';

const NOW = new Date('2026-11-02T04:15:00+08:00');

const mkDraft = ({
  industry = 'banking',
  region = 'europe',
  confidence = 0.8,
  slug,
  url,
  publishedAt = '2026-11-01T12:00:00+08:00',
} = {}) => ({
  id: `2026-11-02-${industry}-${slug}`,
  slug,
  industry,
  region,
  regions: [],
  tags: ['acquiring'],
  originalLang: 'en',
  sources: [{ name: 'x', url, ...(publishedAt ? { publishedAt } : {}) }],
  title: { zh: 't', en: 't', es: 't' },
  summary: { zh: 's', en: 's', es: 's' },
  body: [
    { kind: 'p', text: { zh: 'b', en: 'b', es: 'b' } },
    { kind: 'p', text: { zh: 'b2', en: 'b2', es: 'b2' } },
  ],
  whyItMatters: { zh: 'w', en: 'w', es: 'w' },
  confidence,
  ai: { model: 'm', promptVersion: 'v1' },
});

const mkPool = (industry, drafts, { date = '2026-11-02', startedAt = '2026-11-02T02:30:00+08:00', mtimeMs = Date.parse('2026-11-02T03:30:00+08:00') } = {}) => ({
  date,
  industry,
  mtimeMs,
  doc: { date, industry, startedAt, drafts, rejected: [], stats: { candidates: drafts.length, written: drafts.length, skippedByDedup: 0 } },
});

const run = (over = {}) => selectDrafts({ docs: [], broken: [], index: null, date: '2026-11-02', now: NOW, ...over });

test('区域保底优先于行业下限：低分 apac 候选仍然入选', () => {
  const docs = [
    mkPool('banking', [
      mkDraft({ region: 'apac', confidence: 0.4, slug: 'apac-low', url: 'https://a.example/1' }),
      ...Array.from({ length: 5 }, (_, i) =>
        mkDraft({ region: 'north-america', confidence: 0.9, slug: `na-${i}`, url: `https://a.example/na${i}` })),
    ]),
  ];
  const r = run({ docs });
  const picked = r.selected.find((s) => s.slug === 'apac-low');
  assert.equal(picked?.reason, 'region-floor');
  assert.equal(r.selected.filter((s) => s.industry === 'banking').length, 5);
});

test('区域保底被行业上限挡住时留空并记冲突，不挪标签', () => {
  // 五个区各只有一条 banking 候选，会先把 banking 的名额吃满；apac 有两条、排队靠后，必然被挡。
  const single = (region, slug) => mkDraft({ region, confidence: 0.9, slug, url: `https://a.example/${slug}` });
  const docs = [
    mkPool('banking', [
      single('europe', 'eu-1'),
      single('cis', 'cis-1'),
      single('latam', 'latam-1'),
      single('africa', 'africa-1'),
      single('north-america', 'na-1'),
      mkDraft({ region: 'apac', confidence: 0.8, slug: 'apac-1', url: 'https://a.example/apac-1' }),
      mkDraft({ region: 'apac', confidence: 0.7, slug: 'apac-2', url: 'https://a.example/apac-2' }),
    ]),
  ];
  const r = run({ docs });
  assert.equal(r.selected.filter((s) => s.industry === 'banking').length, 5);
  assert.deepEqual(r.gaps.map((g) => g.region).sort(), ['apac', 'mena']);
  assert.ok(r.conflicts.some((c) => c.kind === 'region-blocked-by-industry-cap' && c.region === 'apac'));
});

test('池里没有该区就记 gap，不从别的区拉一条改 region', () => {
  const docs = [mkPool('banking', [mkDraft({ region: 'europe', confidence: 0.9, slug: 'eu-1', url: 'https://a.example/eu' })])];
  const r = run({ docs });
  assert.ok(r.gaps.some((g) => g.region === 'mena'));
  assert.equal(r.selected.every((s) => s.region !== 'mena'), true);
});

test('超过 72 小时的草稿进 expired，不参与选择', () => {
  const docs = [mkPool('banking', [mkDraft({ region: 'europe', confidence: 0.9, slug: 'old', url: 'https://a.example/old', publishedAt: '2026-10-29T00:00:00+08:00' })])];
  const r = run({ docs });
  assert.equal(r.expired.length, 1);
  assert.equal(r.selected.some((s) => s.slug === 'old'), false);
});

test('没有 publishedAt 的草稿进 conflicts(undated)', () => {
  const docs = [mkPool('banking', [mkDraft({ region: 'europe', confidence: 0.9, slug: 'undated', url: 'https://a.example/u', publishedAt: null })])];
  const r = run({ docs });
  assert.ok(r.conflicts.some((c) => c.kind === 'undated'));
});

test('跨行业重复按 url 交集去重，保留高分', () => {
  const docs = [
    mkPool('banking', [mkDraft({ industry: 'banking', region: 'africa', confidence: 0.7, slug: 'dup-bank', url: 'https://a.example/dup' })]),
    mkPool('telecom', [mkDraft({ industry: 'telecom', region: 'africa', confidence: 0.9, slug: 'dup-tel', url: 'https://a.example/dup' })]),
  ];
  const r = run({ docs });
  assert.equal(r.selected.filter((s) => s.region === 'africa').length, 1);
  assert.equal(r.selected.find((s) => s.region === 'africa').slug, 'dup-tel');
  assert.ok(r.conflicts.some((c) => c.kind === 'cross-industry-duplicate'));
});

test('index 里高置信但池里既无稿也无拒稿记录 → unaccounted', () => {
  const index = { items: [{ url: 'https://a.example/ghost', title: 'Ghost', confidence: 0.8, industry: 'banking', region: 'apac' }] };
  const r = run({ index });
  assert.deepEqual(r.unaccounted.map((u) => u.url), ['https://a.example/ghost']);
});

test('总数不超过 15、每行业不超过 5', () => {
  const docs = ['banking', 'telecom', 'identity'].map((industry) =>
    mkPool(industry, Array.from({ length: 8 }, (_, i) =>
      mkDraft({ industry, region: 'europe', confidence: 0.9 - i * 0.01, slug: `${industry}-${i}`, url: `https://a.example/${industry}/${i}` }))));
  const r = run({ docs });
  assert.equal(r.selected.length, 15);
  for (const industry of ['banking', 'telecom', 'identity']) {
    assert.ok(r.selected.filter((s) => s.industry === industry).length <= 5);
  }
});

test('坏池文件只让该行业缺席，不让整批失败', () => {
  const docs = [mkPool('banking', [mkDraft({ region: 'europe', confidence: 0.9, slug: 'ok', url: 'https://a.example/ok' })])];
  const r = run({ docs, broken: [{ date: '2026-11-02', industry: 'telecom', error: 'Unexpected end of JSON' }] });
  assert.equal(r.selected.some((s) => s.slug === 'ok'), true);
  assert.ok(r.conflicts.some((c) => c.kind === 'industry-invalid'));
});
