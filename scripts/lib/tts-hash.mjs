import { createHash } from 'node:crypto';
import {
  PAUSE_BASE,
  TITLE_PAUSE,
  TRANSITION_PAUSE,
  HEADING_PAUSE_FACTOR,
  LIST_PAUSE_FACTOR,
  LEAD_IN,
  LEAD_OUT,
  SAMPLE_RATE,
  CHANNELS,
  BITS_PER_SAMPLE,
  MP3_BITRATE,
} from '../../src/config/audio.ts';

/**
 * spec §5.1 把「暂停规则」列为 hash 的直接输入。这里把所有影响输出字节、
 * 却又不会体现在 segments.text 里的常量集中成一份规则快照，参与 hash。
 *
 * 只靠人工递增 RENDER_VERSION 是不够的：R2 是 immutable 永久缓存，
 * 改了停顿却没改文件名，全站会永远听到旧音频，而且测试全绿。
 * 规则指纹让这类改动自动改变文件名；RENDER_VERSION 仍保留，用于覆盖
 * 「拼接逻辑 / 编码器行为」这类无法用常量表达的改动。
 */
export const AUDIO_RULES = Object.freeze({
  PAUSE_BASE,
  TITLE_PAUSE,
  TRANSITION_PAUSE,
  HEADING_PAUSE_FACTOR,
  LIST_PAUSE_FACTOR,
  LEAD_IN,
  LEAD_OUT,
  SAMPLE_RATE,
  CHANNELS,
  BITS_PER_SAMPLE,
  MP3_BITRATE,
});

const DEFAULT_RULES_DIGEST = createHash('sha256')
  .update(JSON.stringify(AUDIO_RULES), 'utf8')
  .digest('hex')
  .slice(0, 16);

/**
 * 音频文件名里的 8 位内容指纹。
 *
 * 输入覆盖所有影响输出字节的因素：渲染版本、规则指纹、语种、音色、语速、
 * 句间 gap、逐段的 kind 与 text。内容不变 → 文件名不变 → CDN 永久缓存；
 * 改稿、换音色或改停顿规则 → 文件名变，无需 purge。
 */
export function renderHash({ locale, voice, speed, gap, segments, version, rules = AUDIO_RULES }) {
  const digest = rules === AUDIO_RULES
    ? DEFAULT_RULES_DIGEST
    : createHash('sha256').update(JSON.stringify(rules), 'utf8').digest('hex').slice(0, 16);
  const header = [version, digest, locale, voice, speed, gap].join('|');
  const body = segments.map((s) => `${s.kind}\n${s.text}`).join('\n');
  return createHash('sha256').update(`${header}\n${body}`, 'utf8').digest('hex').slice(0, 8);
}
