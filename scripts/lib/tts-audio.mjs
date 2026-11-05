import { execFileSync } from 'node:child_process';
import {
  SAMPLE_RATE,
  CHANNELS,
  BITS_PER_SAMPLE,
  MP3_BITRATE,
} from '../../src/config/audio.ts';

const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/**
 * Kokoro 返回的是 WAV（服务端硬编码 24 kHz / 16 bit / 单声道）。
 * 段落停顿必须靠分块请求 + PCM 拼接实现——`gap` 只作用于单次请求内部，
 * 且实测拉满也只多 2 秒，做不出段落级停顿。
 */

/** 生成指定秒数的静音 PCM。按采样点取整，避免半个字节。 */
export function silence(seconds) {
  const frames = Math.round(Math.max(0, seconds) * SAMPLE_RATE);
  return Buffer.alloc(frames * CHANNELS * BYTES_PER_SAMPLE);
}

/** 写 44 字节 canonical PCM WAV 头。 */
export function buildWav(pcm, options = {}) {
  const {
    sampleRate = SAMPLE_RATE,
    channels = CHANNELS,
    bitsPerSample = BITS_PER_SAMPLE,
  } = options;
  const data = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/** 遍历 chunk 找 fmt / data，跳过 JUNK、LIST 等无关块与奇数长度补齐字节。 */
export function parseWav(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('parseWav: 输入不是 RIFF/WAVE');
  }

  let sampleRate = 0;
  let channels = 0;
  let pcm = null;
  let offset = 12;

  while (offset + 8 <= b.length) {
    const id = b.toString('latin1', offset, offset + 4);
    const size = b.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > b.length) throw new Error(`parseWav: ${id} chunk 越界`);

    if (id === 'fmt ') {
      channels = b.readUInt16LE(start + 2);
      sampleRate = b.readUInt32LE(start + 4);
    } else if (id === 'data') {
      pcm = b.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }

  if (!pcm) throw new Error('parseWav: 缺少 data chunk');
  return { pcm, sampleRate, channels };
}

export function concatPcm(parts) {
  return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
}

/** PCM → mp3，单次编码，不保留 WAV 中间文件。 */
export function encodeMp3(wavPath, mp3Path) {
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        wavPath,
        '-b:a',
        MP3_BITRATE,
        '-ar',
        String(SAMPLE_RATE),
        '-ac',
        String(CHANNELS),
        mp3Path,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    const stderr = err?.stderr ? err.stderr.toString('utf8').trim() : '';
    throw new Error(`ffmpeg 编码失败：${err.message}\n${stderr}`);
  }
}
