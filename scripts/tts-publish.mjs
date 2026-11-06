import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RENDER_VERSION, WINDOW_DAYS } from '../src/config/audio.ts';
import { toDateKey } from '../src/lib/content.ts';
import { manifestsFromStaging, syncArgs } from './lib/tts-staging.mjs';
import { writeManifest, pruneDates } from './lib/tts-manifest.mjs';

export const R2_REMOTE_DEFAULT = 'r2:form-factor-audio';

const STAGING_DIR = path.join(process.cwd(), 'audio-staging');
const MANIFEST_DIR = path.join(process.cwd(), 'content', '_meta', 'audio');
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

function existingManifestDates(manifestDir) {
  if (!fs.existsSync(manifestDir)) return [];
  return fs.readdirSync(manifestDir)
    .map((name) => DATE_FILE_RE.exec(name)?.[1])
    .filter(Boolean);
}

/**
 * 上传 → 写 manifest。顺序不可颠倒：sync 失败一律不落盘，
 * 否则页面会渲染出播放器但点了 404。
 *
 * @param runSync 可注入，测试用它避免真的调用 rclone
 */
export async function publish({
  remote = R2_REMOTE_DEFAULT,
  stagingDir = STAGING_DIR,
  manifestDir = MANIFEST_DIR,
  todayKey = toDateKey(new Date().toISOString()),
  rcloneBin = process.env.RCLONE_BIN || 'rclone',
  runSync,
} = {}) {
  if (typeof remote !== 'string' || remote.trim().length === 0) {
    throw new Error('R2_REMOTE 不能为空。用法：R2_REMOTE=r2:form-factor-audio node scripts/tts-publish.mjs');
  }

  const { sections, warnings } = manifestsFromStaging(stagingDir, { withWarnings: true });
  for (const warning of warnings) console.warn(`  warn ${warning}`);

  const args = syncArgs(stagingDir, remote);
  const sync = runSync ?? ((syncArguments) => execFileSync(rcloneBin, syncArguments, { stdio: 'inherit' }));
  // 抛错即中止：下面所有写盘都发生在 sync 成功之后。
  await sync(args);

  const generatedAt = new Date().toISOString();
  const prior = existingManifestDates(manifestDir);
  const stale = new Set(pruneDates(prior, todayKey, WINDOW_DAYS));
  const dates = new Set([...prior, ...sections.keys()]);
  const written = [];
  const removed = [];

  for (const date of [...dates].sort()) {
    const target = path.join(manifestDir, `${date}.json`);
    const bySlug = sections.get(date) ?? new Map();
    if (stale.has(date) || bySlug.size === 0) {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removed.push(date);
      }
      continue;
    }
    const items = {};
    for (const [slug, locales] of bySlug) items[slug] = locales;
    writeManifest(manifestDir, date, items, generatedAt, RENDER_VERSION);
    written.push(date);
  }

  return { dates: written, removed, warnings, remote, args };
}

export function parseArgs(argv) {
  const opts = {
    remote: process.env.R2_REMOTE || R2_REMOTE_DEFAULT,
    stagingDir: STAGING_DIR,
    manifestDir: MANIFEST_DIR,
    rcloneBin: process.env.RCLONE_BIN || 'rclone',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--remote') opts.remote = argv[++i];
    else if (arg === '--staging') opts.stagingDir = path.resolve(argv[++i]);
    else if (arg === '--manifest-dir') opts.manifestDir = path.resolve(argv[++i]);
    else if (arg === '--rclone-bin') opts.rcloneBin = argv[++i];
    else throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const { sections, warnings } = manifestsFromStaging(opts.stagingDir, { withWarnings: true });
  const files = [...sections.values()].reduce((n, m) => n + [...m.values()].reduce((k, item) => k + Object.keys(item).length, 0), 0);
  console.log(`本地镜像：${sections.size} 天 / ${files} 个音频，警告 ${warnings.length} 条`);
  console.log(`目标：${opts.remote}`);

  if (opts.dryRun) {
    console.log(`仅预演，命令：${opts.rcloneBin} ${syncArgs(opts.stagingDir, opts.remote).join(' ')}`);
    return;
  }

  try {
    const result = await publish(opts);
    console.log(`发布完成：写入 manifest ${result.dates.length} 天（${result.dates.join(', ') || '无'}），清理 ${result.removed.length} 天`);
  } catch (err) {
    console.error(`发布失败，manifest 未改动：${err.message}`);
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
