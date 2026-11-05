import fs from 'node:fs';
import path from 'node:path';
import { readManifestFiles, parseManifest } from '../../src/lib/audio.ts';

/** 按天拆分，单文件会让 git 每天多 400 KB 历史。 */
export function manifestPath(dir, date) {
  return path.join(dir, `${date}.json`);
}

/** 合并全部按天 manifest 成内存索引。损坏文件不进入结果，并整体报错。 */
export function loadManifests(dir) {
  return readManifestFiles(dir);
}

const DAY_MS = 86400000;

function toUtcDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 升序，含当天，共 days 个自然日。 */
export function windowDates(todayKey, days) {
  const end = toUtcDay(todayKey);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(new Date(end - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

/** 列出窗外日期（升序），供删除过期 manifest 与 staging 文件。 */
export function pruneDates(existingDates, todayKey, days) {
  const inside = new Set(windowDates(todayKey, days));
  return [...existingDates].filter((d) => !inside.has(d)).sort();
}

/**
 * 写某一天的 manifest。写入前用与构建期相同的 schema 校验，
 * 避免把不合规数据落盘后再由 npm run build 拦下。
 */
export function writeManifest(dir, date, items, generatedAt, renderer) {
  const record = parseManifest({ date, generatedAt, renderer, items }, `${date}.json`);
  fs.mkdirSync(dir, { recursive: true });
  const target = manifestPath(dir, date);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return target;
}
