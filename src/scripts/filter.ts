/**
 * 页内筛选：按 query 参数隐藏不匹配的卡片。
 *
 * 只用 getAttribute / classList / querySelector 这类最小 DOM 接口，
 * 好处是能在 Node 里用假对象直接测，不需要 jsdom。
 */

export interface FilterNode {
  getAttribute(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  classList: { add(name: string): void };
}

export interface FilterDocument {
  querySelector(selector: string): FilterNode | null;
  querySelectorAll(selector: string): FilterNode[];
}

/** 返回被隐藏的卡片数；0 表示没筛或筛选条不存在 */
export function applyFilter(doc: FilterDocument, search: string): number {
  const bar = doc.querySelector('.filter-bar');
  if (!bar) return 0;

  const param = bar.getAttribute('data-param');
  if (!param) return 0;

  const valid = (bar.getAttribute('data-values') ?? '').split(',').filter(Boolean);
  const value = new URLSearchParams(search).get(param);
  // 未知取值一律退回全量，避免 ?region=mars 把列表清空
  if (!value || !valid.includes(value)) return 0;

  let hidden = 0;
  for (const card of doc.querySelectorAll('[data-region]')) {
    const own = (card.getAttribute(`data-${param}`) ?? '').split(',').filter(Boolean);
    if (own.includes(value)) continue;
    card.classList.add('is-hidden');
    hidden += 1;
  }

  bar.classList.add('is-filtered');
  for (const chip of doc.querySelectorAll('.filter-chip[data-value]')) {
    if (chip.getAttribute('data-value') === value) chip.setAttribute?.('aria-current', 'true');
  }

  return hidden;
}
