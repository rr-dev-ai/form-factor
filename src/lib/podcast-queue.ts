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

/**
 * 乱序 fetch：只有最后一次请求的日期可以落到 DOM 上。
 * 快速连点 A→B 时，A 的响应晚到也不能覆盖 B 的列表与日期栏。
 */
export function isCurrentView(requested: string, currentViewDate: string): boolean {
  return requested === currentViewDate;
}

/**
 * 换条目必然复位播放控制。一次瞬时 error 不应让后续所有条目永久禁用
 * 播放/暂停按钮；错误态只属于当前这一条音频。
 */
export function onTrackStart(_hadError: boolean): { disabled: boolean; audioError: boolean } {
  return { disabled: false, audioError: false };
}

/**
 * 列表行的点击语义：点在"正在播的那一条"上是暂停/续播，点别的条目才换曲。
 *
 * 必须同时比对队列日期：切到别的日期后列表是另一批条目，index 相同也
 * 不是同一条，否则会暂停到别的日期的音频上。
 */
export function rowAction(queue: Queue | null, date: string, index: number): 'toggle' | 'start' {
  return queue && queue.date === date && queue.index === index ? 'toggle' : 'start';
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
