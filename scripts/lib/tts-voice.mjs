import { createHash } from 'node:crypto';
import { AUDIO_VOICES } from '../../src/config/audio.ts';

/** 起点由 slug + locale 决定，与条目在数组里的位置无关。 */
function startIndex(slug, locale, poolLength) {
  return createHash('sha256').update(`${slug}${locale}`, 'utf8').digest()[0] % poolLength;
}

function stateFor(states, date, locale) {
  const key = `${date}|${locale}`;
  if (!states.has(key)) states.set(key, { used: new Set(), counts: new Map() });
  return states.get(key);
}

function leastUsed(pool, state) {
  let best = pool[0];
  let bestCount = Infinity;
  for (const voice of pool) {
    const count = state.counts.get(voice) ?? 0;
    if (count < bestCount) {
      best = voice;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 为一篇文章 × 一个语种分配音色。
 *
 * - 已写入 manifest 的分配一律沿用（冻结），且计入当天占用；
 * - 否则从 sha256(slug + locale) 的确定性起点向后扫描，取当天尚未用过的第一个音色；
 * - 当天全部用过，取当前出现次数最少者（并列取池子里索引最小的）。
 *
 * 按 date 分组，跨日互不影响。已冻结项先落位再分配新项，保证新条目加入
 * 不会让已发布条目的音色重排。
 *
 * @param {Array<{ key: string, slug: string, locale: string, date: string }>} entries
 * @param {Map<string, string>} existing key → voice
 * @param {Record<string, string[]>} pools
 * @returns {Map<string, string>} key → voice（完整映射）
 */
export function assignVoices(entries, existing = new Map(), pools = AUDIO_VOICES) {
  const out = new Map(existing);
  const states = new Map();
  const pending = [];

  for (const entry of entries) {
    const pool = pools[entry.locale];
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error(`音色池为空：${entry.locale}（${entry.key}）`);
    }
    const state = stateFor(states, entry.date, entry.locale);

    if (existing.has(entry.key)) {
      const voice = existing.get(entry.key);
      state.used.add(voice);
      state.counts.set(voice, (state.counts.get(voice) ?? 0) + 1);
    } else {
      pending.push({ entry, pool, state });
    }
  }

  for (const { entry, pool, state } of pending) {
    const start = startIndex(entry.slug, entry.locale, pool.length);
    let voice = null;

    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[(start + i) % pool.length];
      if (!state.used.has(candidate)) {
        voice = candidate;
        break;
      }
    }
    if (voice === null) voice = leastUsed(pool, state);

    out.set(entry.key, voice);
    state.used.add(voice);
    state.counts.set(voice, (state.counts.get(voice) ?? 0) + 1);
  }

  return out;
}
