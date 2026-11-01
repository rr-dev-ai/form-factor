import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDayRecord, detectAlerts } from '../scripts/merge-runs.mjs';
import { dayRecordSchema } from '../src/lib/schema.ts';

const DATE = '2026-11-02';

let seq = 0;
const mkItem = ({ industry = 'banking', region = 'europe', publishedAt = '2026-11-02T05:00:00+08:00' } = {}) => {
  seq += 1;
  return { industry, region, publishedAt, slug: `s-${seq}`, id: `i-${seq}` };
};

const mkPool = (
  industry,
  drafts = [],
  { startedAt = '2026-11-02T02:30:00+08:00', mtimeMs = Date.parse('2026-11-02T03:30:00+08:00'), finishedAt, stats } = {}
) => ({
  date: DATE,
  industry,
  mtimeMs,
  doc: {
    date: DATE,
    industry,
    startedAt,
    finishedAt,
    drafts,
    rejected: [{ title: `${industry}-x`, reason: 'r' }],
    stats: stats ?? { candidates: drafts.length, written: drafts.length, skippedByDedup: 0 },
  },
});

const base = (over = {}) => ({
  date: DATE,
  docs: [],
  broken: [],
  selection: null,
  items: [],
  raw: { results: [] },
  supplement: null,
  ...over,
});

test('fetched 从 raw 的 results[].count 求和', () => {
  const day = buildDayRecord(base({ raw: { results: [{ count: 95 }, { count: 65 }, { count: 96 }] } }));
  assert.equal(day.fetched, 256);
});

test('durationMs 优先用池里的 finishedAt，没有才退回文件 mtime', () => {
  const withFinished = [mkPool('banking', [], { finishedAt: '2026-11-02T03:40:00+08:00' })];
  assert.equal(buildDayRecord(base({ docs: withFinished })).durationMs, 70 * 60 * 1000);

  const noFinished = [mkPool('banking', [])];
  assert.equal(buildDayRecord(base({ docs: noFinished })).durationMs, 60 * 60 * 1000);
});

test('supplement 如实读取，不再恒为 false', () => {
  const supplement = { fetchedFor: DATE, gap: ['cis'], items: [{}, {}, {}] };
  const day = buildDayRecord(base({ supplement }));
  assert.equal(day.supplement.triggered, true);
  assert.equal(day.supplement.items, 3);
  assert.deepEqual(day.supplement.sources, ['cis']);
});

test('没有 supplement 文件时视为未触发', () => {
  const day = buildDayRecord(base());
  assert.equal(day.supplement.triggered, false);
  assert.equal(day.supplement.items, 0);
});

test('published 由当日内容条数推得，不信自报', () => {
  const day = buildDayRecord(base({ items: Array.from({ length: 7 }, () => mkItem()) }));
  assert.equal(day.published, 7);
});

test('缺席行业不出现在 industries 里，不补 0', () => {
  const day = buildDayRecord(base({ docs: [mkPool('banking', [])] }));
  assert.deepEqual(Object.keys(day.industries), ['banking']);
});

test('候选与余量取自池的 stats 与剩余草稿', () => {
  const docs = [mkPool('banking', [{}, {}], { stats: { candidates: 12, written: 9, skippedByDedup: 3 } })];
  const day = buildDayRecord(base({ docs }));
  assert.equal(day.candidates, 9);
  assert.equal(day.pooled, 2);
  assert.equal(day.afterDedup, 9);
  assert.equal(day.passed, 9);
});

test('conflicts 与 fallback 从 selection 透传', () => {
  const selection = { conflicts: [{ kind: 'undated', detail: 'x', resolved: false }], fallback: true };
  const day = buildDayRecord(base({ selection }));
  assert.equal(day.fallback, true);
  assert.equal(day.conflicts.length, 1);
});

test('连续两天零发布、或某行业连续三天低于 3 时给出告警', () => {
  const days = [
    { date: '2026-11-02', published: 0, industries: { banking: { published: 0 }, telecom: { published: 0 }, identity: { published: 0 } } },
    { date: '2026-11-01', published: 0, industries: { banking: { published: 2 }, telecom: { published: 1 }, identity: { published: 3 } } },
    { date: '2026-10-31', published: 6, industries: { banking: { published: 4 }, telecom: { published: 1 }, identity: { published: 3 } } },
  ];
  const alerts = detectAlerts(days, '2026-11-02');
  assert.ok(alerts.some((a) => a.includes('连续两天')));
  assert.ok(alerts.some((a) => a.includes('telecom')));
});

test('样本不足时对应规则跳过', () => {
  assert.deepEqual(detectAlerts([{ date: '2026-11-02', published: 0, industries: {} }], '2026-11-02'), []);
});

test('生成的记录能通过 dayRecordSchema，否则 build 会直接失败', () => {
  const day = buildDayRecord(
    base({
      docs: [mkPool('banking', [{ slug: 'a' }])],
      items: [mkItem()],
      raw: { results: [{ count: 3, industries: ['banking'] }] },
      supplement: { gap: ['apac'], items: [{}] },
      selection: { conflicts: [{ kind: 'undated', detail: 'x' }], fallback: false },
    })
  );
  const parsed = dayRecordSchema.safeParse(day);
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2));
});
