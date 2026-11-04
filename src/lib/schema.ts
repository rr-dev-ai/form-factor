import { z } from 'zod';
import { REGION_SLUGS } from '../config/regions.ts';

/** 带时区的 ISO 8601。手写正则而非依赖 zod 版本的 datetime API，避免升降级时静默失效。 */
const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, '需要带时区的 ISO 8601 时间，如 2026-10-30T09:15:00+08:00');

const httpUrl = z.string().regex(/^https?:\/\/\S+$/, '需要 http(s) 链接');

const localized = (max: number) =>
  z.object({
    zh: z.string().min(1).max(max),
    en: z.string().min(1).max(max),
    es: z.string().min(1).max(max),
  });

/**
 * 三语上限不同时使用。一个汉字的信息量约等于 2.5–3.5 个拉丁字符，
 * 三语共用同一个字符上限，等于强迫英西语删掉一半内容。
 */
const localizedByLang = (max: { zh: number; en: number; es: number }) =>
  z.object({
    zh: z.string().min(1).max(max.zh),
    en: z.string().min(1).max(max.en),
    es: z.string().min(1).max(max.es),
  });

/**
 * 正文的一个块。用块而不是整段 HTML：页面负责排版，
 * 内容只声明"这是一句小标题 / 一段话 / 一组要点"。
 */
const bodyBlock = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('h'), text: localized(80) }),
  z.object({ kind: z.literal('p'), text: localized(1400) }),
  z.object({ kind: z.literal('ul'), items: z.array(localized(400)).min(2).max(6) }),
]);

/**
 * 一条新闻的契约。AI 任务按此写入，构建按此校验，页面按此渲染。
 * 字段变更必须同步 content/ 下所有文件，否则构建失败并定位到具体字段。
 */
export const newsItemSchema = z.object({
  id: z.string().min(3),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只允许小写字母、数字与连字符'),
  industry: z.enum(['banking', 'telecom', 'identity']),
  /** 主区域：这条变化实际落在哪个市场 */
  region: z.enum(REGION_SLUGS),
  /** 涉及的其他区域，不含主区域；global 只能作为主区域 */
  regions: z.array(z.enum(REGION_SLUGS)).max(3).default([]),
  tags: z.array(z.string()).min(1).max(6),
  status: z.enum(['published', 'archived']),
  publishedAt: isoDateTime,
  ingestedAt: isoDateTime,
  originalLang: z.enum(['zh', 'en', 'es']),
  sources: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        url: httpUrl,
        lang: z.enum(['zh', 'en', 'es']).optional(),
        publishedAt: isoDateTime.optional(),
      })
    )
    .min(1)
    .max(6),
  title: localized(120),
  /** 一句话导语，出现在卡片与详情页开头 */
  summary: localized(600),
  /** 正文：2–8 个块，把事件讲清楚，可含小标题与要点列表 */
  body: z.array(bodyBlock).min(2).max(8),
  /**
   * 中文按字、英西按字符，不用同一把尺：一个汉字对应的是一个词，不是一个字母。
   * 实测 1 汉字 ≈ 2.9 个拉丁字符，故按 1:3 设上限。
   */
  whyItMatters: localizedByLang({ zh: 400, en: 1200, es: 1200 }),
  confidence: z.number().min(0).max(1),
  ai: z.object({
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    tokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  }),
});

export type NewsItem = z.infer<typeof newsItemSchema>;

/**
 * 草稿：编辑写进备选池的形态。
 * 三个字段由提升脚本在发布时统一填写，编辑不许写——否则会重演
 * 2026-11-01 那种「文件 03:07 写盘、publishedAt 却标 04:20」的假时间。
 */
export const draftItemSchema = newsItemSchema.omit({
  status: true,
  publishedAt: true,
  ingestedAt: true,
});

export type DraftItem = z.infer<typeof draftItemSchema>;

/**
 * 一天的运行记录，供 /status 页展示。
 * 一天一条而不是每行业一条：状态页要的是「当天整体是否达标」，
 * 行业明细放在 industries 里。
 */
const industryDaySchema = z.object({
  fetched: z.number().int().nonnegative(),
  afterDedup: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
});

export const dayRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: isoDateTime,
  durationMs: z.number().int().nonnegative(),
  fetched: z.number().int().nonnegative(),
  afterDedup: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  industries: z
    .object({
      banking: industryDaySchema,
      telecom: industryDaySchema,
      identity: industryDaySchema,
    })
    .partial(),
  /** 当天已覆盖的区域（只算主区域） */
  regions: z.array(z.enum(REGION_SLUGS)).default([]),
  /** 当天未覆盖的区域 */
  missing: z.array(z.enum(REGION_SLUGS)).default([]),
  /** 三个池内候选总数（stats.written 之和） */
  candidates: z.number().int().nonnegative().default(0),
  /** 当日池内未被提升的条数 */
  pooled: z.number().int().nonnegative().default(0),
  /** 是否由 05:00 兜底提升 */
  fallback: z.boolean().default(false),
  /** 终审裁决过的冲突 */
  conflicts: z
    .array(
      z.object({
        kind: z.string(),
        detail: z.string(),
        resolved: z.boolean().default(false),
      })
    )
    .default([]),
  supplement: z
    .object({
      triggered: z.boolean().default(false),
      items: z.number().int().nonnegative().default(0),
      sources: z.array(z.string()).default([]),
    })
    .default({}),
  rejected: z
    .array(z.object({ title: z.string(), reason: z.string(), industry: z.string() }))
    .default([]),
  failedSources: z
    .array(z.object({ name: z.string(), stage: z.string(), error: z.string() }))
    .default([]),
  costUsd: z.number().nonnegative().default(0),
  /** 由旧的「每行业一条」记录合并而来，覆盖数据不可考 */
  migrated: z.boolean().default(false),
});

export type DayRecord = z.infer<typeof dayRecordSchema>;
