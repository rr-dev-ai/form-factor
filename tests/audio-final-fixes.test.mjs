import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isCurrentView, onTrackStart } from '../src/lib/podcast-queue.ts';
import { publish } from '../scripts/tts-publish.mjs';
import { loadManifests } from '../scripts/lib/tts-manifest.mjs';
import { RENDER_VERSION } from '../src/config/audio.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DATE = '2026-11-05';

/* ---------- I-1: 无 Web Audio 需求的 <audio> 不应引入 CORS 前置条件 ---------- */

test('文章播放器与播客播放条的 <audio> 不带 crossorigin（R2 未配 CORS 时仍可播放）', () => {
  for (const rel of ['src/components/AudioPlayer.astro', 'src/pages/[lang]/podcasts.astro']) {
    const source = read(rel);
    const tags = source.match(/<audio[^>]*>/g) ?? [];
    assert.ok(tags.length > 0, `${rel} 应含 <audio>`);
    for (const tag of tags) {
      assert.ok(!/crossorigin/i.test(tag), `${rel}: ${tag}`);
      assert.match(tag, /preload="none"/);
    }
  }
});

/* ---------- I-2: 乱序 fetch 的 staleness guard 与渲染日期固化 ---------- */

test('isCurrentView 只接受最后一次请求的日期', () => {
  assert.equal(isCurrentView('2026-11-04', '2026-11-04'), true);
  assert.equal(isCurrentView('2026-11-04', '2026-11-05'), false);
  assert.equal(isCurrentView('', ''), true);
});

test('客户端脚本对 setView 做 staleness 检查，且点击回调用渲染日期而非全局 viewDate', () => {
  const source = read('src/scripts/podcast.ts');
  assert.match(source, /isCurrentView\(/);
  assert.match(source, /renderList\(items: Item\[\], dateOfRender: string\)/);
  assert.match(source, /startQueue\(dateOfRender, index, items\)/);
});

/* ---------- I-3: 换条目必然复位播放控制 ---------- */

test('onTrackStart 在曾发生 error 时也复位 disabled 与错误标记', () => {
  assert.deepEqual(onTrackStart(false), { disabled: false, audioError: false });
  assert.deepEqual(onTrackStart(true), { disabled: false, audioError: false });
});

test('playAt 开头应用复位状态', () => {
  const source = read('src/scripts/podcast.ts');
  const at = source.indexOf('function playAt(');
  assert.ok(at > 0);
  const body = source.slice(at, at + 500);
  assert.match(body, /onTrackStart\(/);
  assert.match(body, /barToggle\.disabled = state\.disabled/);
});

/* ---------- I-4: 发布期窗口裁剪必须覆盖 staging 新日期并清理 staging ---------- */

const entry = (slug, locale, date, hash) => ({
  date, slug, locale, hash, bytes: 64, duration: 1.5, voice: 'zf_001', speed: 1.16,
});

function stagingFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-final-'));
  const put = (slug, locale, date, hash) => {
    const folder = path.join(dir, 'audio', locale);
    fs.mkdirSync(folder, { recursive: true });
    const mp3 = path.join(folder, `${slug}.${hash}.mp3`);
    fs.writeFileSync(mp3, Buffer.alloc(64, 1));
    fs.writeFileSync(`${mp3}.json`, JSON.stringify(entry(slug, locale, date, hash)));
    return mp3;
  };
  return { dir, put };
}

test('staging 里 prior 未覆盖的窗外日期：不写 manifest，且 sync 成功后清理本地文件', async () => {
  const staging = stagingFixture();
  const manifests = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-final-m-'));
  const staleMp3 = staging.put('old-audio', 'zh', '2026-01-01', '11111111');
  const freshMp3 = staging.put('new-audio', 'zh', DATE, '22222222');
  try {
    const result = await publish({
      stagingDir: staging.dir,
      manifestDir: manifests,
      todayKey: DATE,
      runSync: () => {},
    });
    assert.equal(result.renderer, RENDER_VERSION);
    const loaded = loadManifests(manifests);
    assert.ok(!loaded.has('2026-01-01'), '窗外日期不得进入日期索引');
    assert.ok(loaded.has(DATE));
    assert.ok(!fs.existsSync(staleMp3), '窗外 mp3 应被清理');
    assert.ok(!fs.existsSync(`${staleMp3}.json`), '窗外旁挂应被清理');
    assert.ok(fs.existsSync(freshMp3), '窗内 mp3 必须保留');
  } finally {
    fs.rmSync(staging.dir, { recursive: true, force: true });
    fs.rmSync(manifests, { recursive: true, force: true });
  }
});

test('sync 失败时不清理 staging、不写 manifest', async () => {
  const staging = stagingFixture();
  const manifests = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-final-m-'));
  const staleMp3 = staging.put('old-audio', 'zh', '2026-01-01', '11111111');
  staging.put('new-audio', 'zh', DATE, '22222222');
  try {
    await assert.rejects(
      () => publish({
        stagingDir: staging.dir,
        manifestDir: manifests,
        todayKey: DATE,
        runSync: () => { throw new Error('rclone down'); },
      }),
      /rclone down/
    );
    assert.deepEqual(fs.readdirSync(manifests), []);
    assert.ok(fs.existsSync(staleMp3), '上传失败不得删本地文件');
  } finally {
    fs.rmSync(staging.dir, { recursive: true, force: true });
    fs.rmSync(manifests, { recursive: true, force: true });
  }
});
