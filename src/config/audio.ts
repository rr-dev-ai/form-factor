/**
 * 音频链路的唯一常量源。脚本侧（.mjs）与站点侧（Astro）共用。
 *
 * 这里只能用可直接擦除的 TS 语法（类型标注、type 别名）：Node 22 的
 * type stripping 直接执行本文件，不经过 Vite 转译，enum / 参数属性会失败。
 *
 * 任何影响音频字节的改动（停顿规则、码率、拼接方式、音色池）都必须
 * 递增 RENDER_VERSION，否则旧文件不会重建，CDN 上的永久缓存永远不换。
 */

export type Locale = 'zh' | 'en' | 'es';

/** 已实名并绑定的音频专用域名；r2.dev 公开入口已关闭。改域名不影响音频字节，无需递增 RENDER_VERSION。 */
export const audioBaseUrl: string = 'https://audio.formfactor.top';

/** 只保留窗口内的音频文件与 manifest。 */
export const WINDOW_DAYS: number = 90;

/** 影响输出字节的规则版本。变更即全量重建。 */
export const RENDER_VERSION: number = 1;

/** spec §3.2 音色池，全部已在本地 HF 缓存，离线可用。 */
export const AUDIO_VOICES: Record<Locale, string[]> = {
  zh: ['zf_001', 'zf_003', 'zf_005', 'zf_008', 'zm_009', 'zm_010', 'zm_011', 'zm_015'],
  en: ['af_heart', 'am_fenrir', 'am_michael'],
  es: ['ef_dora', 'em_alex'],
};

/** spec §3.3 按净语速校准，锚点 af_heart。新增音色必须重跑校准。 */
export const AUDIO_SPEED: Record<Locale, Record<string, number>> = {
  zh: {
    zf_001: 1.16,
    zf_003: 1.024,
    zf_005: 1.048,
    zf_008: 1.038,
    zm_009: 1.15,
    zm_010: 1.15,
    zm_011: 1.157,
    zm_015: 1.094,
  },
  en: {
    af_heart: 1.254,
    am_fenrir: 1.315,
    am_michael: 1.329,
  },
  es: {
    ef_dora: 1.15,
    em_alex: 1.128,
  },
};

/** spec §7.3 单次请求内部的句间 gap。段落停顿靠分块 + PCM 拼接实现。 */
export const AUDIO_GAP: Record<Locale, number> = {
  zh: 0.25,
  en: 0.18,
  es: 0.2,
};

/** spec §7.3 块间静音基准（秒）。 */
export const PAUSE_BASE: Record<Locale, number> = {
  zh: 0.45,
  en: 0.3,
  es: 0.4,
};

/** 标题之后的停顿，覆盖 BASE。 */
export const TITLE_PAUSE: number = 0.8;

/** 过渡语之后的停顿，覆盖 BASE。 */
export const TRANSITION_PAUSE: number = 0.35;

/** 前或后是小标题时的倍率。 */
export const HEADING_PAUSE_FACTOR: number = 1.4;

/** 相邻两个列表条目时的倍率。 */
export const LIST_PAUSE_FACTOR: number = 0.7;

/** 音频首尾留白（秒）。 */
export const LEAD_IN: number = 0.2;
export const LEAD_OUT: number = 0.5;

/** 正文与 whyItMatters 之间的过渡语，三语固定。 */
export const TRANSITION_TEXT: Record<Locale, string> = {
  zh: '为什么重要。',
  en: 'Why it matters.',
  es: 'Por qué importa.',
};

/** 句末标点判定字符集：出现这些字符就不再补标点。 */
export const SENTENCE_END_RE: RegExp = /[。！？.!?:：…]$/u;

/** 服务端硬编码格式，拼接时按此解释 PCM。 */
export const SAMPLE_RATE: number = 24000;
export const CHANNELS: number = 1;
export const BITS_PER_SAMPLE: number = 16;
export const MP3_BITRATE: string = '96k';

/** 本地 Kokoro 服务，仅监听 127.0.0.1，无鉴权。 */
export const ENGINE_URL: string = 'http://127.0.0.1:8880';

export const LOCALES: Locale[] = ['zh', 'en', 'es'];
