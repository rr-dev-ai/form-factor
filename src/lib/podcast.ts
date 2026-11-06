import { audioBaseUrl } from '../config/audio.ts';
import type { Locale } from '../config/site.ts';
import { publishedNews } from './content.ts';
import type { NewsItem } from './schema.ts';
import { audioByDate } from './audio.ts';
import type { AudioIndex } from './audio.ts';

export interface PodcastItem {
  slug: string;
  title: string;
  industry: string;
  duration: number;
  voice: string;
  url: string;
}

type SliceNews = Pick<NewsItem, 'slug' | 'title' | 'industry'>;

/**
 * 按日分片的内容。endpoint 与测试共用这一个函数，前端拿到的 items
 * 与 audioByDate 同源，不会出现「索引显示 12 条、分片只有 9 条」。
 *
 * manifest 里存在但内容库已撤稿的 slug 直接剔除——manifest 是音频的
 * 真相源，但页面标题必须来自内容库。
 */
export function buildPodcastSlice(
  locale: Locale,
  date: string,
  { index, news = publishedNews() }: { index?: AudioIndex; news?: SliceNews[] } = {}
): PodcastItem[] {
  const bySlug = new Map(news.map((item) => [item.slug, item]));
  const audios = index ? index.audioByDate(locale, date) : audioByDate(locale, date);

  return audios.flatMap((audio) => {
    const item = bySlug.get(audio.slug);
    if (!item) return [];
    return [{
      slug: audio.slug,
      title: item.title[locale],
      industry: item.industry,
      duration: audio.duration,
      voice: audio.voice,
      url: `${audioBaseUrl}/${audio.file.replace(/^\//, '')}`,
    }];
  });
}
