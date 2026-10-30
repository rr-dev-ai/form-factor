/**
 * 部署路径前缀。GitHub Pages 用户站部署在根路径，base 为 '/'；
 * 若改成项目站（username.github.io/repo），把 astro.config.mjs 的 base 改成 '/repo'，
 * 这里会自动带上前缀，页面内所有链接无需改动。
 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export function href(path: string): string {
  if (!path || path === '/') return `${BASE}/`;
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** locale 前缀链接：localePath('zh', '/banking') → /zh/banking */
export function localePath(locale: string, path: string): string {
  if (!path || path === '/') return href(`/${locale}/`);
  return href(`/${locale}${path}`);
}
