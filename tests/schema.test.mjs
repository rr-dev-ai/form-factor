import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newsItemSchema, draftItemSchema, dayRecordSchema } from '../src/lib/schema.ts';

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

test('draftItemSchema 剔除三个由提升脚本填写的字段', () => {
  const parsed = draftItemSchema.parse(item);
  assert.equal('status' in parsed, false);
  assert.equal('publishedAt' in parsed, false);
  assert.equal('ingestedAt' in parsed, false);
  assert.equal(parsed.slug, item.slug);
});

test('draftItemSchema 仍然强制三语与正文块数', () => {
  const oneBlock = { ...item, body: [item.body[0]] };
  assert.equal(draftItemSchema.safeParse(oneBlock).success, false);
  const missingEs = { ...item, title: { zh: '只有中文', en: 'only en', es: '' } };
  assert.equal(draftItemSchema.safeParse(missingEs).success, false);
});

test('dayRecordSchema 的新字段有默认值', () => {
  const day = dayRecordSchema.parse({
    date: '2026-11-02',
    startedAt: '2026-11-02T04:15:00+08:00',
    durationMs: 0,
    fetched: 0,
    afterDedup: 0,
    passed: 0,
    published: 0,
    industries: {},
  });
  assert.equal(day.candidates, 0);
  assert.equal(day.pooled, 0);
  assert.equal(day.fallback, false);
  assert.deepEqual(day.conflicts, []);
});
