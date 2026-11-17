/**
 * 部署路径前缀。站点部署在 GitHub Pages 的项目路径 /form-factor（见 astro.config.mjs 的 base），
 * import.meta.env.BASE_URL 自带这个前缀，页面内链接统一经 href() / localePath() 拼装。
 * 换部署路径只改 astro.config.mjs 的 base；不要在本文件或页面里硬编码前缀。
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
