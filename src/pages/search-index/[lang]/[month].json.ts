import type { APIRoute } from 'astro';
import { locales, type Locale } from '../../../config/site';
import { industryName, tagName } from '../../../config/taxonomy';
import { publishedNews, toDateKey } from '../../../lib/content';
import { formatDate } from '../../../lib/i18n';
import { buildIndex, type SearchRecord } from '../../../lib/search';
import { href } from '../../../lib/url';

const months = () =>
  [...new Set(publishedNews().map((n) => toDateKey(n.publishedAt).slice(0, 7)))].sort().reverse();

export function getStaticPaths() {
  return locales.flatMap((lang) => months().map((month) => ({ params: { lang, month } })));
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Locale;
  const month = params.month as string;

  const items = publishedNews().filter((n) => toDateKey(n.publishedAt).slice(0, 7) === month);

  const records: SearchRecord[] = items.map((n) => ({
    id: n.id,
    title: n.title[lang],
    summary: n.summary[lang],
    // 正文也进索引：大量信息只在正文里出现，不索引会搜不到
    body: n.body
      .map((b) => (b.kind === 'ul' ? b.items.map((i) => i[lang]).join(' ') : b.text[lang]))
      .join(' '),
    tags: n.tags.map((t) => tagName(t, lang)).join(' '),
    industry: industryName(n.industry, lang),
    date: formatDate(n.publishedAt, lang),
    industryLabel: industryName(n.industry, lang),
    tagLabels: n.tags.map((t) => tagName(t, lang)),
    url: href(`/${lang}/news/${n.slug}`),
  }));

  const index = buildIndex(records);

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
