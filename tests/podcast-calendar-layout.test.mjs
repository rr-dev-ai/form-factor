import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/global.css', 'utf8');

/** 取出顶格选择器的声明块，避免命中媒体查询里的同名规则。 */
function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  assert.ok(m, `${selector} 规则缺失`);
  return m[1];
}

/** 所有媒体查询片段（文件里有多段 640px 查询，且片段之间夹着普通规则）。 */
function mediaSegments() {
  return css.split('@media').slice(1);
}

test('日历相对日期栏水平居中，不再贴左', () => {
  const body = block('.podcast-calendar');
  assert.doesNotMatch(body, /left:\s*0(?:px)?\s*;/, '日历仍以 left:0 贴左');
  assert.match(body, /left:\s*50%/, '日历未以容器中线为锚点');
  assert.match(body, /transform:\s*translateX\(-50%\)/, '日历未回退自身宽度的一半');
});

test('日历宽度不超过容器，窄屏铺满且不溢出', () => {
  assert.match(block('.podcast-calendar'), /width:\s*min\(100%,\s*340px\)/, '宽屏宽度上限被改动');
  const narrow = mediaSegments().some((part) => /\.podcast-calendar \{\s*width:\s*100%/.test(part));
  assert.ok(narrow, '窄屏日历未铺满');
});
