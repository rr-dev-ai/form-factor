import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AUDIO_VOICES,
  AUDIO_SPEED,
  AUDIO_GAP,
  WINDOW_DAYS,
  RENDER_VERSION,
  LOCALES,
  ENGINE_URL,
  LEAD_IN,
  LEAD_OUT,
  SAMPLE_RATE,
  CHANNELS,
  BITS_PER_SAMPLE,
} from '../src/config/audio.ts';
import { loadNews, toDateKey } from '../src/lib/content.ts';
import { assembleSegments, pauseBetween } from './lib/tts-text.mjs';
import { renderHash } from './lib/tts-hash.mjs';
import { assignVoices } from './lib/tts-voice.mjs';
import { loadManifests, windowDates } from './lib/tts-manifest.mjs';
import { parseWav, buildWav, silence, concatPcm, encodeMp3 } from './lib/tts-audio.mjs';

const MANIFEST_DIR = path.join(process.cwd(), 'content', '_meta', 'audio');
const STAGING_DIR = path.join(process.cwd(), 'audio-staging');
const START_COMMAND =
  'cd C:/Users/RR/WorkBuddy/2026-11-05-11-07-43/kokoro-local && ' +
  '.venv/Scripts/python.exe server.py --port 8880 --warm';

/** 每种语语种前端对应的 lang_code，服务端按音色首字母也能推断，显式给出更稳。 */
const LANG = { zh: 'zh', en: 'en', es: 'es' };

/** 估算用：中文实测约 280–303 字/分，英西语按字符估。只用于打印，不影响产物。 */
const CHARS_PER_SECOND = { zh: 4.8, en: 15, es: 15 };
const RTF = 0.054;
const BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);

function manifestVoiceMap(manifests) {
  const existing = new Map();
  for (const [date, manifest] of manifests) {
    for (const [slug, locales] of Object.entries(manifest.items ?? {})) {
      for (const [locale, entry] of Object.entries(locales ?? {})) {
        if (entry?.voice) existing.set(`${date}|${slug}|${locale}`, entry.voice);
      }
    }
  }
  return existing;
}

/**
 * 「已生成但尚未发布」也要冻结音色。发布前 manifest 是空的，若只看 manifest，
 * 新增同日文章会让 assignVoices 重排旧条目的首选音色 → hash 变 → 重复合成 +
 * 旧 hash 文件成为孤儿（会被 Task 8 的 rclone sync 一并上传）。
 */
export function loadStagedVoices(stagingDir) {
  const out = new Map();
  for (const locale of LOCALES) {
    const dir = path.join(stagingDir, 'audio', locale);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.mp3.json')) continue;
      const mp3Path = path.join(dir, name.slice(0, -5));
      if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        if (meta?.date && meta?.slug && meta?.locale && meta?.voice) {
          out.set(`${meta.date}|${meta.slug}|${meta.locale}`, meta.voice);
        }
      } catch {
        // 坏旁挂不阻断整批；该文件也没有合法 mp3 可复用。
      }
    }
  }
  return out;
}

/**
 * 生成计划：窗口过滤 → 已冻结音色沿用 → 逐条逐语种算 hash → 命中 manifest 则跳过。
 * 纯函数，不发请求、不读磁盘（内容库与 manifest 由调用方传入）。
 */
export function planJobs({
  items,
  manifests = new Map(),
  todayKey,
  today = todayKey,
  windowDays = WINDOW_DAYS,
  all = false,
  dateFilter = null,
  stagingDir = null,
}) {
  if (!todayKey) throw new Error('planJobs 需要 todayKey');
  const inside = new Set(all ? [] : windowDates(todayKey, windowDays));
  const candidates = [];

  for (const item of items) {
    if (item.status !== 'published') continue;
    const date = toDateKey(item.publishedAt);
    if (dateFilter && date !== dateFilter) continue;
    if (!all && !inside.has(date)) continue;

    for (const locale of LOCALES) {
      candidates.push({
        item,
        locale,
        date,
        segments: assembleSegments(item, locale),
        key: `${date}|${item.slug}|${locale}`,
      });
    }
  }

  const frozen = manifestVoiceMap(manifests);
  if (stagingDir) {
    for (const [key, voice] of loadStagedVoices(stagingDir)) {
      if (!frozen.has(key)) frozen.set(key, voice);
    }
  }
  const voices = assignVoices(candidates, frozen, AUDIO_VOICES);
  const jobs = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const { item, locale, date, segments, key } = candidate;
    const voice = voices.get(key);
    const speed = AUDIO_SPEED[locale][voice];
    if (typeof speed !== 'number') {
      throw new Error(`音色 ${locale}.${voice} 不在 speed 表中：请递增 RENDER_VERSION 并全量重建`);
    }
    const gap = AUDIO_GAP[locale];
    const hash = renderHash({ locale, voice, speed, gap, segments, version: RENDER_VERSION });
    const current = manifests.get(date)?.items?.[item.slug]?.[locale];

    if (current?.hash === hash && current?.voice === voice) {
      skipped += 1;
      continue;
    }
    jobs.push({ item, locale, date, hash, voice, speed, gap, segments, generatedFor: today });
  }

  return { jobs, skipped };
}

/** 生成前必须探测 /health。失败直接抛错，错误信息里带启动命令。 */
export async function ensureEngine(baseUrl = ENGINE_URL) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.status && body.status !== 'ok') throw new Error(`状态 ${body.status}`);
  } catch (err) {
    throw new Error(
      `TTS 服务未启动或不可达：${baseUrl}/health（${err.message}）\n启动命令：${START_COMMAND}`
    );
  }
}

/** 单个段落 → WAV PCM。请求格式与 OpenAI /v1/audio/speech 兼容。 */
export async function synthSegment(baseUrl, { text, voice, speed, gap, locale }) {
  const res = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice,
      speed,
      gap,
      response_format: 'wav',
      lang: LANG[locale],
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`TTS 合成失败：HTTP ${res.status} ${detail}`);
  }
  const parsed = parseWav(Buffer.from(await res.arrayBuffer()));
  if (parsed.sampleRate !== SAMPLE_RATE || parsed.channels !== CHANNELS) {
    throw new Error(`TTS 输出格式不符：${parsed.sampleRate}Hz / ${parsed.channels}ch`);
  }
  return parsed;
}

/** 首尾留白 + 逐段拼接 + 按相邻 kind 插入静音，返回拼接后的 PCM 与精确时长。 */
export function joinSegments(chunks, locale) {
  const parts = [silence(LEAD_IN)];
  for (let i = 0; i < chunks.length; i += 1) {
    parts.push(chunks[i].pcm);
    if (i < chunks.length - 1) {
      parts.push(silence(pauseBetween(chunks[i].kind, chunks[i + 1].kind, locale)));
    }
  }
  parts.push(silence(LEAD_OUT));
  const pcm = concatPcm(parts);
  return { pcm, duration: pcm.length / BYTES_PER_SECOND };
}

export function sidecarPath(mp3Path) {
  return `${mp3Path}.json`;
}

export function writeSidecar(mp3Path, meta) {
  fs.writeFileSync(sidecarPath(mp3Path), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export function readSidecar(mp3Path) {
  return JSON.parse(fs.readFileSync(sidecarPath(mp3Path), 'utf8'));
}

/**
 * 生成一个 mp3 + 旁挂 json。旁挂文件是 Task 8 还原 manifest 的唯一依据：
 * 只包含已真实落盘的文件，不重新读内容库、不重算 hash。
 */
export async function generateJob(
  job,
  { baseUrl = ENGINE_URL, stagingDir = STAGING_DIR, encode = encodeMp3 }
) {
  const chunks = [];
  for (const segment of job.segments) {
    const { pcm } = await synthSegment(baseUrl, {
      text: segment.text,
      voice: job.voice,
      speed: job.speed,
      gap: job.gap,
      locale: job.locale,
    });
    chunks.push({ kind: segment.kind, pcm });
  }

  const { pcm, duration } = joinSegments(chunks, job.locale);
  const file = `audio/${job.locale}/${job.item.slug}.${job.hash}.mp3`;
  const mp3Path = path.join(stagingDir, file);
  const metaPath = sidecarPath(mp3Path);
  fs.mkdirSync(path.dirname(mp3Path), { recursive: true });

  // mp3 与旁挂 json 必须原子提交。两者先写 .part，全部成功后再改名到位；
  // 任何一步失败都清干净，避免 rclone sync 把 0 字节 / 截断的孤儿传上 R2。
  const wavTemp = `${mp3Path}.source.wav`;
  // 保留 .mp3 后缀：ffmpeg 按扩展名推断封装格式，.part 会被拒。
  const mp3Temp = `${mp3Path}.part.mp3`;
  const metaTemp = `${mp3Path}.part.json`;
  let meta;
  let mp3Committed = false;
  try {
    fs.writeFileSync(wavTemp, buildWav(pcm));
    encode(wavTemp, mp3Temp);
    const bytes = fs.existsSync(mp3Temp) ? fs.statSync(mp3Temp).size : 0;
    if (bytes === 0) throw new Error(`生成了 0 字节文件：${file}`);

    meta = {
      date: job.date,
      slug: job.item.slug,
      locale: job.locale,
      hash: job.hash,
      bytes,
      duration: Number(duration.toFixed(3)),
      voice: job.voice,
      speed: job.speed,
    };
    fs.writeFileSync(metaTemp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    fs.rmSync(mp3Path, { force: true });
    fs.rmSync(metaPath, { force: true });
    fs.renameSync(mp3Temp, mp3Path);
    mp3Committed = true;
    fs.renameSync(metaTemp, metaPath);
  } catch (err) {
    if (mp3Committed) fs.rmSync(mp3Path, { force: true });
    throw err;
  } finally {
    for (const temp of [wavTemp, mp3Temp, metaTemp]) {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  return { file, ...meta };
}

/**
 * 本地 staging 里已有同 hash 的成品就复用，不重新请求 TTS。
 * 这是"上传前"的唯一跳过依据——manifest 只由上传成功后的 Task 8 写入，
 * 生成阶段绝不读 manifest 判断自己该不该跳过。
 */
export function alreadyStaged(stagingDir, job) {
  const mp3Path = path.join(
    stagingDir,
    `audio/${job.locale}/${job.item.slug}.${job.hash}.mp3`
  );
  if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) return null;
  const metaPath = sidecarPath(mp3Path);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return meta.hash === job.hash ? meta : null;
  } catch {
    return null;
  }
}

/**
 * --limit 按文章计数，不是按 job 计数：限 1 篇必须产出该篇的三语三个音频，
 * 否则单语种批次会让 manifest 出现半条记录。
 */
export function limitByItem(jobs, limit) {
  if (!Number.isFinite(limit)) return jobs;
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!seen.has(job.item.slug)) {
      if (seen.size >= limit) continue;
      seen.add(job.item.slug);
    }
    out.push(job);
  }
  return out;
}

/** 仅用于 dry-run 的粗估，按 RTF 0.054 折算 GPU 时间。 */
export function estimateMinutes(jobs) {
  let audioSeconds = 0;
  for (const job of jobs) {
    const chars = job.segments.reduce((n, s) => n + s.text.length, 0);
    audioSeconds += chars / CHARS_PER_SECOND[job.locale] + job.segments.length * 0.4 + LEAD_IN + LEAD_OUT;
  }
  return (audioSeconds * RTF) / 60;
}

export function parseArgs(argv) {
  const opts = {
    dryRun: false,
    all: false,
    date: null,
    limit: Infinity,
    engine: ENGINE_URL,
    staging: STAGING_DIR,
    manifestDir: MANIFEST_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--date') opts.date = argv[++i];
    else if (arg === '--limit') opts.limit = Number(argv[++i]);
    else if (arg === '--engine') opts.engine = argv[++i];
    else if (arg === '--staging') opts.staging = path.resolve(argv[++i]);
    else if (arg === '--manifest-dir') opts.manifestDir = path.resolve(argv[++i]);
    else throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const items = loadNews();
  const manifests = loadManifests(opts.manifestDir);
  const todayKey = toDateKey(new Date().toISOString());
  const { jobs, skipped } = planJobs({
    items,
    manifests,
    todayKey,
    today: new Date().toISOString(),
    all: opts.all,
    dateFilter: opts.date,
    stagingDir: opts.staging,
  });
  const selected = limitByItem(jobs, opts.limit);
  const pending = selected.filter((job) => !alreadyStaged(opts.staging, job));
  const reused = selected.length - pending.length;

  console.log(`待生成 ${pending.length} 个音频，跳过 ${skipped + reused} 个（窗口 ${opts.all ? '全部' : `${WINDOW_DAYS} 天`}）`);
  console.log(`预计耗时 约 ${estimateMinutes(pending).toFixed(1)} 分钟（按 RTF ${RTF} 估算）`);
  if (opts.dryRun) return;
  if (pending.length === 0) {
    console.log('没有需要生成的音频。');
    return;
  }

  try {
    await ensureEngine(opts.engine);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const job of pending) {
    try {
      const out = await generateJob(job, { baseUrl: opts.engine, stagingDir: opts.staging });
      ok += 1;
      console.log(`  ok ${out.file} (${out.duration}s, ${out.bytes}B)`);
    } catch (err) {
      failed += 1;
      console.warn(`  warn ${job.item.slug}/${job.locale} 生成失败：${err.message}`);
    }
  }

  console.log(`完成：生成 ${ok}，复用 ${reused}，失败 ${failed}，manifest 跳过 ${skipped}，总量 ${selected.length}`);
  console.log('manifest 未写入：先上传成功，再由 Task 8 的 tts-publish.mjs 依据旁挂 json 落盘。');
  if (ok === 0) {
    console.error('全部生成失败，非零退出；不写 manifest。');
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
