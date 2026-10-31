import type { Locale } from './site';

/**
 * 区域枚举。`global` 用于规则与跨国通稿，不计入每日区域覆盖门槛。
 * 归属冲突（俄罗斯、土耳其、墨西哥、埃及、塞浦路斯、阿富汗）见 AGENTS.md。
 */
export type RegionSlug =
  | 'apac'
  | 'cis'
  | 'mena'
  | 'europe'
  | 'north-america'
  | 'latam'
  | 'africa'
  | 'global';

export interface Region {
  slug: RegionSlug;
  name: Record<Locale, string>;
  /** 是否计入每日区域覆盖门槛 */
  covered: boolean;
}

export const regions: Region[] = [
  { slug: 'apac', name: { zh: '亚太', en: 'Asia-Pacific', es: 'Asia-Pacífico' }, covered: true },
  { slug: 'cis', name: { zh: '独联体', en: 'CIS', es: 'CEI' }, covered: true },
  { slug: 'mena', name: { zh: '中东', en: 'Middle East', es: 'Oriente Medio' }, covered: true },
  { slug: 'europe', name: { zh: '欧洲', en: 'Europe', es: 'Europa' }, covered: true },
  { slug: 'north-america', name: { zh: '北美', en: 'North America', es: 'Norteamérica' }, covered: true },
  { slug: 'latam', name: { zh: '拉美', en: 'Latin America', es: 'América Latina' }, covered: true },
  { slug: 'africa', name: { zh: '非洲', en: 'Africa', es: 'África' }, covered: true },
  { slug: 'global', name: { zh: '全球', en: 'Global', es: 'Global' }, covered: false },
];

/** 供 schema 的 z.enum 使用 */
export const REGION_SLUGS = regions.map((r) => r.slug) as [RegionSlug, ...RegionSlug[]];

/** 计入覆盖门槛的区域（7 个） */
export const coveredRegions = regions.filter((r) => r.covered);

export function regionName(slug: string, locale: Locale): string {
  return regions.find((r) => r.slug === slug)?.name[locale] ?? slug;
}

/**
 * 单条内容的区域字段是否自洽。返回问题列表，空数组表示通过。
 * 长度上限交给 zod，这里只查跨字段矛盾。
 */
export function regionIssues(item: { region: string; regions: string[] }): string[] {
  const issues: string[] = [];
  if (!REGION_SLUGS.includes(item.region as RegionSlug)) {
    issues.push(`未知主区域：${item.region}`);
  }
  if (item.regions.includes(item.region)) {
    issues.push('regions 不得包含主区域');
  }
  if (item.regions.includes('global')) {
    issues.push('global 只能作为主区域');
  }
  if (item.region === 'global' && item.regions.length > 0) {
    issues.push('主区域为 global 时 regions 必须为空');
  }
  return issues;
}
