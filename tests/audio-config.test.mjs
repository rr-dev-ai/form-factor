import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_VOICES,
  AUDIO_SPEED,
  AUDIO_GAP,
  PAUSE_BASE,
  WINDOW_DAYS,
  RENDER_VERSION,
  audioBaseUrl,
} from '../src/config/audio.ts';

test('音色池规模为 8 / 3 / 2', () => {
  assert.equal(AUDIO_VOICES.zh.length, 8);
  assert.equal(AUDIO_VOICES.en.length, 3);
  assert.equal(AUDIO_VOICES.es.length, 2);
});

test('每个音色都有 speed，且在 1.0-1.4 之间', () => {
  for (const loc of ['zh', 'en', 'es']) {
    for (const v of AUDIO_VOICES[loc]) {
      const s = AUDIO_SPEED[loc][v];
      assert.equal(typeof s, 'number', `${loc}.${v} 缺 speed`);
      assert.ok(s >= 1.0 && s <= 1.4, `${loc}.${v} speed 越界：${s}`);
    }
  }
});

test('窗口 90 天，渲染版本号存在', () => {
  assert.equal(WINDOW_DAYS, 90);
  assert.equal(RENDER_VERSION, 1);
});

test('停顿基准与句间 gap 取值正确', () => {
  assert.deepEqual(PAUSE_BASE, { zh: 0.45, en: 0.3, es: 0.4 });
  assert.deepEqual(AUDIO_GAP, { zh: 0.25, en: 0.18, es: 0.2 });
});

test('音频域名为 https 绝对地址且无尾斜杠', () => {
  assert.match(audioBaseUrl, /^https:\/\/[^/]+$/);
});
