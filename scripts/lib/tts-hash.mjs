import { createHash } from 'node:crypto';

/**
 * 音频文件名里的 8 位内容指纹。
 *
 * 输入必须覆盖所有影响输出字节的因素：渲染版本、语种、音色、语速、
 * 句间 gap、以及逐段的 kind 与 text。停顿规则不单独入参——它由
 * RENDER_VERSION 表达，改规则必须递增版本，旧文件才会重建。
 *
 * 内容不变 → 文件名不变 → CDN 永久缓存；改稿或换音色 → 文件名变，
 * 无需 purge。
 */
export function renderHash({ locale, voice, speed, gap, segments, version }) {
  const header = [version, locale, voice, speed, gap].join('|');
  const body = segments.map((s) => `${s.kind}\n${s.text}`).join('\n');
  return createHash('sha256').update(`${header}\n${body}`, 'utf8').digest('hex').slice(0, 8);
}
