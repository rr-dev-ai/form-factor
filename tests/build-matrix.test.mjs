import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix } from '../scripts/build-matrix.mjs';

const NOW = new Date('2026-11-03T02:00:00+08:00');

const mkRaw = (items) => ({ fetchedFor: '2026-11-03', results: [{ id: 'src', items }] });

const mkIndex = (items) => ({ fetchedFor: '2026-11-03', items });

const row = ({
  url,
  industry = 'banking',
  region = 'europe',
  confidence = 0.8,
  publishedAt = '2026-11-02T20:00:00+08:00',
}) => ({ url, title: url, industry, region, confidence, publishedAt });

const run = ({ index, raw, publishedUrls = new Set(), now = NOW } = {}) =>
  buildMatrix({ index, raw, publishedUrls, now });

test('窗口内未发布的条目计入矩阵', () => {
  const items = [row({ url: 'https://a.example/1', industry: 'telecom', region: 'latam', confidence: 0.9 })];
  const { matrix, counted, gaps } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(counted, 1);
  assert.equal(matrix.latam.telecom, 1);
  assert.equal(gaps.includes('latam'), false);
});

test('已发布的条目剔除，即使置信度很高', () => {
  const items = [row({ url: 'https://a.example/pub', confidence: 0.95 })];
  const { counted, dropped, matrix } = run({
    index: mkIndex(items),
    raw: mkRaw(items),
    publishedUrls: new Set(['https://a.example/pub']),
  });
  assert.equal(counted, 0);
  assert.equal(dropped.published, 1);
  assert.equal(matrix.europe.banking, 0);
});

test('超出 72 小时的条目剔除', () => {
  const items = [row({ url: 'https://a.example/old', publishedAt: '2026-10-28T00:00:00+08:00' })];
  const { counted, dropped } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(counted, 0);
  assert.equal(dropped.expired, 1);
});

test('72 小时整保留，多一分钟剔除', () => {
  const keep = [row({ url: 'https://a.example/k', publishedAt: '2026-10-31T02:00:00+08:00' })];
  const drop = [row({ url: 'https://a.example/d', publishedAt: '2026-10-31T01:59:00+08:00' })];
  assert.equal(run({ index: mkIndex(keep), raw: mkRaw(keep) }).counted, 1);
  assert.equal(run({ index: mkIndex(drop), raw: mkRaw(drop) }).counted, 0);
});

test('缺 publishedAt 的条目进 undated，不进矩阵', () => {
  const items = [row({ url: 'https://a.example/u', publishedAt: null })];
  const { counted, dropped } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(counted, 0);
  assert.equal(dropped.undated, 1);
});

test('低于置信度门槛的条目剔除', () => {
  const items = [row({ url: 'https://a.example/low', confidence: 0.59 })];
  const { counted, dropped } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(counted, 0);
  assert.equal(dropped.lowConfidence, 1);
});

test('分桶互斥且合计等于标注条目数', () => {
  const items = [
    row({ url: 'https://a.example/ok' }),
    row({ url: 'https://a.example/pub' }),
    row({ url: 'https://a.example/old', publishedAt: '2026-10-01T00:00:00+08:00' }),
    row({ url: 'https://a.example/u', publishedAt: null }),
    row({ url: 'https://a.example/low', confidence: 0.1 }),
    row({ url: 'https://a.example/bad', industry: 'payment' }),
  ];
  const { counted, dropped } = run({
    index: mkIndex(items),
    raw: mkRaw(items),
    publishedUrls: new Set(['https://a.example/pub']),
  });
  const total = counted + Object.values(dropped).reduce((sum, n) => sum + n, 0);
  assert.equal(total, items.length);
  assert.equal(dropped.invalid, 1);
});

test('所有行业全零的区域才是缺口，global 不计入门槛', () => {
  const items = [row({ url: 'https://a.example/g', region: 'global', industry: 'telecom' })];
  const { gaps, matrix } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(matrix.global.telecom, 1);
  assert.equal(gaps.includes('global'), false);
  assert.deepEqual(gaps.sort(), ['africa', 'apac', 'cis', 'europe', 'latam', 'mena', 'north-america']);
});

test('区域内只要有一个行业有货，就不算缺口', () => {
  const items = [row({ url: 'https://a.example/i', region: 'mena', industry: 'identity' })];
  const { gaps } = run({ index: mkIndex(items), raw: mkRaw(items) });
  assert.equal(gaps.includes('mena'), false);
});

test('区域分布全部初始化，便于下游按固定键读取', () => {
  const { matrix } = run({ index: mkIndex([row({ url: 'https://a.example/x' })]), raw: mkRaw([]) });
  assert.deepEqual(Object.keys(matrix).sort(), [
    'africa', 'apac', 'cis', 'europe', 'global', 'latam', 'mena', 'north-america',
  ]);
  assert.deepEqual(matrix.apac, { banking: 0, telecom: 0, identity: 0 });
});

test('index 为空直接失败，不产出空矩阵', () => {
  assert.throws(() => run({ index: { items: [] }, raw: mkRaw([]) }), /index\.items/);
});

test('raw 缺失 results 直接失败，不猜时效', () => {
  assert.throws(() => run({ index: mkIndex([row({ url: 'https://a.example/1' })]), raw: {} }), /raw\.results/);
});
