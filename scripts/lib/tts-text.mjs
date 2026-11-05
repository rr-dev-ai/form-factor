import {
  PAUSE_BASE,
  TITLE_PAUSE,
  TRANSITION_PAUSE,
  HEADING_PAUSE_FACTOR,
  LIST_PAUSE_FACTOR,
  TRANSITION_TEXT,
  SENTENCE_END_RE,
} from '../../src/config/audio.ts';

/** 各语种补齐句末标点用的字符。 */
const TERMINAL = { zh: '。', en: '.', es: '.' };

/**
 * 补齐句末标点。Kokoro 不支持 SSML，句末标点是唯一能让单块朗读
 * 自然收尾的手段；段落级停顿不靠它，靠分块 + PCM 拼接。
 */
export function withTerminal(text, locale) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  return SENTENCE_END_RE.test(trimmed) ? trimmed : trimmed + TERMINAL[locale];
}

/**
 * 把一条新闻展开成朗读块。朗读范围 title + body + 过渡语 + whyItMatters，
 * 明确不含 summary——它与正文开头重复。
 *
 * @returns {Array<{ kind: 'title'|'h'|'p'|'ul'|'transition'|'why', text: string }>}
 */
export function assembleSegments(item, locale) {
  const segments = [{ kind: 'title', text: withTerminal(item.title?.[locale], locale) }];

  for (const block of item.body ?? []) {
    if (block.kind === 'ul') {
      for (const entry of block.items ?? []) {
        segments.push({ kind: 'ul', text: withTerminal(entry?.[locale], locale) });
      }
    } else if (block.kind === 'h' || block.kind === 'p') {
      segments.push({ kind: block.kind, text: withTerminal(block.text?.[locale], locale) });
    }
  }

  segments.push({ kind: 'transition', text: TRANSITION_TEXT[locale] });
  segments.push({ kind: 'why', text: withTerminal(item.whyItMatters?.[locale], locale) });

  return segments.filter((s) => s.text.length > 0);
}

/**
 * 相邻两块之间插入的静音秒数。规则表见 spec §7.3，乘法结果保留 3 位小数
 * 以免浮点尾数进入音频长度与 hash 输入。
 */
export function pauseBetween(prevKind, nextKind, locale) {
  const base = PAUSE_BASE[locale];
  if (typeof base !== 'number') throw new RangeError(`未知语种的停顿基准：${locale}`);

  let seconds;
  if (prevKind === 'title') seconds = TITLE_PAUSE;
  else if (prevKind === 'transition') seconds = TRANSITION_PAUSE;
  else if (prevKind === 'h' || nextKind === 'h') seconds = base * HEADING_PAUSE_FACTOR;
  else if (prevKind === 'ul' && nextKind === 'ul') seconds = base * LIST_PAUSE_FACTOR;
  else seconds = base;

  return Number(seconds.toFixed(3));
}
