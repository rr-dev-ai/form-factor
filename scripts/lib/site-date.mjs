/**
 * 站点日期工具。仓库里有两种时间，别混：
 *
 *   日期       content/_raw/<date>.json、runs.json.date、归档页路径
 *              → 一律取站点时区 Asia/Shanghai
 *   时间戳     fetchedAt、publishedAt
 *              → 带时区的 ISO 8601
 *
 * 抓取从北京 00:20 提前到 23:40 后，脚本启动时站点时区还停在前一天，
 * 但这一跑服务的是次日。所以日期不能由 `now` 直接推，必须由调用方显式
 * 传 `--for-date`；本模块只负责校验，不做「跨零点就加一天」这类猜测。
 */

export const SITE_TZ = 'Asia/Shanghai';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 按站点时区取日期（YYYY-MM-DD），不依赖运行机器的本地时区 */
export function siteDate(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 日期键前后位移，按 UTC 自然日计算（不受夏令时影响） */
export function shiftDate(key, days) {
  if (!DATE_RE.test(key)) throw new Error(`日期必须是 YYYY-MM-DD：${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * 解析本次抓取归属的日期。
 *
 * 显式传值时只校验格式与真实性，不与 `now` 比对——排队延迟可能到一小时以上，
 * 拿 `now` 卡范围只会把正常的跑批判成异常。
 *
 * @returns {{ date: string, explicit: boolean }}
 */
export function resolveForDate({ now, arg } = {}) {
  const fallback = siteDate(now ?? new Date());
  if (arg === undefined || arg === null) return { date: fallback, explicit: false };

  const match = DATE_RE.exec(String(arg).trim());
  if (!match) throw new Error(`--for-date 必须是 YYYY-MM-DD：${arg}`);

  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // 拦住 2026-02-30 / 2026-13-01 这类正则能过、日历不存在的值
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new Error(`--for-date 必须是合法的 YYYY-MM-DD：${arg}`);
  }
  return { date: probe.toISOString().slice(0, 10), explicit: true };
}
