import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSourceName, sourceLabel } from '../src/lib/i18n.ts';

test('剥掉来源名结尾的括号注释', () => {
  assert.equal(cleanSourceName('NIST（新闻稿）'), 'NIST');
  assert.equal(cleanSourceName('Mobile World Live（西班牙语版）'), 'Mobile World Live');
  assert.equal(cleanSourceName("Merchant's Eye（含 Checkout.com 新闻稿全文）"), "Merchant's Eye");
  assert.equal(cleanSourceName('Zawya (official release)'), 'Zawya');
});

test('连续多段括号一起剥掉', () => {
  assert.equal(cleanSourceName('ESMC（协会）（新闻稿）'), 'ESMC');
});

test('没有注释的名字原样返回', () => {
  assert.equal(cleanSourceName('Reuters'), 'Reuters');
  assert.equal(cleanSourceName('中国移动'), '中国移动');
});

test('整名都是括号时保留原名，不要剥成空', () => {
  assert.equal(cleanSourceName('（新闻稿）'), '（新闻稿）');
  assert.equal(cleanSourceName('   '), '');
});

test('单来源用清理后的名字，多来源仍用数量', () => {
  assert.equal(sourceLabel([{ name: 'NIST（新闻稿）' }], 'en'), 'NIST');
  assert.equal(sourceLabel([{ name: 'A' }, { name: 'B' }], 'zh'), '2 来源');
});
