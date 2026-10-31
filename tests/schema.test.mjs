import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newsItemSchema } from '../src/lib/schema.ts';

const path = new URL('../content/news/2026/10/2026-10-31-banking-01.json', import.meta.url);
const item = JSON.parse(fs.readFileSync(path, 'utf8'));

test('缺少 region 时校验失败', () => {
  const { region, ...rest } = item;
  assert.equal(newsItemSchema.safeParse(rest).success, false);
});

test('region 不在枚举内时失败', () => {
  assert.equal(newsItemSchema.safeParse({ ...item, region: 'mars' }).success, false);
});

test('regions 缺省为空数组', () => {
  const { regions, ...rest } = item;
  const parsed = newsItemSchema.parse({ ...rest, region: 'apac' });
  assert.deepEqual(parsed.regions, []);
});

test('regions 超过 3 个时失败', () => {
  const tooMany = ['apac', 'europe', 'africa', 'latam'];
  assert.equal(newsItemSchema.safeParse({ ...item, region: 'global', regions: tooMany }).success, false);
});

test('当前全部内容都带合法 region', () => {
  assert.ok(newsItemSchema.safeParse(item).success, '夹具本身应通过校验');
});
