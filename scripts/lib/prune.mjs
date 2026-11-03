/**
 * 抓取阶段的时间剪枝。
 *
 * `_raw` 原本装的是各源列表页的当前快照：RSS 一次给最近 25 条，其中一半以上
 * 是几天前甚至上周的稿子。下游标注任务对着整批逐条判断，等于每天把往期内容
 * 重标一遍。AGENTS.md 的时效窗口是 72 小时，超出窗口的条目在进入判断前就该
 * 被挡掉——这件事在抓取时做，比让标注任务做便宜得多。
 *
 * 两条不砍的例外：
 * - 没有 publishedAt 的条目（部分 RSS 缺 pubDate）。判不了时效，砍了就误伤整源。
 * - publishedAt 无法解析的条目，同上。
 *
 * 剪枝只影响 `items`，被砍的条目数按源记进 stats，源长期被砍空说明它更新慢，
 * 是值得看的健康度信号，但不该让下游看到这些条目。
 */

export const DEFAULT_WINDOW_HOURS = 72;

/** 前一天抓取缺失时放宽到的窗口：容忍一次失败，别让那天的稿子隔天全过期 */
export const CATCHUP_WINDOW_HOURS = 120;

/**
 * 纯函数：不读盘。
 * @param {{title: string, url: string, publishedAt: string|null}[]} items
 * @returns {{kept: object[], pruned: object[]}}
 */
export function pruneByWindow(items, { now, hours = DEFAULT_WINDOW_HOURS }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('pruneByWindow 需要有效的 now');
  }
  const kept = [];
  const pruned = [];

  for (const item of items ?? []) {
    const timestamp = item?.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (Number.isNaN(timestamp)) {
      kept.push(item);
      continue;
    }
    if ((now.getTime() - timestamp) / 3600000 > hours) {
      pruned.push(item);
      continue;
    }
    kept.push(item);
  }

  return { kept, pruned };
}

/**
 * 前一天的文件不在，说明上一次抓取没成功——此时用更宽的窗口把那天可能漏掉的
 * 稿子捞回来。只判文件存在性，不判内容：坏文件交给下游报错，不在这里吞掉。
 */
export function resolveWindowHours({ windowArg, yesterdayExists }) {
  if (windowArg !== undefined) {
    const parsed = Number(windowArg);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`--window-hours 需要正整数，收到：${windowArg}`);
    }
    return { hours: parsed, catchUp: false };
  }
  return yesterdayExists
    ? { hours: DEFAULT_WINDOW_HOURS, catchUp: false }
    : { hours: CATCHUP_WINDOW_HOURS, catchUp: true };
}
