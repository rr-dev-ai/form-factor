import test from 'node:test';
import assert from 'node:assert/strict';
import { newsItemSchema } from '../src/lib/schema.ts';
import { promote } from '../scripts/promote-drafts.mjs';

const NOW = new Date('2026-11-02T05:00:00+08:00');
const NEWS_DIR = '/tmp/news';

const mkDraft = (over = {}) => ({
  id: `2026-11-02-${over.industry ?? 'banking'}-${over.slug ?? 'a'}`,
  slug: 'a',
  industry: 'banking',
  region: 'europe',
  regions: [],
  tags: ['acquiring'],
  originalLang: 'en',
  sources: [{ name: 'x', url: 'https://a.example/a', publishedAt: '2026-11-01T12:00:00+08:00' }],
  title: { zh: 't', en: 't', es: 't' },
  summary: { zh: 's', en: 's', es: 's' },
  body: [
    { kind: 'p', text: { zh: 'b', en: 'b', es: 'b' } },
    { kind: 'p', text: { zh: 'b2', en: 'b2', es: 'b2' } },
  ],
  whyItMatters: { zh: 'w', en: 'w', es: 'w' },
  confidence: 0.8,
  ai: { model: 'm', promptVersion: 'v1' },
  ...over,
});

const mkPool = (industry, drafts) => ({
  date: '2026-11-02',
  industry,
  mtimeMs: Date.parse('2026-11-02T03:30:00+08:00'),
  doc: {
    date: '2026-11-02',
    industry,
    startedAt: '2026-11-02T02:30:12+08:00',
    drafts,
    rejected: [],
    stats: { candidates: drafts.length, written: drafts.length, skippedByDedup: 0 },
  },
});

const mkSelection = (slugs, industry = 'banking') => ({
  date: '2026-11-02',
  generatedAt: NOW.toISOString(),
  selected: slugs.map((slug, i) => ({ industry, slug, score: 0.9 - i * 0.01, reason: 'fill', region: 'europe' })),
  alternates: [],
  expired: [],
  gaps: [],
  unaccounted: [],
  conflicts: [],
});

const mkItem = ({ slug = 'old', id = '2026-11-02-banking-01', industry = 'banking' } = {}) => ({
  id,
  slug,
  industry,
  status: 'published',
  publishedAt: '2026-11-02T05:00:00+08:00',
  ingestedAt: '2026-11-02T02:30:00+08:00',
});

const call = (over = {}) =>
  promote({ date: '2026-11-02', selection: mkSelection(['a']), docs: [mkPool('banking', [mkDraft()])], existing: [], now: NOW, newsDir: NEWS_DIR, ...over });

test('提升时补齐三个字段并通过 newsItemSchema', () => {
  const r = call();
  assert.equal(r.written.length, 1);
  const item = r.written[0].item;
  assert.equal(item.status, 'published');
  assert.equal(item.ingestedAt, '2026-11-02T02:30:12+08:00');
  assert.equal(item.publishedAt, '2026-11-02T05:00:00+08:00');
  assert.equal(newsItemSchema.safeParse(item).success, true);
});

test('幂等：已存在的 slug 跳过且不覆盖', () => {
  const first = call();
  const second = call({ existing: [first.written[0].item] });
  assert.equal(second.written.length, 0);
  assert.equal(second.skipped[0].reason, 'already-exists');
});

test('slug 与既有内容冲突时跳过并报告', () => {
  const r = call({ existing: [mkItem({ slug: 'a', id: 'other-id' })] });
  assert.equal(r.written.length, 0);
  assert.equal(r.skipped[0].reason, 'slug-conflict');
});

test('同名池里的草稿提升后从返回值 pools 中移除', () => {
  const r = call();
  assert.equal(r.pools[0].doc.drafts.length, 0);
});

test('文件名序号接当天该行业已有序号续编', () => {
  const r = call({ existing: [mkItem({ slug: 'old-1', id: '2026-11-02-banking-01' })] });
  assert.match(r.written[0].path, /2026-11-02-banking-02\.json$/);
});

test('跨日复用：昨天池里的草稿今天也能提升', () => {
  const yesterday = {
    date: '2026-11-01',
    industry: 'banking',
    mtimeMs: Date.parse('2026-11-01T03:20:00+08:00'),
    doc: { date: '2026-11-01', industry: 'banking', startedAt: '2026-11-01T02:30:00+08:00', drafts: [mkDraft({ slug: 'old', url: 'https://a.example/old' })], rejected: [], stats: {} },
  };
  const selection = { ...mkSelection([]), selected: [{ industry: 'banking', slug: 'old', score: 0.9, reason: 'fill', region: 'europe', sourceDate: '2026-11-01' }] };
  const r = promote({ date: '2026-11-02', selection, docs: [yesterday], existing: [], now: NOW, newsDir: NEWS_DIR });
  assert.equal(r.written.length, 1);
  assert.equal(r.written[0].item.ingestedAt, '2026-11-01T02:30:00+08:00');
});

test('标签不在 taxonomy 内时跳过，不落进 content/news', () => {
  const r = call({ docs: [mkPool('banking', [mkDraft({ tags: ['not-a-tag'] })])] });
  assert.equal(r.written.length, 0);
  assert.match(r.skipped[0].reason, /invalid.*not-a-tag/);
});

test('regions 含主区域时跳过', () => {
  const r = call({ docs: [mkPool('banking', [mkDraft({ region: 'europe', regions: ['europe'] })])] });
  assert.equal(r.written.length, 0);
  assert.match(r.skipped[0].reason, /invalid.*regions 不得包含主区域/);
});

test('池缺 startedAt 时用当天窗口兜底，而不是整池作废', () => {
  const pool = mkPool('banking', [mkDraft()]);
  delete pool.doc.startedAt;
  const r = call({ docs: [pool] });
  assert.equal(r.written.length, 1);
  assert.equal(r.written[0].item.ingestedAt, '2026-11-02T02:30:00+08:00');
});
