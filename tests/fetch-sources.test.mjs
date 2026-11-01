import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTargets } from '../scripts/lib/targets.mjs';

const rss = (id, enabled) => ({ id, enabled, fetch: { kind: 'rss', url: `https://example.com/${id}` } });
const scrape = (id, enabled) => ({ id, enabled, fetch: { kind: 'scrape', url: `https://example.com/${id}`, selector: null } });

const sources = [rss('a', true), rss('b', false), scrape('c', true), scrape('d', false)];

const ids = (list) => list.map((s) => s.id);

test('不带参数时只取 enabled 的源', () => {
  assert.deepEqual(ids(pickTargets(sources)), ['a', 'c']);
});

test('rssOnly 排除 scrape 源', () => {
  assert.deepEqual(ids(pickTargets(sources, { rssOnly: true })), ['a']);
});

test('显式指定 id 时忽略 enabled，否则关闭的源永远无法验证', () => {
  assert.deepEqual(ids(pickTargets(sources, { ids: ['b', 'd'] })), ['b', 'd']);
});

test('显式指定 id 仍然遵守 rssOnly', () => {
  assert.deepEqual(ids(pickTargets(sources, { ids: ['b', 'd'], rssOnly: true })), ['b']);
});

test('未知 id 返回空数组', () => {
  assert.deepEqual(pickTargets(sources, { ids: ['nope'] }), []);
});

test('ids 为空数组时按 enabled 处理，不退化为全选', () => {
  assert.deepEqual(ids(pickTargets(sources, { ids: [] })), ['a', 'c']);
});
