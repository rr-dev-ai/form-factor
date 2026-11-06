/**
 * 播客页图标。全部用 SVG 而不是文本字符（‹ › ⌄ ▶ ⏸）：
 * 字体 glyph 的行盒居中不等于可见墨迹居中，标点的 side-bearing 与三角形
 * 的视觉重心都会让控件看起来歪。这里的 path 均在 16×16 viewBox 内
 * 让包围盒中心精确落在 (8, 8)，容器用 grid place-items:center 即可几何居中。
 *
 * 只导出常量字符串，Astro 用 set:html、客户端脚本用 innerHTML 共用同一份定义。
 */

const svg = (body: string, extra = '') =>
  `<svg class="podcast-ico ${extra}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`;

/** 描边型 chevron：端点 5.75/10.25，纵向 3.5/12.5，包围盒中心 (8, 8)。 */
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const ICON_CHEVRON_LEFT = svg(`<path d="M10.25 3.5 5.75 8l4.5 4.5" ${STROKE}/>`);
export const ICON_CHEVRON_RIGHT = svg(`<path d="M5.75 3.5 10.25 8l-4.5 4.5" ${STROKE}/>`);
export const ICON_CHEVRON_DOWN = svg(`<path d="M3.5 5.75 8 10.25l4.5-4.5" ${STROKE}/>`, 'podcast-chevron');

/**
 * 填充型播放三角。三角形的面积重心在底边向右 1/3 处，若只把包围盒放到
 * viewBox 正中，人眼会觉得图标偏左。这里整体右移 1 单位，让重心落在 (8, 8)，
 * SVG 元素盒本身仍由 CSS 精确居中。
 */
export const ICON_PLAY = svg('<path d="M6 3.5 12 8 6 12.5Z" fill="currentColor"/>', 'podcast-ico-play');

/** 暂停双竖条：整体 x 5.5→10.5、y 4→12，包围盒中心 (8, 8)。 */
export const ICON_PAUSE = svg(
  '<path d="M5.5 4h1.8v8H5.5zM8.7 4h1.8v8H8.7z" fill="currentColor"/>',
  'podcast-ico-pause'
);

/** 播放/暂停成对出现，靠按钮的 data-playing 切换显隐。 */
export const PLAY_PAUSE = ICON_PLAY + ICON_PAUSE;
