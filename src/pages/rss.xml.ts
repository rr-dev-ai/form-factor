import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { site } from '../config/site';
import { publishedNews } from '../lib/content';
import { href } from '../lib/url';

export async function GET(context: APIContext) {
  const items = publishedNews().slice(0, 40);

  return rss({
    title: site.name,
    description: site.description.zh,
    site: context.site ?? site.baseUrl,
    items: items.map((n) => ({
      title: n.title.zh,
      pubDate: new Date(n.publishedAt),
      description: n.summary.zh,
      link: href(`/zh/news/${n.slug}`),
      categories: n.tags,
    })),
  });
}
