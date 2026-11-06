import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialDate,
  badgeDate,
  previousAvailableDate,
  nextTrack,
  shiftMonth,
  calendarCells,
  dayState,
} from '../src/lib/podcast-queue.ts';
import { ui } from '../src/lib/i18n.ts';

const dates = [
  { date: '2026-11-05', count: 2 },
  { date: '2026-11-04', count: 3 },
  { date: '2026-10-31', count: 1 },
];

test('首屏：今天有音频用今天，否则回退到最近一天，无数据返回 null', () => {
  assert.equal(initialDate(dates, '2026-11-05'), '2026-11-05');
  assert.equal(initialDate(dates, '2026-11-06'), '2026-11-05');
  assert.equal(initialDate([], '2026-11-05'), null);
});

test('队列来源标记：视图日期与队列日期不一致才显示，且显示队列日期', () => {
  assert.equal(badgeDate('2026-11-05', '2026-11-05'), null);
  assert.equal(badgeDate('2026-11-04', '2026-11-05'), '2026-11-05');
  assert.equal(badgeDate('2026-11-04', null), null);
});

test('前一天以队列所属日期为基准，按倒序索引取', () => {
  const keys = dates.map((d) => d.date);
  assert.equal(previousAvailableDate(keys, '2026-11-05'), '2026-11-04');
  assert.equal(previousAvailableDate(keys, '2026-11-04'), '2026-10-31');
  assert.equal(previousAvailableDate(keys, '2026-10-31'), null);
  assert.equal(previousAvailableDate(keys, '2026-01-01'), null);
});

test('关闭自动连播时不推进队列', () => {
  assert.equal(
    nextTrack({ date: '2026-11-05', index: 0 }, 3, { autoContinue: false, chainPrevious: true, previousDate: '2026-11-04' }),
    null
  );
});

test('队尾且开启连至前一天时切到队列日期的前一天第 0 条', () => {
  assert.deepEqual(
    nextTrack({ date: '2026-11-05', index: 2 }, 3, { autoContinue: true, chainPrevious: true, previousDate: '2026-11-04' }),
    { date: '2026-11-04', index: 0 }
  );
});

test('未到队尾只推进 index，不改日期；队尾无连播开关则停止', () => {
  assert.deepEqual(
    nextTrack({ date: '2026-11-05', index: 0 }, 3, { autoContinue: true, chainPrevious: true, previousDate: '2026-11-04' }),
    { date: '2026-11-05', index: 1 }
  );
  assert.equal(
    nextTrack({ date: '2026-11-05', index: 2 }, 3, { autoContinue: true, chainPrevious: false, previousDate: '2026-11-04' }),
    null
  );
  assert.equal(
    nextTrack({ date: '2026-10-31', index: 0 }, 1, { autoContinue: true, chainPrevious: true, previousDate: null }),
    null
  );
});

test('月份加减跨年正确', () => {
  assert.equal(shiftMonth('2026-11', 1), '2026-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', -2), '2026-09');
});

test('月历 42 格、周一起始、跨月补位日期仍带正确 dateKey', () => {
  const cells = calendarCells('2026-11');
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-10-26');
  assert.equal(cells.find((c) => c.date === '2026-11-01')?.inMonth, true);
  assert.equal(cells.find((c) => c.date === '2026-10-31')?.inMonth, false);
  assert.equal(cells.at(-1).date, '2026-12-06');
  assert.ok(cells.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date)));
});

test('日期三态：未来禁用、选中优先、有音频可选、其余不可选', () => {
  const available = new Set(['2026-11-05', '2026-11-04']);
  assert.equal(dayState('2026-11-05', available, '2026-11-04', '2026-11-05'), 'available');
  assert.equal(dayState('2026-11-04', available, '2026-11-04', '2026-11-05'), 'selected');
  assert.equal(dayState('2026-11-06', available, '2026-11-04', '2026-11-05'), 'future');
  assert.equal(dayState('2026-11-03', available, '2026-11-04', '2026-11-05'), 'disabled');
  assert.equal(dayState('2026-10-31', available, '2026-11-04', '2026-11-05'), 'disabled');
});

test('播客页三语文案齐全，英西语无中文残留', () => {
  const keys = [
    'podcasts', 'podcastAuto', 'podcastChain', 'podcastEmpty',
    'podcastPrevMonth', 'podcastNextMonth', 'podcastPrevDay', 'podcastNextDay',
    'podcastChooseDate', 'podcastQueueFrom', 'podcastPlaying',
  ];
  for (const locale of ['zh', 'en', 'es']) {
    for (const key of keys) {
      assert.equal(typeof ui[locale][key], 'string', `${locale}.${key} 缺失`);
      assert.ok(ui[locale][key].length > 0, `${locale}.${key} 为空`);
    }
  }
  for (const locale of ['en', 'es']) {
    for (const key of keys) {
      assert.ok(!/[\u4e00-\u9fff]/u.test(ui[locale][key]), `${locale}.${key} 含中文`);
    }
  }
});
