export const locales = ['zh', 'en', 'es'] as const;
export type Locale = (typeof locales)[number];

export const site = {
  name: 'Form Factor',
  tagline: {
    zh: 'SIM、卡与身份凭证的形态演进',
    en: 'How SIM, card and identity credentials take shape',
    es: 'La evolución de las credenciales SIM, de pago y de identidad',
  },
  description: {
    zh: '每日追踪 SIM/eSIM、发卡与收单、证照与身份识别三条凭证链路的形态演进，由 AI 自动采集、去重、筛选并翻译。',
    en: 'Daily tracking of how SIM, payment and identity credentials evolve — collected, deduplicated, filtered and translated by AI.',
    es: 'Seguimiento diario de la evolución de las credenciales SIM, de pago y de identidad, recopilado y traducido por IA.',
  },
  baseUrl: 'https://rr-dev-ai.github.io',
  defaultLocale: 'zh' as Locale,

  /**
   * 索引开关。false 时全站注入 noindex，且不生成任何索引相关产物。
   * 注意：不通过 robots.txt 全站 disallow，否则微信 / Slack / Twitter
   * 的链接预览爬虫也无法抓取，分享出去只剩一条光秃秃的地址。
   */
  indexable: false,

  /** 站点时区，用于把 publishedAt 归入正确的日期页 */
  timeZone: 'Asia/Shanghai',

  /** 每行业每日发布上限，超出时按置信度截断 */
  perIndustryDailyLimit: 5,

  /** 每行业每日发布下限，未达标时记入 runs.json 的 missing，不阻断发布 */
  perIndustryDailyMin: 3,

  /** 每个计入覆盖的区域每日至少 1 条 */
  regionsDailyMin: 1,

  /** 搜索索引最多保留的月数，超出后旧月份不再生成分片 */
  searchIndexMonths: 12,
} as const;
