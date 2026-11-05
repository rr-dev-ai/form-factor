import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseWav,
  buildWav,
  silence,
  concatPcm,
  encodeMp3,
} from '../scripts/lib/tts-audio.mjs';

test('silence 0.5s 在 24kHz/16bit/单声道下是 24000 字节且全为 0', () => {
  assert.equal(silence(0.5).length, 24000);
  assert.ok(silence(0.5).every((b) => b === 0));
});

test('silence 长度按采样点对齐，不产生半个字节', () => {
  assert.equal(silence(0).length, 0);
  assert.equal(silence(0.001).length, 48);
  assert.equal(silence(0.2).length, 9600);
});

test('buildWav 产出 44 字节头且长度字段正确', () => {
  const pcm = silence(0.1);
  const wav = buildWav(pcm);
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.toString('latin1', 8, 12), 'WAVE');
  assert.equal(wav.toString('latin1', 12, 16), 'fmt ');
  assert.equal(wav.toString('latin1', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), pcm.length);
});

test('buildWav 的采样率与声道数写入 fmt chunk', () => {
  const wav = buildWav(silence(0.01), { sampleRate: 48000, channels: 2, bitsPerSample: 16 });
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
});

test('parseWav 与 buildWav 互逆', () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
  const back = parseWav(buildWav(pcm));
  assert.deepEqual(back.pcm, pcm);
  assert.equal(back.sampleRate, 24000);
  assert.equal(back.channels, 1);
});

test('parseWav 跳过 fmt 之外的 chunk 并正确处理奇数长度补齐', () => {
  const wav = buildWav(Buffer.from([9, 0, 8, 0]));
  const junk = Buffer.alloc(8 + 3 + 1);
  junk.write('JUNK', 0, 'latin1');
  junk.writeUInt32LE(3, 4);
  junk.write('abc', 8, 'latin1');
  const withJunk = Buffer.concat([wav.subarray(0, 36), junk, wav.subarray(36)]);
  withJunk.writeUInt32LE(withJunk.length - 8, 4);
  const back = parseWav(withJunk);
  assert.deepEqual(back.pcm, Buffer.from([9, 0, 8, 0]));
});

test('parseWav 拒绝非 RIFF/WAVE 数据', () => {
  assert.throws(() => parseWav(Buffer.from('not a wav')), /RIFF/);
});

test('concatPcm 按顺序拼接', () => {
  const out = concatPcm([Buffer.from([1, 2]), Buffer.from([3]), Buffer.from([4, 5])]);
  assert.deepEqual([...out], [1, 2, 3, 4, 5]);
});

test('concatPcm 空输入返回空 Buffer', () => {
  assert.equal(concatPcm([]).length, 0);
});

test('encodeMp3 生成非 0 字节 mp3，参数为 96k/24k/单声道', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-mp3-'));
  try {
    const wavPath = path.join(dir, 'in.wav');
    const mp3Path = path.join(dir, 'out.mp3');
    // 240 Hz 正弦，0.5 s，避免纯静音被编码器优化成异常小的文件
    const pcm = Buffer.alloc(24000);
    for (let i = 0; i < 12000; i += 1) {
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 240 * i) / 24000) * 12000), i * 2);
    }
    fs.writeFileSync(wavPath, buildWav(pcm));
    encodeMp3(wavPath, mp3Path);
    assert.ok(fs.existsSync(mp3Path));
    assert.ok(fs.statSync(mp3Path).size > 500, 'mp3 不应该是 0 字节或空壳');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('encodeMp3 失败时抛出含 ffmpeg stderr 的错误', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-mp3-'));
  try {
    assert.throws(
      () => encodeMp3(path.join(dir, 'missing.wav'), path.join(dir, 'out.mp3')),
      /ffmpeg|No such file|Invalid data|Error/i
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
