/**
 * 页内筛选：按 query 参数隐藏不匹配的卡片，多个维度取交集。
 *
 * 只用 getAttribute / setAttribute / classList 这类最小 DOM 接口，
 * 好处是能在 Node 里用假对象直接测，不需要 jsdom。
 */

export interface FilterNode {
  getAttribute(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  classList: { add(name: string): void };
}

export interface FilterDocument {
  querySelectorAll(selector: string): FilterNode[];
}

/**
 * 返回被隐藏的卡片数；0 表示没有生效的筛选。
 * 每个 chip 自带 data-param 与 data-value，因此加一个维度不需要改这里。
 */
export function applyFilters(doc: FilterDocument, search: string): number {
  const params = new URLSearchParams(search);
  const chips = doc.querySelectorAll('.filter-chip[data-value]');

  // 每个维度有哪些合法取值，由该维度的 chip 自己声明
  const validByParam = new Map<string, Set<string>>();
  for (const chip of chips) {
    const param = chip.getAttribute('data-param');
    const value = chip.getAttribute('data-value');
    if (!param || !value) continue;
    const set = validByParam.get(param) ?? new Set<string>();
    set.add(value);
    validByParam.set(param, set);
  }

  const active: Array<{ param: string; value: string }> = [];
  for (const [param, valid] of validByParam) {
    const value = params.get(param);
    // 未知取值一律忽略，避免 ?tag=mars 把列表清空
    if (value && valid.has(value)) active.push({ param, value });
  }

  for (const chip of chips) {
    const param = chip.getAttribute('data-param');
    const value = chip.getAttribute('data-value');
    if (!param || !value) continue;
    // 点这个 chip 时保留另一个维度的当前取值
    const next = new URLSearchParams(params);
    next.set(param, value);
    chip.setAttribute?.('href', `?${next.toString()}`);
    if (active.some((entry) => entry.param === param && entry.value === value)) {
      chip.setAttribute?.('aria-current', 'true');
    }
  }

  for (const bar of doc.querySelectorAll('.filter-bar')) {
    const param = bar.getAttribute('data-param');
    if (param && active.some((entry) => entry.param === param)) bar.classList.add('is-filtered');
  }

  for (const clear of doc.querySelectorAll('.filter-chip--clear')) {
    const param = clear.getAttribute('data-param');
    if (!param) continue;
    const next = new URLSearchParams(params);
    next.delete(param);
    const query = next.toString();
    clear.setAttribute?.('href', query ? `?${query}` : '?');
  }

  if (!active.length) return 0;

  let hidden = 0;
  for (const card of doc.querySelectorAll('[data-region]')) {
    const matches = active.every(({ param, value }) => {
      const own = (card.getAttribute(`data-${param}`) ?? '').split(',').filter(Boolean);
      return own.includes(value);
    });
    if (matches) continue;
    card.classList.add('is-hidden');
    hidden += 1;
  }
  return hidden;
}
