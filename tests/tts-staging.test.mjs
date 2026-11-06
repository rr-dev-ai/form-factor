import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manifestsFromStaging, syncArgs } from '../scripts/lib/tts-staging.mjs';
import { publish, R2_REMOTE_DEFAULT } from '../scripts/tts-publish.mjs';
import { loadManifests } from '../scripts/lib/tts-manifest.mjs';
import { RENDER_VERSION } from '../src/config/audio.ts';

const DATE = '2026-11-05';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-staging-'));
  const put = (locale, name, bytes, meta) => {
    const folder = path.join(dir, 'audio', locale);
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, name);
    fs.writeFileSync(file, Buffer.alloc(bytes, 1));
    if (meta !== null) fs.writeFileSync(`${file}.json`, JSON.stringify(meta));
  };
  const meta = (slug, locale, hash, bytes) => ({
    date: DATE, slug, locale, hash, bytes,
    duration: 144.1, voice: locale === 'zh' ? 'zf_001' : 'af_heart', speed: 1.16,
  });

  put('zh', 'demo.a1b2c3d4.mp3', 1733229, meta('demo', 'zh', 'a1b2c3d4', 1733229));
  put('en', 'other.b2c3d4e5.mp3', 512, meta('other', 'en', 'b2c3d4e5', 512));
  put('es', 'orphan.deadbeef.mp3', 64, null); // 无旁挂 → warning
  put('zh', 'badname.mp3', 64, meta('badname', 'zh', 'badname', 64)); // 文件名不合规
  put('zh', 'stray.cafebabe.mp3.json', 32, null); // 只有旁挂，没有 mp3

  return dir;
}

test('只返回磁盘上真实存在的音频，按日期与 slug 分组', () => {
  const dir = fixture();
  try {
    const out = manifestsFromStaging(dir);
    assert.equal(out.get(DATE).size, 2, '只有 demo 与 other 两个有效条目');
    assert.ok(!out.get(DATE).has('orphan'));
    assert.ok(!out.get(DATE).has('badname'));
    assert.ok(!out.get(DATE).has('stray'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('缺少旁挂 json 的文件被跳过并记入 warnings', () => {
  const dir = fixture();
  try {
    const { sections, warnings } = manifestsFromStaging(dir, { withWarnings: true });
    assert.equal(sections.get(DATE).size, 2);
    assert.ok(warnings.some((w) => w.includes('missing meta')), warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('解析出的 slug / hash / locale / bytes / file 正确', () => {
  const dir = fixture();
  try {
    const entry = manifestsFromStaging(dir).get(DATE).get('demo');
    assert.equal(entry.zh.hash, 'a1b2c3d4');
    assert.equal(entry.zh.bytes, 1733229);
    assert.equal(entry.zh.voice, 'zf_001');
    assert.equal(entry.zh.duration, 144.1);
    assert.equal(entry.zh.speed, 1.16);
    assert.equal(entry.zh.file, 'audio/zh/demo.a1b2c3d4.mp3');
    assert.equal(entry.zh.locale, 'zh');
    assert.equal(manifestsFromStaging(dir).get(DATE).get('other').en.file, 'audio/en/other.b2c3d4e5.mp3');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('旁挂 json 的 slug / locale / hash 与文件名不符时跳过并 warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-staging-'));
  try {
    const folder = path.join(dir, 'audio', 'zh');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'demo.a1b2c3d4.mp3');
    fs.writeFileSync(file, Buffer.alloc(8, 1));
    fs.writeFileSync(`${file}.json`, JSON.stringify({
      date: DATE, slug: 'wrong', locale: 'zh', hash: 'a1b2c3d4',
      bytes: 8, duration: 1, voice: 'zf_001', speed: 1.16,
    }));
    const { sections, warnings } = manifestsFromStaging(dir, { withWarnings: true });
    assert.equal(sections.size, 0);
    assert.ok(warnings.some((w) => w.includes('mismatch')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('旁挂 bytes 与实际文件大小不符时跳过（截断文件不得进入 manifest）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-staging-'));
  try {
    const folder = path.join(dir, 'audio', 'zh');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'demo.a1b2c3d4.mp3');
    fs.writeFileSync(file, Buffer.alloc(8, 1));
    fs.writeFileSync(`${file}.json`, JSON.stringify({
      date: DATE, slug: 'demo', locale: 'zh', hash: 'a1b2c3d4',
      bytes: 999999, duration: 1, voice: 'zf_001', speed: 1.16,
    }));
    const { sections, warnings } = manifestsFromStaging(dir, { withWarnings: true });
    assert.equal(sections.size, 0);
    assert.ok(warnings.some((w) => w.includes('size mismatch')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('syncArgs 用 sync 子命令（自带删除语义），带缓存头并排除旁挂 json', () => {
  const args = syncArgs('/tmp/staging', 'r2:form-factor-audio');
  assert.deepEqual(args.slice(0, 3), ['sync', '/tmp/staging', 'r2:form-factor-audio']);
  assert.ok(!args.includes('--delete'), 'rclone 1.75 没有 --delete flag，sync 本身就会删');
  assert.ok(args.includes('Content-Type: audio/mpeg'));
  assert.ok(args.includes('Cache-Control: public, max-age=31536000, immutable'));
  assert.ok(args.includes('*.mp3.json'), '旁挂 json 不能被误标成 audio/mpeg');
  assert.ok(args.includes('*.part.*'));
});

test('remote 为空时 publish 直接报错', async () => {
  await assert.rejects(
    () => publish({ remote: '', stagingDir: '/tmp/x', manifestDir: '/tmp/y' }),
    /R2_REMOTE/
  );
});

test('sync 失败时非零退出且不写任何 manifest', async () => {
  const staging = fixture();
  const manifests = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-manifests-'));
  try {
    await assert.rejects(
      () => publish({
        remote: R2_REMOTE_DEFAULT,
        stagingDir: staging,
        manifestDir: manifests,
        runSync: () => { throw new Error('rclone failed'); },
      }),
      /rclone failed/
    );
    assert.deepEqual(fs.readdirSync(manifests), []);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(manifests, { recursive: true, force: true });
  }
});

test('sync 成功后按 staging 实况写 manifest，renderer 与 generatedAt 由发布期生成', async () => {
  const staging = fixture();
  const manifests = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-manifests-'));
  let called = null;
  try {
    const result = await publish({
      remote: R2_REMOTE_DEFAULT,
      stagingDir: staging,
      manifestDir: manifests,
      todayKey: DATE,
      runSync: (args) => { called = args; },
    });
    assert.ok(called, '必须真的调用 sync');
    assert.equal(result.dates.length, 1);
    const loaded = loadManifests(manifests);
    const record = loaded.get(DATE);
    assert.equal(record.renderer, RENDER_VERSION);
    assert.match(record.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(record.items).sort(), ['demo', 'other']);
    assert.equal(record.items.demo.zh.hash, 'a1b2c3d4');
    assert.equal(record.items.other.en.bytes, 512);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(manifests, { recursive: true, force: true });
  }
});

test('窗外日期的旧 manifest 在发布时被删除，local 镜像不留孤儿', async () => {
  const staging = fixture();
  const manifests = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-manifests-'));
  try {
    fs.writeFileSync(path.join(manifests, '2026-01-01.json'), JSON.stringify({
      date: '2026-01-01', generatedAt: '2026-01-01T00:00:00+08:00', renderer: 1, items: {},
    }));
    await publish({
      remote: R2_REMOTE_DEFAULT,
      stagingDir: staging,
      manifestDir: manifests,
      todayKey: DATE,
      runSync: () => {},
    });
    assert.ok(!fs.existsSync(path.join(manifests, '2026-01-01.json')));
    assert.ok(fs.existsSync(path.join(manifests, `${DATE}.json`)));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(manifests, { recursive: true, force: true });
  }
});
