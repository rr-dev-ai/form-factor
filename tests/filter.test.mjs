import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter } from '../src/scripts/filter.ts';

function bar({ param = 'region', values = 'apac,latam' } = {}) {
  return {
    getAttribute: (name) =>
      name === 'data-param' ? param : name === 'data-values' ? values : null,
    classList: { add: () => {} },
  };
}

function card(region, industry = 'banking') {
  const attrs = { 'data-region': region, 'data-industry': industry };
  const el = { classes: new Set() };
  el.getAttribute = (name) => attrs[name] ?? null;
  el.classList = { add: (name) => el.classes.add(name) };
  return el;
}

function stubDoc({ param = 'region', values = 'apac,latam', cards = [], hasBar = true } = {}) {
  return {
    querySelector: (selector) => (hasBar && selector === '.filter-bar' ? bar({ param, values }) : null),
    querySelectorAll: (selector) => (selector === '[data-region]' ? cards : []),
  };
}

test('未知取值不隐藏任何卡片', () => {
  const cards = [card('apac'), card('europe')];
  const hidden = applyFilter(stubDoc({ cards }), '?region=mars');
  assert.equal(hidden, 0);
  assert.equal(cards[0].classes.size, 0);
  assert.equal(cards[1].classes.size, 0);
});

test('没有 query 时不隐藏任何卡片', () => {
  const cards = [card('apac'), card('europe')];
  assert.equal(applyFilter(stubDoc({ cards }), ''), 0);
  assert.equal(cards[1].classes.size, 0);
});

test('命中取值时只隐藏不匹配的卡片', () => {
  const cards = [card('apac'), card('europe')];
  const hidden = applyFilter(stubDoc({ cards }), '?region=apac');
  assert.equal(hidden, 1);
  assert.equal(cards[0].classes.has('is-hidden'), false);
  assert.equal(cards[1].classes.has('is-hidden'), true);
});

test('多区域卡片按逗号列表匹配', () => {
  const cards = [card('north-america,apac')];
  const hidden = applyFilter(stubDoc({ cards }), '?region=apac');
  assert.equal(hidden, 0);
  assert.equal(cards[0].classes.size, 0);
});

test('页面没有筛选条时安全退出', () => {
  const cards = [card('apac')];
  assert.equal(applyFilter(stubDoc({ cards, hasBar: false }), '?region=apac'), 0);
});

test('industry 维度同构可用', () => {
  const cards = [card('apac', 'banking'), card('apac', 'telecom')];
  const hidden = applyFilter(
    stubDoc({ param: 'industry', values: 'banking,telecom', cards }),
    '?industry=telecom'
  );
  assert.equal(hidden, 1);
  assert.equal(cards[1].classes.has('is-hidden'), false);
});
