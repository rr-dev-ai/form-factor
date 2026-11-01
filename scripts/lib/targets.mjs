/**
 * 选择本次抓取要跑的源。
 *
 * 两条规则值得单独说明：
 *
 * 1. **显式给出 id 时忽略 `enabled`。** 源表的约定是新增源先关着、单源验证通过
 *    再打开；若选取先按 `enabled` 过滤，关着的源永远选不中，验证这一步就做不了。
 *    显式点名的意图高于开关默认值。
 * 2. **`rssOnly` 始终生效。** 它是本轮的运行模式（日常只跑 RSS），不是单源属性，
 *    所以即使显式点名也不放行 scrape 源。
 */
export function pickTargets(sources, { ids = [], rssOnly = false } = {}) {
  const kindOk = (s) => !rssOnly || s.fetch?.kind === 'rss';
  if (ids.length > 0) return sources.filter((s) => ids.includes(s.id) && kindOk(s));
  return sources.filter((s) => s.enabled && kindOk(s));
}
