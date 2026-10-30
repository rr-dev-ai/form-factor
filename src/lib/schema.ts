import { z } from 'zod';

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
 * 一条新闻的契约。AI 任务按此写入，构建按此校验，页面按此渲染。
 * 字段变更必须同步 content/ 下所有文件，否则构建失败并定位到具体字段。
 */
export const newsItemSchema = z.object({
  id: z.string().min(3),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只允许小写字母、数字与连字符'),
  industry: z.enum(['banking', 'telecom', 'identity']),
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
  summary: localized(600),
  whyItMatters: localized(400),
  confidence: z.number().min(0).max(1),
  ai: z.object({
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    tokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  }),
});

export type NewsItem = z.infer<typeof newsItemSchema>;

/** 单次采集运行的记录，供 /status 页面展示 */
export const runRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  industry: z.enum(['banking', 'telecom', 'identity']),
  startedAt: isoDateTime,
  durationMs: z.number().int().nonnegative(),
  fetched: z.number().int().nonnegative(),
  afterDedup: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })).default([]),
  failedSources: z.array(z.object({ name: z.string(), stage: z.string(), error: z.string() })).default([]),
  costUsd: z.number().nonnegative().default(0),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
