import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playerProps, audioSrc } from '../src/lib/audio-player.ts';
import { createAudioIndex } from '../src/lib/audio.ts';
import { audioBaseUrl } from '../src/config/audio.ts';
import { ui } from '../src/lib/i18n.ts';

const entry = (slug, locale, hash = 'a1b2c3d4') => ({
  file: `audio/${locale}/${slug}.${hash}.mp3`,
  hash,
  bytes: 1733229,
  duration: 144.1,
  voice: locale === 'zh' ? 'zf_001' : 'af_heart',
  speed: 1.16,
});

function fixtureIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-player-'));
  fs.writeFileSync(path.join(dir, '2026-11-05.json'), JSON.stringify({
    date: '2026-11-05',
    generatedAt: '2026-11-05T23:40:00+08:00',
    renderer: 1,
    items: {
      alpha: { zh: entry('alpha', 'zh'), en: entry('alpha', 'en', 'b2c3d4e5') },
      beta: { es: entry('beta', 'es', 'c3d4e5f6') },
    },
  }));
  return { dir, index: createAudioIndex(dir) };
}

test('命中 manifest 时返回播放器所需的全部属性', () => {
  const { dir, index } = fixtureIndex();
  try {
    const props = playerProps('alpha', 'zh', index);
    assert.equal(props.src, `${audioBaseUrl}/audio/zh/alpha.a1b2c3d4.mp3`);
    assert.equal(props.voice, 'zf_001');
    assert.equal(props.duration, 144.1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('未命中 slug 或该语种无音频时返回 null（页面什么都不渲染）', () => {
  const { dir, index } = fixtureIndex();
  try {
    assert.equal(playerProps('nope', 'zh', index), null);
    assert.equal(playerProps('alpha', 'es', index), null);
    assert.equal(playerProps('beta', 'zh', index), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('audioSrc 用配置里的域名，不硬编码，且无重复斜杠', () => {
  assert.match(audioSrc(entry('alpha', 'zh')), /^https:\/\/[^/]+\/audio\/zh\/alpha\.a1b2c3d4\.mp3$/);
  assert.ok(audioSrc(entry('alpha', 'zh')).startsWith(`${audioBaseUrl}/`));
});

test('正式域名拼出的 URL 与线上已发布的对象路径一致', () => {
  const meta = entry('liberia-migrant-biometric-registration-16-sites', 'en', '6206c1af');
  assert.equal(
    audioSrc(meta),
    'https://audio.formfactor.top/audio/en/liberia-migrant-biometric-registration-16-sites.6206c1af.mp3'
  );
});

test('默认索引在没有该条音频时返回 null', () => {
  assert.equal(playerProps('definitely-no-audio', 'zh'), null);
});

test('播放器三语文案齐全，英西语无中文残留', () => {
  for (const locale of ['zh', 'en', 'es']) {
    for (const key of ['play', 'pause', 'stop', 'seek']) {
      assert.equal(typeof ui[locale][key], 'string', `${locale}.${key} 缺失`);
      assert.ok(ui[locale][key].length > 0, `${locale}.${key} 为空`);
    }
  }
  for (const locale of ['en', 'es']) {
    for (const key of ['play', 'pause', 'stop', 'seek']) {
      assert.ok(!/[\u4e00-\u9fff]/u.test(ui[locale][key]), `${locale}.${key} 含中文`);
    }
  }
});
