import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPodcastSlice } from '../src/lib/podcast.ts';
import { createAudioIndex } from '../src/lib/audio.ts';
import { audioBaseUrl } from '../src/config/audio.ts';

const DATE = '2026-11-05';
const loc = (zh, en, es) => ({ zh, en, es });

const entry = (slug, locale, hash) => ({
  file: `audio/${locale}/${slug}.${hash}.mp3`,
  hash,
  bytes: 1000,
  duration: 144.1,
  voice: locale === 'zh' ? 'zf_001' : 'af_heart',
  speed: 1.16,
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-podcast-'));
  fs.writeFileSync(path.join(dir, `${DATE}.json`), JSON.stringify({
    date: DATE,
    generatedAt: `${DATE}T23:40:00+08:00`,
    renderer: 1,
    items: {
      alpha: { zh: entry('alpha', 'zh', 'a1b2c3d4'), en: entry('alpha', 'en', 'b2c3d4e5') },
      beta: { zh: entry('beta', 'zh', 'c3d4e5f6') },
      ghost: { zh: entry('ghost', 'zh', 'd4e5f6a7') },
    },
  }));
  const news = [
    { slug: 'alpha', title: loc('甲标题', 'Alpha title', 'Título alfa'), industry: 'banking' },
    { slug: 'beta', title: loc('乙标题', 'Beta title', 'Título beta'), industry: 'telecom' },
  ];
  return { dir, index: createAudioIndex(dir), news };
}

function slice(locale, extra) {
  return buildPodcastSlice(locale, DATE, extra);
}

test('分片只含有音频且内容库仍存在的条目，length 与 audioByDate 一致', () => {
  const { dir, index, news } = setup();
  try {
    const opts = { index, news };
    const zh = slice('zh', opts);
    assert.equal(zh.length, 2, 'ghost 在内容库里不存在，必须剔除');
    assert.equal(index.audioByDate('zh', DATE).length, 3);
    assert.deepEqual(zh.map((i) => i.slug), ['alpha', 'beta']);
    assert.equal(slice('en', opts).length, 1);
    assert.equal(slice('es', opts).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('url 是绝对地址，路径拼接正确且用配置域名', () => {
  const { dir, index, news } = setup();
  try {
    const [first] = slice('zh', { index, news });
    assert.match(first.url, /^https:\/\/[^/]+\/audio\/zh\/.+\.mp3$/);
    assert.equal(first.url, `${audioBaseUrl}/audio/zh/alpha.a1b2c3d4.mp3`);
    assert.ok(slice('zh', { index, news }).every((i) => i.url.startsWith(audioBaseUrl)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('标题按语种取，行业、时长、音色来自内容库与 manifest', () => {
  const { dir, index, news } = setup();
  try {
    const zh = slice('zh', { index, news })[0];
    assert.equal(zh.title, '甲标题');
    assert.equal(zh.industry, 'banking');
    assert.equal(zh.duration, 144.1);
    assert.equal(zh.voice, 'zf_001');
    const en = slice('en', { index, news })[0];
    assert.equal(en.title, 'Alpha title');
    assert.match(en.url, /\/audio\/en\//);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('空日期返回空数组，不产出幽灵条目', () => {
  const { dir, index, news } = setup();
  try {
    assert.deepEqual(buildPodcastSlice('zh', '2000-01-01', { index, news }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
