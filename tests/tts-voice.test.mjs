import test from 'node:test';
import assert from 'node:assert/strict';
import { assignVoices } from '../scripts/lib/tts-voice.mjs';
import { AUDIO_VOICES } from '../src/config/audio.ts';

const mk = (slug, date, locale = 'zh') => ({ key: `${date}|${slug}|${locale}`, slug, locale, date });
const names = (s) => s.split('').map((c) => mk(c, '2026-11-05'));
const countsOf = (out) => {
  const counts = new Map();
  for (const v of out.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
};

test('已存在的分配被沿用', () => {
  const existing = new Map([['2026-11-05|a|zh', 'zm_009']]);
  const out = assignVoices([mk('a', '2026-11-05')], existing, { zh: ['zf_001', 'zm_009'] });
  assert.equal(out.get('2026-11-05|a|zh'), 'zm_009');
});

test('已存在的分配计入当天占用，新条目不会撞上去', () => {
  const existing = new Map([['2026-11-05|a|zh', 'v0']]);
  const out = assignVoices([mk('a', '2026-11-05'), mk('b', '2026-11-05')], existing, {
    zh: ['v0', 'v1'],
  });
  assert.equal(out.get('2026-11-05|a|zh'), 'v0');
  assert.equal(out.get('2026-11-05|b|zh'), 'v1');
});

test('同一天 5 条在 8 个音色中互不相同', () => {
  const out = assignVoices(names('abcde'), new Map(), { zh: AUDIO_VOICES.zh });
  assert.equal(new Set(out.values()).size, 5);
});

test('同一天 10 条超出 8 个池时，多出的取重复次数最少者', () => {
  const out = assignVoices(names('abcdefghij'), new Map(), { zh: AUDIO_VOICES.zh });
  const counts = countsOf(out);
  assert.equal(out.size, 10);
  assert.equal(Math.max(...counts.values()), 2, '最多重复 2 次');
  assert.ok([...counts.values()].every((c) => c <= 2));
});

test('同一输入两次运行结果一致', () => {
  const entries = names('abcde');
  const a = assignVoices(entries, new Map(), { zh: AUDIO_VOICES.zh });
  const b = assignVoices(entries, new Map(), { zh: AUDIO_VOICES.zh });
  assert.deepEqual([...a], [...b]);
});

test('新增条目不打乱已发布条目的分配', () => {
  const first = assignVoices(names('ab'), new Map(), { zh: AUDIO_VOICES.zh });
  const second = assignVoices(names('abc'), first, { zh: AUDIO_VOICES.zh });
  assert.equal(second.get('2026-11-05|a|zh'), first.get('2026-11-05|a|zh'));
  assert.equal(second.get('2026-11-05|b|zh'), first.get('2026-11-05|b|zh'));
});

test('不同日期互不影响，各自从池头开始用满', () => {
  const entries = [
    ...'abc'.split('').map((s) => mk(s, '2026-11-05')),
    ...'abc'.split('').map((s) => mk(s, '2026-11-04')),
  ];
  const out = assignVoices(entries, new Map(), { zh: AUDIO_VOICES.zh });
  assert.equal(out.size, 6);
  for (const date of ['2026-11-05', '2026-11-04']) {
    const inDate = [...out].filter(([k]) => k.startsWith(date)).map(([, v]) => v);
    assert.equal(new Set(inDate).size, 3, `${date} 内应互不相同`);
  }
});

test('不同语种各用自己的池子，不串味', () => {
  const entries = [
    ...'abc'.split('').map((s) => mk(s, '2026-11-05', 'en')),
    ...'ab'.split('').map((s) => mk(s, '2026-11-05', 'es')),
  ];
  const out = assignVoices(entries, new Map(), AUDIO_VOICES);
  for (const [key, voice] of out) {
    assert.ok(AUDIO_VOICES[key.endsWith('en') ? 'en' : 'es'].includes(voice), key);
  }
});

test('条目数远超池子时分布均衡（最大与最小差不超过 1）', () => {
  const entries = Array.from({ length: 20 }, (_, i) => mk(`slug-${i}`, '2026-11-05'));
  const out = assignVoices(entries, new Map(), { zh: ['v0', 'v1', 'v2'] });
  const counts = [...countsOf(out).values()];
  assert.equal(counts.length, 3);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join(','));
});

test('池子为空时明确报错，而不是静默产出 undefined', () => {
  assert.throws(() => assignVoices([mk('a', '2026-11-05')], new Map(), { zh: [] }), /音色池为空/);
});
