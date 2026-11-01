/**
 * 备选池的路径与读写。只做 I/O，不含任何选择判断。
 *
 * 池文件与被发布内容分开放：`content/news/` 由 loadNews() 全量校验，
 * 一份字段写错的草稿会拖垮构建；池不参与构建，坏稿只影响选择。
 */
import fs from 'node:fs';
import path from 'node:path';
import { shiftDateKey } from '../../src/lib/content.ts';
import { industries } from '../../src/config/taxonomy.ts';

export const POOL_DIR = path.join(process.cwd(), 'content', '_pool');
export const INDUSTRIES = industries.map((i) => i.slug);

/** `content/_pool/YYYY-MM-DD-<industry>.json` */
export function poolPath(date, industry, dir = POOL_DIR) {
  return path.join(dir, `${date}-${industry}.json`);
}

/** 文件不存在返回 null；JSON 解析失败抛 code 为 POOL_INVALID 的错误。 */
export function readPool(date, industry, dir = POOL_DIR) {
  const file = poolPath(date, industry, dir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    const error = new Error(`池文件无法解析：${file}（${err.message}）`);
    error.code = 'POOL_INVALID';
    throw error;
  }
}

export function writePool(doc, dir = POOL_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(poolPath(doc.date, doc.industry, dir), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

/**
 * 读最近 days 天的池。解析失败的文件进 broken，不让整批失败——
 * 编辑是边写边落盘的，读到半截 JSON 属于正常竞态，不是异常。
 */
export function listPools(date, days, dir = POOL_DIR) {
  const docs = [];
  const broken = [];
  for (let i = 0; i < days; i += 1) {
    const key = shiftDateKey(date, -i);
    for (const industry of INDUSTRIES) {
      const file = poolPath(key, industry, dir);
      if (!fs.existsSync(file)) continue;
      try {
        docs.push({
          date: key,
          industry,
          doc: JSON.parse(fs.readFileSync(file, 'utf8')),
          mtimeMs: fs.statSync(file).mtimeMs,
        });
      } catch (err) {
        broken.push({ date: key, industry, error: err.message });
      }
    }
  }
  return { docs, broken };
}
