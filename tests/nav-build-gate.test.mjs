import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { navLinks } from '../src/lib/nav.ts';
import { ui } from '../src/lib/i18n.ts';
import { validateAudioManifests, ensureAudioManifestsValid } from '../src/lib/audio.ts';

const manifest = (date, items) => ({
  date,
  generatedAt: `${date}T23:40:00+08:00`,
  renderer: 1,
  items,
});
const audio = (slug, locale) => ({
  file: `audio/${locale}/${slug}.a1b2c3d4.mp3`,
  hash: 'a1b2c3d4',
  bytes: 1000,
  duration: 10,
  voice: 'zf_001',
  speed: 1.16,
});

function withDir(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-gate-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('导航顺序：home → industries → regions → podcasts → archive → status', () => {
  assert.deepEqual(navLinks('zh').map((n) => n.path), ['/', null, null, '/podcasts', '/archive', '/status']);
  assert.deepEqual(navLinks('zh').map((n) => n.key), ['home', 'industries', 'regions', 'podcasts', 'archive', 'status']);
});

test('三语导航文案齐全，英西语无中文残留', () => {
  for (const locale of ['zh', 'en', 'es']) {
    for (const link of navLinks(locale)) {
      assert.ok(link.label.length > 0, `${locale}.${link.key} 为空`);
      if (locale !== 'zh') {
        assert.ok(!/[\u4e00-\u9fff]/u.test(link.label), `${locale}.${link.key} 含中文`);
      }
    }
    assert.equal(navLinks(locale).find((n) => n.key === 'podcasts').label, ui[locale].podcasts);
  }
});

test('build 门禁：manifest 里出现内容库不存在的 slug 必须抛错', () => {
  withDir({ '2026-11-05.json': manifest('2026-11-05', { alpha: { zh: audio('alpha', 'zh') } }) }, (dir) => {
    assert.throws(() => validateAudioManifests(dir, new Set(['beta'])), /manifest 校验失败/);
    assert.doesNotThrow(() => validateAudioManifests(dir, new Set(['alpha'])));
  });
});

test('build 门禁：损坏的 manifest 必须抛错', () => {
  withDir({ 'broken.json': '{ not json' }, (dir) => {
    assert.throws(() => validateAudioManifests(dir, new Set()), /manifest 校验失败/);
  });
});

test('build 门禁：仓库当前的真实 manifest 能通过校验', () => {
  assert.doesNotThrow(() => ensureAudioManifestsValid());
});
