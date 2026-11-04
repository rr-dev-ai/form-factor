import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPool } from '../scripts/check-draft.mjs';

/**
 * whyItMatters 的中文下限是 120 字，fixture 不能再写占位词。
 * 这段取自实际发布内容，长度约 200 字，改短会让「合法草稿通过」失败。
 */
const WHY_ZH =
  '变的是签发环节的受理分工：采集点从政府窗口转成私营网点，柜台只做生物特征与身份核对。' +
  '对这条链上的供应商，采购口径随之改变——要供的不再只是证件本身，还有每个采集工位的指纹仪、' +
  '相机与灯光，以及预约、付费、排队叫号与后端制证系统的对接。二十三个网点分三批开出，' +
  '意味着设备与集成的交付节奏被写死在时间表上；十四个工作日与两档定价则把单点吞吐变成可考核的硬指标。' +
  '要跟的是地区中心首周的实际受理量，以及线上预填与柜台采集之间的数据衔接是否出现退件。';

const draft = (over = {}) => ({
  id: '2026-11-02-banking-01',
  slug: 'octobank-apple-pay',
  industry: 'banking',
  region: 'cis',
  regions: [],
  tags: ['acquiring'],
  originalLang: 'en',
  sources: [{ name: 'UzNews', url: 'https://uznews.uz/ru/news/113864', publishedAt: '2026-10-29T20:40:00+05:00' }],
  title: { zh: '标题', en: 'Title', es: 'Título' },
  summary: { zh: '导语', en: 'Summary', es: 'Resumen' },
  body: [
    { kind: 'p', text: { zh: '正文', en: 'Body', es: 'Texto' } },
    { kind: 'p', text: { zh: '正文二', en: 'Body 2', es: 'Texto 2' } },
  ],
  whyItMatters: { zh: WHY_ZH, en: 'Impact', es: 'Impacto' },
  confidence: 0.8,
  ai: { model: 'm', promptVersion: 'v1' },
  ...over,
});

const pool = (...drafts) => ({
  date: '2026-11-02',
  industry: 'banking',
  startedAt: '2026-11-02T02:30:12+08:00',
  drafts,
  rejected: [],
  stats: { candidates: 10, written: drafts.length, skippedByDedup: 2 },
});

test('合法草稿通过', () => {
  const r = inspectPool(pool(draft()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('缺任一语言不通过', () => {
  const r = inspectPool(pool(draft({ title: { zh: '标题', en: 'Title', es: '' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /es/);
});

test('草稿里出现 status / publishedAt / ingestedAt 不通过', () => {
  const r = inspectPool(pool(draft({ publishedAt: '2026-11-02T04:20:00+08:00' })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /publishedAt/);
});

test('whyItMatters 超出语言上限不通过', () => {
  const r = inspectPool(pool(draft({ whyItMatters: { zh: '字'.repeat(401), en: 'x', es: 'y' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /whyItMatters/);
});

test('未在 taxonomy 定义的标签不通过', () => {
  const r = inspectPool(pool(draft({ tags: ['not-a-tag'] })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /not-a-tag/);
});

// 标题与判断的下限/上限。存量内容不追溯，只约束新写的草稿。
test('中文标题超过 40 字不通过', () => {
  const r = inspectPool(pool(draft({ title: { zh: '标'.repeat(41), en: 'Title', es: 'Título' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /标题/);
});

test('中文标题正好 40 字通过', () => {
  const r = inspectPool(pool(draft({ title: { zh: '标'.repeat(40), en: 'Title', es: 'Título' } })));
  assert.equal(r.ok, true);
});

test('whyItMatters 中文不足 120 字不通过', () => {
  const r = inspectPool(pool(draft({ whyItMatters: { zh: '影响'.repeat(20), en: 'x', es: 'y' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /whyItMatters/);
});

test('whyItMatters 只写「改变了哪个环节」一层会被挡下', () => {
  const oneLayer = '变的是签发与受理之间的那一层：政府不只发实体注册文件，而是把代表权做成可复用的签名凭证。';
  const r = inspectPool(pool(draft({ whyItMatters: { zh: oneLayer, en: 'x', es: 'y' } })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /whyItMatters/);
});

test('正文冒充媒体机构（本刊 / 本报）不通过', () => {
  const body = [
    { kind: 'p', text: { zh: '公告没有说明凭证采用哪种格式，本刊未能独立核实。', en: 'a', es: 'b' } },
    { kind: 'p', text: { zh: '正文二', en: 'Body 2', es: 'Texto 2' } },
  ];
  const r = inspectPool(pool(draft({ body })));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].messages.join(), /本刊/);
});

test('正文引用他人身份不算冒充，不误伤', () => {
  const body = [
    { kind: 'p', text: { zh: '一名记者在发布会上提问，官员未回应。', en: 'a', es: 'b' } },
    { kind: 'p', text: { zh: '正文二', en: 'Body 2', es: 'Texto 2' } },
  ];
  const r = inspectPool(pool(draft({ body })));
  assert.equal(r.ok, true);
});

test('空池合法', () => {
  assert.equal(inspectPool(pool()).ok, true);
});

test('池缺 startedAt 时判为不合规，不能留给构建去发现', () => {
  const p = pool(draft());
  delete p.startedAt;
  const r = inspectPool(p);
  assert.equal(r.ok, false);
  assert.match(r.problems.map((x) => x.messages.join()).join(), /startedAt/);
});
