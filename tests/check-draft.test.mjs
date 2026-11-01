import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPool } from '../scripts/check-draft.mjs';

const draft = (over = {}) => ({
  id: '2026-11-02-banking-01',
  slug: 'octobank-apple-pay',
  industry: 'banking',
  region: 'cis',
  regions: [],
  tags: ['acquiring'],
  originalLang: 'en',
  sources: [{ name: 'UzNews', url: 'https://uznews.uz/ru/news/113864', publishedAt: '2026-10-29T20:40:00+05:00' }],
  title: { zh: '标题', en: 'Title', es: 'Título' },
  summary: { zh: '导语', en: 'Summary', es: 'Resumen' },
  body: [
    { kind: 'p', text: { zh: '正文', en: 'Body', es: 'Texto' } },
    { kind: 'p', text: { zh: '正文二', en: 'Body 2', es: 'Texto 2' } },
  ],
  whyItMatters: { zh: '影响', en: 'Impact', es: 'Impacto' },
  confidence: 0.8,
  ai: { model: 'm', promptVersion: 'v1' },
  ...over,
});

const pool = (...drafts) => ({
  date: '2026-11-02',
  industry: 'banking',
  startedAt: '2026-11-02T02:30:12+08:00',
  drafts,
  rejected: [],
  stats: { candidates: 10, written: drafts.length, skippedByDedup: 2 },
});

test('合法草稿通过', () => {
  const r = inspectPool(pool(draft()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('缺任一语言不通过', () => {
  const r = inspectPool(pool(draft({ title: { zh: '标题', en: 'Title', es: '' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /es/);
});

test('草稿里出现 status / publishedAt / ingestedAt 不通过', () => {
  const r = inspectPool(pool(draft({ publishedAt: '2026-11-02T04:20:00+08:00' })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /publishedAt/);
});

test('whyItMatters 超出语言上限不通过', () => {
  const r = inspectPool(pool(draft({ whyItMatters: { zh: '字'.repeat(401), en: 'x', es: 'y' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /whyItMatters/);
});

test('未在 taxonomy 定义的标签不通过', () => {
  const r = inspectPool(pool(draft({ tags: ['not-a-tag'] })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /not-a-tag/);
});

test('空池合法', () => {
  assert.equal(inspectPool(pool()).ok, true);
});

test('池缺 startedAt 时判为不合规，不能留给构建去发现', () => {
  const p = pool(draft());
  delete p.startedAt;
  const r = inspectPool(p);
  assert.equal(r.ok, false);
  assert.match(r.problems.map((x) => x.messages.join()).join(), /startedAt/);
});
