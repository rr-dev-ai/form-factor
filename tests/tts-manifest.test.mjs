import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  manifestPath,
  loadManifests,
  windowDates,
  pruneDates,
  writeManifest,
} from '../scripts/lib/tts-manifest.mjs';
import {
  createAudioIndex,
  validateManifestSlugs,
  audioFor,
} from '../src/lib/audio.ts';

const entry = (slug, locale, hash = 'a1b2c3d4') => ({
  file: `audio/${locale}/${slug}.${hash}.mp3`,
  hash,
  bytes: 1733229,
  duration: 144.1,
  voice: locale === 'zh' ? 'zf_001' : locale === 'en' ? 'af_heart' : 'ef_dora',
  speed: 1.16,
});

const manifest = (date, items) => ({
  date,
  generatedAt: `${date}T23:40:00+08:00`,
  renderer: 1,
  items,
});

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ff-audio-'));
}

function writeRaw(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
}

test('windowDates 含当天与 today-89，共 90 天且升序', () => {
  const d = windowDates('2026-11-05', 90);
  assert.equal(d.length, 90);
  assert.equal(d.at(0), '2026-08-08');
  assert.equal(d.at(-1), '2026-11-05');
  assert.deepEqual(d, [...d].sort());
});

test('窗口边界：today-89 在内，today-90 在外', () => {
  const d = windowDates('2026-11-05', 90);
  assert.ok(d.includes('2026-08-08'), 'today-89 应有音频');
  assert.ok(!d.includes('2026-08-07'), 'today-90 应无音频');
});

test('pruneDates 列出窗外日期', () => {
  assert.deepEqual(
    pruneDates(['2026-08-07', '2026-08-08', '2026-11-05'], '2026-11-05', 90),
    ['2026-08-07']
  );
  assert.deepEqual(pruneDates(['2026-08-08', '2026-11-05'], '2026-11-05', 90), []);
});

test('manifestPath 按天拆分为 YYYY-MM-DD.json', () => {
  assert.equal(manifestPath('/repo/content/_meta/audio', '2026-11-05'), path.join('/repo/content/_meta/audio', '2026-11-05.json'));
});

test('loadManifests 读取按天拆分的全部文件，按日期建索引', () => {
  const dir = tmpdir();
  try {
    writeRaw(dir, '2026-11-04.json', manifest('2026-11-04', { alpha: { zh: entry('alpha', 'zh') } }));
    writeRaw(dir, '2026-11-05.json', manifest('2026-11-05', {
      beta: { zh: entry('beta', 'zh'), en: entry('beta', 'en') },
    }));
    writeRaw(dir, 'README.md', 'not a manifest');

    const out = loadManifests(dir);
    assert.equal(out.size, 2);
    assert.deepEqual(Object.keys(out.get('2026-11-05').items), ['beta']);
    assert.deepEqual(Object.keys(out.get('2026-11-05').items.beta), ['zh', 'en']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadManifests 目录不存在时返回空索引', () => {
  assert.equal(loadManifests(path.join(os.tmpdir(), 'ff-audio-does-not-exist')).size, 0);
});

test('loadManifests 遇到损坏文件抛错并指名文件', () => {
  const dir = tmpdir();
  try {
    writeRaw(dir, '2026-11-05.json', manifest('2026-11-05', { alpha: { zh: { file: 'oops' } } }));
    assert.throws(() => loadManifests(dir), (err) => /manifest 校验失败/.test(err.message) && /2026-11-05\.json/.test(err.message));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadManifests 遇到非 JSON 文本同样抛错', () => {
  const dir = tmpdir();
  try {
    writeRaw(dir, 'broken.json', '{ not json');
    assert.throws(() => loadManifests(dir), /manifest 校验失败/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeManifest 写入后可被 loadManifests 读回', () => {
  const dir = tmpdir();
  try {
    const items = { alpha: { zh: entry('alpha', 'zh') } };
    writeManifest(dir, '2026-11-05', items, '2026-11-05T23:40:00+08:00', 1);
    assert.ok(fs.existsSync(manifestPath(dir, '2026-11-05')));
    const out = loadManifests(dir);
    assert.deepEqual(out.get('2026-11-05'), manifest('2026-11-05', items));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('窗外日期文件由 pruneDates 精确定位', () => {
  const dir = tmpdir();
  try {
    writeManifest(dir, '2026-08-07', {}, '2026-08-07T23:40:00+08:00', 1);
    writeManifest(dir, '2026-11-05', {}, '2026-11-05T23:40:00+08:00', 1);
    const dates = loadManifests(dir).keys();
    assert.deepEqual(pruneDates([...dates], '2026-11-05', 90), ['2026-08-07']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureIndex() {
  const dir = tmpdir();
  writeRaw(dir, '2026-11-04.json', manifest('2026-11-04', {
    old: { zh: entry('old', 'zh'), en: entry('old', 'en'), es: entry('old', 'es') },
  }));
  writeRaw(dir, '2026-11-05.json', manifest('2026-11-05', {
    alpha: { zh: entry('alpha', 'zh'), en: entry('alpha', 'en'), es: entry('alpha', 'es') },
    beta: { zh: entry('beta', 'zh'), es: entry('beta', 'es') },
    gamma: { en: entry('gamma', 'en') },
  }));
  return { dir, index: createAudioIndex(dir) };
}

test('audioFor 命中返回含 slug / locale / date 的元数据，未命中返回 null', () => {
  const { dir, index } = fixtureIndex();
  try {
    const meta = index.audioFor('alpha', 'zh');
    assert.equal(meta.slug, 'alpha');
    assert.equal(meta.locale, 'zh');
    assert.equal(meta.date, '2026-11-05');
    assert.equal(meta.hash, 'a1b2c3d4');
    assert.equal(meta.duration, 144.1);
    assert.equal(index.audioFor('beta', 'en'), null, 'beta 没有英文音频');
    assert.equal(index.audioFor('nope', 'zh'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('audioDates 倒序，count 与 audioByDate 长度一致', () => {
  const { dir, index } = fixtureIndex();
  try {
    const dates = index.audioDates('zh');
    assert.deepEqual(dates.map((d) => d.date), ['2026-11-05', '2026-11-04']);
    for (const { date, count } of dates) {
      assert.equal(count, index.audioByDate('zh', date).length);
    }
    assert.equal(index.audioDates('en')[0].count, 2, '11-05 只有 alpha / gamma 有英文');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('audioByDate 只返回该语种有音频的条目，空日期返回空数组', () => {
  const { dir, index } = fixtureIndex();
  try {
    assert.deepEqual(index.audioByDate('en', '2026-11-05').map((m) => m.slug), ['alpha', 'gamma']);
    assert.deepEqual(index.audioByDate('zh', '2000-01-01'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('默认索引在无 manifest 的仓库里安全返回空', () => {
  assert.equal(audioFor('definitely-not-there', 'zh'), null);
});

test('validateManifestSlugs 拦住内容库里不存在的 slug', () => {
  const { dir } = fixtureIndex();
  try {
    const index = loadManifests(dir);
    assert.throws(
      () => validateManifestSlugs(index, new Set(['alpha', 'beta'])),
      /manifest 校验失败[\s\S]*gamma|old/
    );
    assert.doesNotThrow(() => validateManifestSlugs(index, new Set(['old', 'alpha', 'beta', 'gamma'])));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
