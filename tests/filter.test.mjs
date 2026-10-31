import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from '../src/scripts/filter.ts';

function node(attrs) {
  const el = { attrs: { ...attrs }, classes: new Set() };
  el.getAttribute = (name) => el.attrs[name] ?? null;
  el.setAttribute = (name, value) => {
    el.attrs[name] = value;
  };
  el.classList = { add: (name) => el.classes.add(name) };
  return el;
}

const chip = (param, value) => node({ 'data-param': param, 'data-value': value });
const bar = (param) => node({ 'data-param': param });
const card = (regions, tags) =>
  node({ 'data-region': regions, 'data-tag': tags, 'data-industry': 'banking' });

function stubDoc({ chips = [], bars = [], clears = [], cards = [] }) {
  return {
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === '.filter-chip[data-value]') return chips;
      if (selector === '.filter-chip--clear') return clears;
      if (selector === '.filter-bar') return bars;
      if (selector === '[data-region]') return cards;
      return [];
    },
  };
}

test('单维度筛选只隐藏不匹配的卡片', () => {
  const cards = [card('apac', 'esim,roaming'), card('apac', 'softpos')];
  const hidden = applyFilters(
    stubDoc({ chips: [chip('tag', 'esim')], cards }),
    '?tag=esim'
  );
  assert.equal(hidden, 1);
  assert.equal(cards[0].classes.has('is-hidden'), false);
  assert.equal(cards[1].classes.has('is-hidden'), true);
});

test('两个维度叠加时取交集', () => {
  const cards = [
    card('apac', 'esim'),
    card('europe', 'esim'),
    card('apac', 'fraud'),
  ];
  const hidden = applyFilters(
    stubDoc({ chips: [chip('region', 'apac'), chip('tag', 'esim')], cards }),
    '?region=apac&tag=esim'
  );
  assert.equal(hidden, 2);
  assert.equal(cards[0].classes.has('is-hidden'), false);
  assert.equal(cards[1].classes.has('is-hidden'), true);
  assert.equal(cards[2].classes.has('is-hidden'), true);
});

test('未知取值不隐藏任何卡片', () => {
  const cards = [card('apac', 'esim')];
  const hidden = applyFilters(
    stubDoc({ chips: [chip('tag', 'esim')], cards }),
    '?tag=mars'
  );
  assert.equal(hidden, 0);
  assert.equal(cards[0].classes.size, 0);
});

test('无筛选参数时不隐藏任何卡片', () => {
  const cards = [card('apac', 'esim')];
  assert.equal(applyFilters(stubDoc({ chips: [chip('tag', 'esim')], cards }), ''), 0);
  assert.equal(cards[0].classes.size, 0);
});

test('chip 链接保留另一个维度的当前取值', () => {
  const target = chip('tag', 'esim');
  applyFilters(stubDoc({ chips: [chip('region', 'apac'), target], cards: [] }), '?region=apac');
  assert.equal(target.attrs.href, '?region=apac&tag=esim');
});

test('清除链接只移除自己那个维度', () => {
  const clearTag = node({ 'data-param': 'tag' });
  const clearRegion = node({ 'data-param': 'region' });
  applyFilters(
    stubDoc({ clears: [clearTag, clearRegion], cards: [] }),
    '?region=apac&tag=esim'
  );
  assert.equal(clearTag.attrs.href, '?region=apac');
  assert.equal(clearRegion.attrs.href, '?tag=esim');
});

test('命中的维度给筛选条打上 is-filtered', () => {
  const regionBar = bar('region');
  const tagBar = bar('tag');
  applyFilters(
    stubDoc({
      chips: [chip('region', 'apac'), chip('tag', 'esim')],
      bars: [regionBar, tagBar],
      cards: [],
    }),
    '?tag=esim'
  );
  assert.equal(tagBar.classes.has('is-filtered'), true);
  assert.equal(regionBar.classes.has('is-filtered'), false);
});
