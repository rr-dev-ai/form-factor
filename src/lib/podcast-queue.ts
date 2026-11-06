/**
 * 播客页的纯逻辑：首屏回退、队列推进、月历。
 * 客户端脚本只做 DOM 与 audio 事件，判断全部放这里，便于逐条验证。
 *
 * 关键不变式：queue.date 是用户点下播放那一刻的日期，不是当前视图日期。
 */
export interface Queue {
  date: string;
  index: number;
}

export interface DayCount {
  date: string;
  count: number;
}

/** 首屏：今天有音频就用今天，否则回退最近一天。用户手动选空日期不再回退。 */
export function initialDate(dates: DayCount[], todayKey: string): string | null {
  if (dates.length === 0) return null;
  return dates.some((d) => d.date === todayKey) ? todayKey : dates[0].date;
}

/** 视图与队列日期不一致时，播放条显示队列来源日期；一致时隐藏。 */
export function badgeDate(viewDate: string, queueDate: string | null): string | null {
  if (!queueDate || viewDate === queueDate) return null;
  return queueDate;
}

/** dates 为倒序。以前一天为基准取"更早的那天"，不是当前视图日期。 */
export function previousAvailableDate(dates: string[], date: string): string | null {
  const i = dates.indexOf(date);
  return i >= 0 && i + 1 < dates.length ? dates[i + 1] : null;
}

export function nextTrack(
  queue: Queue,
  count: number,
  { autoContinue, chainPrevious, previousDate }: {
    autoContinue: boolean;
    chainPrevious: boolean;
    previousDate: string | null;
  }
): Queue | null {
  if (!autoContinue) return null;
  if (queue.index + 1 < count) return { date: queue.date, index: queue.index + 1 };
  if (chainPrevious && previousDate) return { date: previousDate, index: 0 };
  return null;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** 6 周 × 7 天，周一起始；跨月补位的日期仍返回真实 dateKey，窗内即可选。 */
export function calendarCells(monthKey: string): Array<{ date: string; inMonth: boolean }> {
  const [y, m] = monthKey.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, 1 - offset + i)).toISOString().slice(0, 10);
    return { date, inMonth: date.slice(0, 7) === monthKey };
  });
}

export type DayState = 'selected' | 'available' | 'future' | 'disabled';

export function dayState(
  dateKey: string,
  available: Set<string>,
  selected: string,
  todayKey: string
): DayState {
  if (dateKey > todayKey) return 'future';
  if (dateKey === selected) return 'selected';
  if (available.has(dateKey)) return 'available';
  return 'disabled';
}
