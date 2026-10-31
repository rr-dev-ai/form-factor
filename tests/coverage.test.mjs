import test from 'node:test';
import assert from 'node:assert/strict';
import { toDateKey, shiftDateKey, coverageOf, regionCoverage } from '../src/lib/content.ts';

const at = (iso, region) => ({ publishedAt: iso, region, regions: [] });

test('toDateKey 按北京时间归日', () => {
  assert.equal(toDateKey('2026-10-30T16:30:00Z'), '2026-10-31');
  assert.equal(toDateKey('2026-10-31T15:59:00Z'), '2026-10-31');
});

test('shiftDateKey 跨月回退', () => {
  assert.equal(shiftDateKey('2026-10-31', -1), '2026-10-30');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
});

test('coverageOf 只按主区域计，global 不入门槛', () => {
  const items = [
    at('2026-10-31T09:00:00+08:00', 'apac'),
    at('2026-10-31T10:00:00+08:00', 'apac'),
    at('2026-10-31T11:00:00+08:00', 'global'),
  ];
  const { covered, missing } = coverageOf('2026-10-31', items);
  assert.deepEqual(covered.map((r) => r.slug), ['apac']);
  assert.equal(missing.length, 6);
});

test('coverageOf 无内容当天全部记为缺口', () => {
  const { covered, missing } = coverageOf('2026-10-01', []);
  assert.equal(covered.length, 0);
  assert.equal(missing.length, 7);
});

test('regionCoverage 按自然日统计，缺日计 0', () => {
  const items = [at('2026-10-31T09:00:00+08:00', 'apac')];
  const rows = regionCoverage('2026-10-31', 3, items);
  assert.equal(rows.length, 7);
  const apac = rows.find((r) => r.slug === 'apac');
  assert.equal(apac.days, 1);
  assert.equal(apac.total, 3);
});

test('regionCoverage 的 30 天窗口按日历日算，不跳过空日', () => {
  const items = [at('2026-10-31T09:00:00+08:00', 'apac')];
  const rows = regionCoverage('2026-10-31', 30, items);
  assert.equal(rows.find((r) => r.slug === 'apac').total, 30);
});
