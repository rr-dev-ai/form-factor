import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHash, AUDIO_RULES } from '../scripts/lib/tts-hash.mjs';

const segments = [
  { kind: 'title', text: '香港金管局与银联二维码互通。' },
  { kind: 'p', text: '双方完成受理侧的联调。' },
  { kind: 'transition', text: '为什么重要。' },
  { kind: 'why', text: '改变了跨境收单的令牌化路径。' },
];

const base = { locale: 'zh', voice: 'zf_001', speed: 1.16, gap: 0.25, segments, version: 1 };

test('输出 8 位小写 hex', () => {
  assert.match(renderHash(base), /^[0-9a-f]{8}$/);
});

test('同输入稳定', () => {
  assert.equal(renderHash(base), renderHash({ ...base }));
});

test('音色、语速、句间 gap、渲染版本任一变化都改变 hash', () => {
  for (const patch of [
    { voice: 'zf_003' },
    { speed: 1.2 },
    { gap: 0.3 },
    { version: 2 },
    { locale: 'en' },
  ]) {
    assert.notEqual(renderHash(base), renderHash({ ...base, ...patch }), JSON.stringify(patch));
  }
});

test('正文文本变化改变 hash', () => {
  const changed = [...segments.slice(0, -1), { kind: 'why', text: '改过的文本' }];
  assert.notEqual(renderHash(base), renderHash({ ...base, segments: changed }));
});

test('段落顺序变化改变 hash', () => {
  const reordered = [segments[1], segments[0], segments[2], segments[3]];
  assert.notEqual(renderHash(base), renderHash({ ...base, segments: reordered }));
});

test('段落 kind 变化改变 hash', () => {
  const changed = [{ ...segments[0], kind: 'h' }, ...segments.slice(1)];
  assert.notEqual(renderHash(base), renderHash({ ...base, segments: changed }));
});

test('影响音频字节的常量（停顿 / 留白 / 码率 / 采样格式）变化自动改变 hash', () => {
  const h = renderHash(base);
  for (const patch of [
    { LEAD_IN: 0.9 },
    { LEAD_OUT: 1.2 },
    { TITLE_PAUSE: 1.1 },
    { PAUSE_BASE: { zh: 0.9, en: 0.3, es: 0.4 } },
    { HEADING_PAUSE_FACTOR: 2 },
    { LIST_PAUSE_FACTOR: 0.5 },
    { MP3_BITRATE: '128k' },
    { SAMPLE_RATE: 48000 },
    { CHANNELS: 2 },
    { BITS_PER_SAMPLE: 24 },
  ]) {
    const rules = { ...AUDIO_RULES, ...patch };
    assert.notEqual(h, renderHash({ ...base, rules }), JSON.stringify(patch));
  }
});

test('显式传入默认规则时 hash 不变', () => {
  assert.equal(renderHash(base), renderHash({ ...base, rules: AUDIO_RULES }));
});
