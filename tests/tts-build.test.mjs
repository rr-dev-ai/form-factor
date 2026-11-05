import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import {
  planJobs,
  ensureEngine,
  synthSegment,
  joinSegments,
  generateJob,
  readSidecar,
  limitByItem,
  alreadyStaged,
} from '../scripts/tts-build.mjs';
import { loadManifests, writeManifest } from '../scripts/lib/tts-manifest.mjs';
import { buildWav, silence } from '../scripts/lib/tts-audio.mjs';
import { RENDER_VERSION, LEAD_IN, LEAD_OUT } from '../src/config/audio.ts';

const loc = (zh, en, es) => ({ zh, en, es });

function makeItem(publishedAt, overrides = {}) {
  return {
    slug: 'demo-item',
    status: 'published',
    publishedAt,
    title: loc('示例标题', 'A sample title', 'Un titulo de ejemplo'),
    summary: loc('导语不读 SENTINEL', 'Summary not read SENTINEL', 'Resumen no leido SENTINEL'),
    whyItMatters: loc('因为它重要', 'Because it matters', 'Porque importa'),
    body: [
      { kind: 'h', text: loc('背景', 'Background', 'Contexto') },
      { kind: 'p', text: loc('这是一段正文。', 'This is a paragraph.', 'Este es un parrafo.') },
    ],
    ...overrides,
  };
}

const TODAY = '2026-11-05';
const itemAt = (date) => makeItem(`${date}T09:00:00+08:00`);
const plan = (items, extra = {}) => planJobs({ items, manifests: new Map(), todayKey: TODAY, today: TODAY, ...extra });

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ff-build-'));
}

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('窗口外的条目被排除', () => {
  const { jobs } = plan([itemAt('2026-07-01')]);
  assert.equal(jobs.length, 0);
});

test('--all 忽略窗口，窗口外条目也进入计划', () => {
  const { jobs } = plan([itemAt('2026-07-01')], { all: true });
  assert.equal(jobs.length, 3);
});

test('未发布的条目被排除', () => {
  const { jobs } = plan([makeItem('2026-11-05T09:00:00+08:00', { status: 'archived' })]);
  assert.equal(jobs.length, 0);
});

test('新条目每个语种各产生一个 job', () => {
  const { jobs } = plan([itemAt(TODAY)]);
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((j) => j.locale).sort(), ['en', 'es', 'zh']);
  for (const job of jobs) {
    assert.match(job.hash, /^[0-9a-f]{8}$/);
    assert.ok(job.voice.length > 0);
    assert.equal(typeof job.speed, 'number');
    assert.ok(job.segments.length > 0);
    assert.ok(!job.segments.some((s) => s.text.includes('SENTINEL')));
  }
});

test('hash 相同则跳过，三个语种各记一次', () => {
  const fit = itemAt(TODAY);
  const first = plan([fit]);
  const items = { [fit.slug]: {} };
  for (const job of first.jobs) {
    items[fit.slug][job.locale] = {
      file: `audio/${job.locale}/${fit.slug}.${job.hash}.mp3`,
      hash: job.hash,
      bytes: 1733229,
      duration: 144.1,
      voice: job.voice,
      speed: job.speed,
    };
  }
  const dir = tmpdir();
  try {
    writeManifest(dir, TODAY, items, `${TODAY}T23:40:00+08:00`, RENDER_VERSION);
    const { jobs, skipped } = plan([fit], { manifests: loadManifests(dir) });
    assert.equal(jobs.length, 0);
    assert.equal(skipped, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('title 未变化时 hash 稳定，与生成时间无关', () => {
  const fit = itemAt(TODAY);
  const a = plan([fit]);
  const b = planJobs({ items: [fit], manifests: new Map(), todayKey: '2026-11-06', today: '2026-11-06' });
  assert.equal(a.jobs.length, 3);
  assert.equal(a.jobs[0].hash, b.jobs[0].hash);
});

test('只改中文标题时，仅中文 job 的 hash 改变', () => {
  const fit = itemAt(TODAY);
  const changed = { ...fit, title: { ...fit.title, zh: '完全不同的新标题' } };
  const a = plan([fit]);
  const b = plan([changed]);
  const zh = (p) => p.jobs.find((j) => j.locale === 'zh');
  const en = (p) => p.jobs.find((j) => j.locale === 'en');
  assert.notEqual(zh(a).hash, zh(b).hash);
  assert.equal(en(a).hash, en(b).hash);
});

test('dateFilter 只保留指定日期', () => {
  const { jobs } = plan([itemAt('2026-11-04'), itemAt('2026-11-05')], { dateFilter: '2026-11-04' });
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((j) => j.date === '2026-11-04'));
});

test('引擎不可达时抛出含启动命令的错误', async () => {
  await assert.rejects(() => ensureEngine('http://127.0.0.1:1'), /server\.py/);
});

test('引擎健康时 ensureEngine 正常返回', async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
  }, async (base) => {
    await assert.doesNotReject(() => ensureEngine(base));
  });
});

test('joinSegments 按段落规则插入静音，时长等于字节数换算', () => {
  const chunks = [
    { kind: 'p', pcm: silence(0.1) },
    { kind: 'p', pcm: silence(0.1) },
  ];
  const { pcm, duration } = joinSegments(chunks, 'zh');
  const expected = LEAD_IN + 0.1 + 0.1 + 0.45 + LEAD_OUT;
  assert.equal(duration, Number(expected.toFixed(6)));
  assert.equal(pcm.length, 64800, '0.2 + 0.1 + 0.45 + 0.1 + 0.5 = 1.35s × 48000B/s');
});

test('标题之后的停顿为 0.8s，列表条目之间更短', () => {
  const titled = joinSegments([
    { kind: 'title', pcm: silence(0.1) },
    { kind: 'p', pcm: silence(0.1) },
  ], 'zh');
  const listed = joinSegments([
    { kind: 'ul', pcm: silence(0.1) },
    { kind: 'ul', pcm: silence(0.1) },
  ], 'zh');
  assert.ok(titled.duration > listed.duration);
});

test('synthSegment 发 OpenAI 兼容请求并解析 24kHz WAV', async () => {
  let captured = null;
  await withServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    captured = { url: req.url, method: req.method, payload: JSON.parse(body) };
    const wav = buildWav(silence(0.1));
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
    res.end(wav);
  }, async (base) => {
    const out = await synthSegment(base, { text: '测试。', voice: 'zf_001', speed: 1.16, gap: 0.25, locale: 'zh' });
    assert.equal(out.sampleRate, 24000);
    assert.equal(out.channels, 1);
    assert.equal(out.pcm.length, 4800);
  });
  assert.equal(captured.url, '/v1/audio/speech');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.payload.input, '测试。');
  assert.equal(captured.payload.voice, 'zf_001');
  assert.equal(captured.payload.speed, 1.16);
  assert.equal(captured.payload.gap, 0.25);
  assert.equal(captured.payload.response_format, 'wav');
  assert.equal(captured.payload.lang, 'zh');
});

test('synthSegment 遇非 2xx 立即报错，不写空文件', async () => {
  await withServer((_req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"boom"}');
  }, async (base) => {
    await assert.rejects(
      () => synthSegment(base, { text: 'x', voice: 'zf_001', speed: 1, gap: 0.25, locale: 'zh' }),
      /TTS 合成失败/
    );
  });
});

test('generateJob 生成 mp3 + 旁挂 json，只描述真实存在的文件', async () => {
  await withServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const wav = buildWav(silence(0.1));
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
    res.end(wav);
  }, async (base) => {
    const dir = tmpdir();
    try {
      const fit = itemAt(TODAY);
      const job = plan([fit]).jobs.find((j) => j.locale === 'zh');
      const out = await generateJob(job, { baseUrl: base, stagingDir: dir });
      const mp3 = path.join(dir, out.file);
      assert.ok(fs.existsSync(mp3));
      assert.ok(fs.statSync(mp3).size > 0, 'mp3 不能是 0 字节');
      assert.match(out.file, /^audio\/zh\/demo-item\.[0-9a-f]{8}\.mp3$/);
      const sidecar = readSidecar(mp3);
      assert.equal(sidecar.date, TODAY);
      assert.equal(sidecar.slug, 'demo-item');
      assert.equal(sidecar.locale, 'zh');
      assert.equal(sidecar.hash, job.hash);
      assert.equal(sidecar.voice, job.voice);
      assert.equal(sidecar.speed, job.speed);
      assert.equal(sidecar.bytes, fs.statSync(mp3).size);
      assert.ok(sidecar.duration > 0);
      assert.equal(fs.readdirSync(path.dirname(mp3)).filter((n) => n.endsWith('.wav')).length, 0, '不保留 WAV 中间文件');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('limitByItem 按文章而非按 job 截断，保留该条的三个语种', () => {
  const jobs = plan([
    makeItem('2026-11-04T09:00:00+08:00', { slug: 'other-item' }),
    itemAt('2026-11-05'),
  ]).jobs;
  assert.equal(jobs.length, 6);
  const limited = limitByItem(jobs, 1);
  assert.equal(limited.length, 3);
  assert.deepEqual(limited.map((j) => j.locale).sort(), ['en', 'es', 'zh']);
  assert.ok(limited.every((j) => j.item.slug === jobs[0].item.slug));
  assert.equal(limitByItem(jobs, 0).length, 0);
  assert.equal(limitByItem(jobs, Infinity).length, jobs.length);
});

test('alreadyStaged 命中同 hash 的 mp3 + 旁挂 json 才复用', () => {
  const dir = tmpdir();
  try {
    const job = plan([itemAt(TODAY)]).jobs[0];
    const mp3 = path.join(dir, 'audio', job.locale, `${job.item.slug}.${job.hash}.mp3`);
    fs.mkdirSync(path.dirname(mp3), { recursive: true });
    assert.equal(alreadyStaged(dir, job), null, '文件不存在');

    fs.writeFileSync(mp3, 'fake');
    assert.equal(alreadyStaged(dir, job), null, '缺旁挂 json');

    fs.writeFileSync(`${mp3}.json`, JSON.stringify({ hash: job.hash, bytes: 4 }));
    assert.equal(alreadyStaged(dir, job).hash, job.hash);

    fs.writeFileSync(`${mp3}.json`, JSON.stringify({ hash: 'deadbeef' }));
    assert.equal(alreadyStaged(dir, job), null, 'hash 不同必须重建');

    fs.writeFileSync(mp3, '');
    fs.writeFileSync(`${mp3}.json`, JSON.stringify({ hash: job.hash }));
    assert.equal(alreadyStaged(dir, job), null, '0 字节不得复用');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function dryRun(args = []) {
  const emptyStaging = tmpdir();
  try {
    return execFileSync(
      process.execPath,
      [
        'scripts/tts-build.mjs',
        '--dry-run',
        '--date',
        TODAY,
        '--limit',
        '1',
        '--engine',
        'http://127.0.0.1:1',
        '--staging',
        emptyStaging,
        ...args,
      ],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
  } finally {
    fs.rmSync(emptyStaging, { recursive: true, force: true });
  }
}

test('--limit 1 的 dry-run 输出是 3 个音频（一篇三语）', () => {
  assert.match(dryRun(), /待生成 3 个音频/);
});

test('--dry-run 不探测引擎、不发请求，打印待生成条数与预计耗时', () => {
  const out = dryRun();
  assert.match(out, /待生成/);
  assert.match(out, /预计耗时/);
});
