import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Locale } from '../config/audio.ts';

/**
 * 站点侧音频索引。manifest 是唯一真相源：页面不推断某条是否在窗口内，
 * 只查 manifest 有没有这条记录。磁盘上存在的日期就是窗口内日期——
 * 窗口裁剪只发生在离线生成脚本里。
 */

const AUDIO_DIR = path.join(process.cwd(), 'content', '_meta', 'audio');

const audioEntrySchema = z.object({
  /** 相对路径，不含域名。域名在 config/audio.ts，迁移时不改数据。 */
  file: z.string().regex(/^audio\/[a-z]{2}\/[a-z0-9-]+\.[0-9a-f]{8}\.mp3$/),
  hash: z.string().regex(/^[0-9a-f]{8}$/),
  bytes: z.number().int().positive(),
  duration: z.number().positive(),
  voice: z.string().min(1),
  speed: z.number().positive(),
});

const audioItemSchema = z.object({
  zh: audioEntrySchema.optional(),
  en: audioEntrySchema.optional(),
  es: audioEntrySchema.optional(),
});

export const manifestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string().min(1),
  renderer: z.number().int().nonnegative(),
  /** slug → 各语种的一条音频记录。缺某个语种是合法的（该条合成失败）。 */
  items: z.record(z.string(), audioItemSchema),
});

export type AudioManifest = z.infer<typeof manifestSchema>;

export interface AudioMeta {
  slug: string;
  date: string;
  locale: Locale;
  file: string;
  hash: string;
  bytes: number;
  duration: number;
  voice: string;
  speed: number;
}

/** 校验单个 manifest。任何不合规都中止，不静默降级成"没有音频"。 */
export function parseManifest(raw: unknown, source = '<manifest>'): AudioManifest {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  · ${i.path.join('.') || '(根节点)'}：${i.message}`)
      .join('\n');
    throw new Error(`manifest 校验失败：${source}\n${detail}`);
  }
  const fileDate = path.basename(source, '.json');
  if (/^\d{4}-\d{2}-\d{2}$/.test(fileDate) && fileDate !== parsed.data.date) {
    throw new Error(`manifest 校验失败：${source} 的 date 与文件名不一致`);
  }
  return parsed.data;
}

/** 读取按天拆分的全部 manifest，按日期建索引。 */
export function readManifestFiles(dir: string): Map<string, AudioManifest> {
  const out = new Map<string, AudioManifest>();
  if (!fs.existsSync(dir)) return out;

  const errors: string[] = [];
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  for (const name of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      out.set(name.slice(0, -5), parseManifest(raw, name));
    } catch (err) {
      errors.push(`  · ${name}：${(err as Error).message}`);
    }
  }
  if (errors.length) {
    throw new Error(`manifest 校验失败，共 ${errors.length} 处：\n${errors.join('\n')}`);
  }
  return out;
}

/** manifest 里的 slug 必须存在于内容库，否则撤稿后页面会渲染出幽灵条目。 */
export function validateManifestSlugs(manifests: Map<string, AudioManifest>, knownSlugs: Set<string>): void {
  const unknown: string[] = [];
  for (const manifest of manifests.values()) {
    for (const slug of Object.keys(manifest.items)) {
      if (!knownSlugs.has(slug)) unknown.push(`${manifest.date}:${slug}`);
    }
  }
  if (unknown.length) {
    throw new Error(`manifest 校验失败：内容库中不存在的 slug：${unknown.join(', ')}`);
  }
}

export interface AudioIndex {
  audioFor(slug: string, locale: Locale): AudioMeta | null;
  audioDates(locale: Locale): Array<{ date: string; count: number }>;
  audioByDate(locale: Locale, date: string): AudioMeta[];
  manifests: Map<string, AudioManifest>;
}

/** 纯函数式构造，便于用 fixture 目录测试，也便于 Task 10 的分片生成。 */
export function createAudioIndex(dir: string): AudioIndex {
  const manifests = readManifestFiles(dir);
  const dates = [...manifests.keys()].sort((a, b) => b.localeCompare(a));

  function audioByDate(locale: Locale, date: string): AudioMeta[] {
    const manifest = manifests.get(date);
    if (!manifest) return [];
    const out: AudioMeta[] = [];
    for (const [slug, locales] of Object.entries(manifest.items)) {
      const entry = locales[locale];
      if (entry) out.push({ slug, date, locale, ...entry });
    }
    return out;
  }

  function audioFor(slug: string, locale: Locale): AudioMeta | null {
    for (const date of dates) {
      const entry = manifests.get(date)?.items[slug]?.[locale];
      if (entry) return { slug, date, locale, ...entry };
    }
    return null;
  }

  function audioDates(locale: Locale): Array<{ date: string; count: number }> {
    return dates
      .map((date) => ({ date, count: audioByDate(locale, date).length }))
      .filter((d) => d.count > 0);
  }

  return { audioFor, audioDates, audioByDate, manifests };
}

let defaultIndex: AudioIndex | null = null;
function index(): AudioIndex {
  if (!defaultIndex) defaultIndex = createAudioIndex(AUDIO_DIR);
  return defaultIndex;
}

export function audioFor(slug: string, locale: Locale): AudioMeta | null {
  return index().audioFor(slug, locale);
}

export function audioDates(locale: Locale): Array<{ date: string; count: number }> {
  return index().audioDates(locale);
}

export function audioByDate(locale: Locale, date: string): AudioMeta[] {
  return index().audioByDate(locale, date);
}
