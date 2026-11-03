import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruneByWindow,
  resolveWindowHours,
  DEFAULT_WINDOW_HOURS,
  CATCHUP_WINDOW_HOURS,
} from '../scripts/lib/prune.mjs';

const NOW = new Date('2026-11-03T00:20:00+08:00');
const item = (url, publishedAt) => ({ title: url, url, publishedAt });

const run = (items, hours) => pruneByWindow(items, { now: NOW, hours });

test('窗口内的条目保留', () => {
  const { kept, pruned } = run([item('a', '2026-11-02T20:00:00+08:00')]);
  assert.equal(kept.length, 1);
  assert.equal(pruned.length, 0);
});

test('超出窗口的条目剔除', () => {
  const { kept, pruned } = run([item('a', '2026-10-29T00:00:00+08:00')]);
  assert.equal(kept.length, 0);
  assert.equal(pruned.length, 1);
});

test('窗口边界：整点保留，差一分钟剔除', () => {
  const edge = new Date(NOW.getTime() - 72 * 3600000).toISOString();
  const over = new Date(NOW.getTime() - 72 * 3600000 - 60000).toISOString();
  assert.equal(run([item('edge', edge)]).kept.length, 1);
  assert.equal(run([item('over', over)]).kept.length, 0);
});

test('缺 publishedAt 的条目保留，判不了时效不能误伤', () => {
  const { kept, pruned } = run([item('a', null), item('b', undefined)]);
  assert.equal(kept.length, 2);
  assert.equal(pruned.length, 0);
});

test('publishedAt 无法解析时按缺日期处理', () => {
  const { kept } = run([item('a', 'not-a-date')]);
  assert.equal(kept.length, 1);
});

test('空输入不报错', () => {
  assert.deepEqual(run([]), { kept: [], pruned: [] });
  assert.deepEqual(run(undefined), { kept: [], pruned: [] });
});

test('now 无效直接失败，不用 NaN 静默放行', () => {
  assert.throws(() => pruneByWindow([], { now: new Date('nope') }), /需要有效的 now/);
});

test('自定义窗口生效', () => {
  const old = item('a', '2026-10-31T00:00:00+08:00');
  assert.equal(run([old], 120).kept.length, 1);
  assert.equal(run([old], 24).kept.length, 0);
});

test('默认窗口是 72 小时', () => {
  assert.equal(DEFAULT_WINDOW_HOURS, 72);
});

test('显式窗口优先于容错判断', () => {
  assert.deepEqual(resolveWindowHours({ windowArg: '48', yesterdayExists: false }), { hours: 48, catchUp: false });
});

test('前一天抓取存在时用默认窗口', () => {
  assert.deepEqual(resolveWindowHours({ yesterdayExists: true }), { hours: 72, catchUp: false });
});

test('前一天抓取缺失时放宽窗口并标记 catchUp', () => {
  assert.deepEqual(resolveWindowHours({ yesterdayExists: false }), {
    hours: CATCHUP_WINDOW_HOURS,
    catchUp: true,
  });
});

test('非法窗口值直接失败', () => {
  assert.throws(() => resolveWindowHours({ windowArg: '0', yesterdayExists: true }), /正整数/);
  assert.throws(() => resolveWindowHours({ windowArg: 'abc', yesterdayExists: true }), /正整数/);
});
