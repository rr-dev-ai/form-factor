import fs from 'node:fs';
import path from 'node:path';
import { LOCALES } from '../../src/config/audio.ts';

/** audio/{locale}/{slug}.{hash8}.mp3 */
const NAME_RE = /^(.+)\.([0-9a-f]{8})\.mp3$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 从 staging 的**真实文件**还原按日 manifest 内容。
 *
 * 只依据刚被 rclone sync 成功的本地镜像，不重新读内容库、不重算 hash：
 * manifest 描述的就是已上传的东西。日期、音色、时长一律从旁挂 json 读，
 * 不从路径猜。一个坏文件只跳过并 warning，不阻断整批发布。
 *
 * @returns 默认 Map<date, Map<slug, { zh?, en?, es? }>>；
 *          传 { withWarnings: true } 时返回 { sections, warnings }
 */
export function manifestsFromStaging(stagingDir, { withWarnings = false } = {}) {
  const sections = new Map();
  const warnings = [];

  for (const locale of LOCALES) {
    const dir = path.join(stagingDir, 'audio', locale);
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.mp3')) continue;
      const match = NAME_RE.exec(name);
      if (!match) {
        warnings.push(`skip audio/${locale}/${name}: bad filename`);
        continue;
      }
      const [, slug, hash] = match;
      const file = `audio/${locale}/${slug}.${hash}.mp3`;
      const mp3Path = path.join(dir, name);
      const metaPath = `${mp3Path}.json`;

      if (!fs.existsSync(metaPath)) {
        warnings.push(`skip ${file}: missing meta`);
        continue;
      }

      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        warnings.push(`skip ${file}: bad meta json`);
        continue;
      }
      if (meta.slug !== slug || meta.locale !== locale || meta.hash !== hash) {
        warnings.push(`skip ${file}: meta mismatch`);
        continue;
      }
      if (typeof meta.date !== 'string' || !DATE_RE.test(meta.date)) {
        warnings.push(`skip ${file}: bad date`);
        continue;
      }

      const bytes = fs.statSync(mp3Path).size;
      if (bytes === 0 || meta.bytes !== bytes) {
        warnings.push(`skip ${file}: size mismatch (meta ${meta.bytes}, actual ${bytes})`);
        continue;
      }
      if (
        !(meta.duration > 0) ||
        typeof meta.voice !== 'string' || meta.voice.length === 0 ||
        !(meta.speed > 0)
      ) {
        warnings.push(`skip ${file}: incomplete meta`);
        continue;
      }

      const bySlug = sections.get(meta.date) ?? new Map();
      const item = bySlug.get(slug) ?? {};
      item[locale] = {
        file,
        hash,
        bytes,
        duration: meta.duration,
        voice: meta.voice,
        speed: meta.speed,
        locale,
      };
      bySlug.set(slug, item);
      sections.set(meta.date, bySlug);
    }
  }

  return withWarnings ? { sections, warnings } : sections;
}

/**
 * rclone sync 参数。缓存头必须显式设置——r2.dev 实测不带 Cache-Control。
 *
 * 旁挂 json 与 .part 临时文件必须排除：--header-upload 会把它们也标成
 * audio/mpeg，且它们不属于对外产物。
 */
export function syncArgs(stagingDir, remote) {
  return [
    // rclone sync 自带"让远端与本地一致"的删除语义，v1.75 没有 --delete flag，
    // 传了会直接 Fatal error: unknown flag。
    'sync',
    stagingDir,
    remote,
    '--header-upload', 'Content-Type: audio/mpeg',
    '--header-upload', 'Cache-Control: public, max-age=31536000, immutable',
    '--exclude', '*.mp3.json',
    '--exclude', '*.part.*',
    '--exclude', '*.source.wav',
  ];
}
