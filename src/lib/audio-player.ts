import { audioBaseUrl } from '../config/audio.ts';
import type { Locale } from '../config/site.ts';
import { audioFor } from './audio.ts';
import type { AudioIndex, AudioMeta } from './audio.ts';

/**
 * 文章页播放器的显示决策。manifest 未命中时返回 null，页面据此不渲染任何节点——
 * 不加灰态、不加提示。音频域名只从配置取，数据里只有相对路径。
 */
export interface PlayerProps {
  src: string;
  voice: string;
  duration: number;
}

export function audioSrc(meta: AudioMeta): string {
  return `${audioBaseUrl}/${meta.file.replace(/^\//, '')}`;
}

export function playerProps(slug: string, locale: Locale, index?: AudioIndex): PlayerProps | null {
  const meta = index ? index.audioFor(slug, locale) : audioFor(slug, locale);
  if (!meta) return null;
  return { src: audioSrc(meta), voice: meta.voice, duration: meta.duration };
}
