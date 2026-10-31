import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePartials } from '../scripts/merge-runs.mjs';

const p = (industry, published) => ({
  date: '2026-10-31',
  startedAt: '2026-10-31T03:00:00+08:00',
  durationMs: 60000,
  industries: { [industry]: { fetched: 10, afterDedup: 5, passed: 2, published } },
  rejected: [{ title: `${industry}-x`, reason: 'r', industry }],
  failedSources: [],
});

test('三个 partial 合并成一条日记录', () => {
  const day = mergePartials([p('banking', 4), p('telecom', 3), p('identity', 3)]);
  assert.equal(day.published, 10);
  assert.equal(day.industries.banking.published, 4);
  assert.equal(day.rejected.length, 3);
});

test('缺行业时按缺席处理，不补 0', () => {
  const day = mergePartials([p('banking', 4)]);
  assert.equal(day.published, 4);
  assert.deepEqual(Object.keys(day.industries), ['banking']);
});

test('四个计数由各行业求和得出', () => {
  const day = mergePartials([p('banking', 4), p('telecom', 3)]);
  assert.equal(day.fetched, 20);
  assert.equal(day.passed, 4);
  assert.equal(day.migrated, false);
});
