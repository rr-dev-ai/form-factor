import type { Locale } from '../config/site.ts';
import { t } from './i18n.ts';

/** 主导航唯一顺序定义，Base.astro 与测试共用。 */
export const NAV_KEYS = ['home', 'industries', 'regions', 'podcasts', 'archive', 'status'] as const;
export type NavKey = (typeof NAV_KEYS)[number];

const PATHS: Record<NavKey, string | null> = {
  home: '/',
  industries: null,
  regions: null,
  podcasts: '/podcasts',
  archive: '/archive',
  status: '/status',
};

export interface NavLink {
  key: NavKey;
  label: string;
  path: string | null;
}

export function navLinks(locale: Locale): NavLink[] {
  const dict = t(locale);
  return NAV_KEYS.map((key) => ({ key, label: dict[key], path: PATHS[key] }));
}
