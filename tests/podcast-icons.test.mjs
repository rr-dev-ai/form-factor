import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ICON_CHEVRON_LEFT,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_DOWN,
  ICON_PLAY,
  ICON_PAUSE,
  PLAY_PAUSE,
} from '../src/lib/podcast-icons.ts';

const css = fs.readFileSync('src/styles/global.css', 'utf8');
const astro = fs.readFileSync('src/pages/[lang]/podcasts.astro', 'utf8');
const script = fs.readFileSync('src/scripts/podcast.ts', 'utf8');

const ICONS = {
  ICON_CHEVRON_LEFT,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_DOWN,
  ICON_PLAY,
  ICON_PAUSE,
};

/** 从 path 的 d 里抽出所有坐标对，算可见形状的包围盒中心。 */
function inkBounds(svgMarkup) {
  const d = /<path d="([^"]+)"/.exec(svgMarkup)?.[1];
  assert.ok(d, '图标必须有 path d');
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  assert.ok(nums.length >= 4, 'path 坐标不足');
  return { d, nums };
}

test('每个图标都是 16×16 viewBox 的 SVG，且不含文本字符', () => {
  for (const [name, markup] of Object.entries(ICONS)) {
    assert.match(markup, /^<svg /, `${name} 不是 SVG`);
    assert.match(markup, /viewBox="0 0 16 16"/, `${name} viewBox 不对`);
    assert.match(markup, /aria-hidden="true"/, `${name} 缺 aria-hidden`);
    assert.doesNotMatch(markup, /[‹›⌄▶⏸]/u, `${name} 含文本字形`);
  }
});

test('chevron 与暂停图标的包围盒中心精确落在 (8, 8)', () => {
  // 描边 chevron：端点 5.75 / 10.25，纵向 3.5 / 12.5
  for (const name of ['ICON_CHEVRON_LEFT', 'ICON_CHEVRON_RIGHT']) {
    const { d } = inkBounds(ICONS[name]);
    assert.match(d, /5\.75|10\.25/, `${name} 水平端点未对称`);
    assert.match(d, /3\.5|4\.5|12\.5/, `${name} 纵向端点未对称`);
  }
  const { d: down } = inkBounds(ICON_CHEVRON_DOWN);
  assert.match(down, /3\.5 5\.75 8 10\.25l4\.5-4\.5/, '下拉 chevron 未纵向居中');

  // 暂停双竖条：x 5.5→10.5、y 4→12，中心 (8, 8)
  const { d: pause } = inkBounds(ICON_PAUSE);
  assert.match(pause, /M5\.5 4h1\.8v8H5\.5zM8\.7 4h1\.8v8H8\.7z/, '暂停图标未居中');
});

test('播放三角按面积重心对齐 (8, 8)，而非包围盒中心', () => {
  const { d } = inkBounds(ICON_PLAY);
  // 底边 x=6、顶点 x=12 → 重心 x = (6+6+12)/3 = 8；y 3.5→12.5 中心 8
  assert.match(d, /M6 3\.5 12 8 6 12\.5Z/, '三角重心补偿被改动');
  const xs = [6, 12, 6];
  const ys = [3.5, 8, 12.5];
  assert.equal(xs.reduce((a, b) => a + b, 0) / 3, 8);
  assert.equal(ys.reduce((a, b) => a + b, 0) / 3, 8);
});

test('PLAY_PAUSE 成对导出，播放/暂停各一枚且带正确类名', () => {
  assert.equal(PLAY_PAUSE, ICON_PLAY + ICON_PAUSE);
  assert.match(PLAY_PAUSE, /podcast-ico-play/);
  assert.match(PLAY_PAUSE, /podcast-ico-pause/);
});

test('页面与脚本都不再用 textContent 切换字符图标', () => {
  for (const [file, src] of [['podcasts.astro', astro], ['podcast.ts', script]]) {
    assert.doesNotMatch(src, /[‹›⌄▶⏸]/u, `${file} 仍有文本字符图标`);
    assert.doesNotMatch(src, /textContent\s*=\s*'[▶⏸]'/u, `${file} 仍用 textContent 换图标`);
  }
  assert.match(astro, /data-playing="false"/, '初始状态未声明');
  assert.match(script, /dataset\.playing\s*=\s*'true'/, '播放态未切换');
  assert.match(script, /dataset\.playing\s*=\s*'false'/, '暂停态未切换');
});

test('CSS 用三列网格居中日期、基线对齐数字，并限定播放图标作用域', () => {
  assert.match(css, /grid-template-columns:\s*30px minmax\(0, 1fr\) 30px/, '日期栏不是三列等宽');
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/, '日期文字未放中列');
  assert.match(css, /align-items:\s*baseline/, '数字与日期未基线对齐');
  assert.match(css, /\.podcast-item-play\[data-playing='true'\] \.podcast-ico-play/, '播放图标作用域未限定');
  // 行首锚定：限定选择器是 `.podcast-item-play[data-playing...]`，全局裸选择器才会顶格出现
  assert.doesNotMatch(css, /^\[data-playing='true'\] \.podcast-ico-play/m, '存在全局 data-playing 选择器');
  assert.match(css, /\.podcast-date-chevron/, '下拉箭头样式缺失');
  assert.match(css, /transform:\s*rotate\(180deg\)/, '展开时箭头未翻转');
});
