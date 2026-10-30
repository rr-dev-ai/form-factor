import type { APIRoute } from 'astro';
import { locales } from '../../../config/site';
import { publishedNews, toDateKey } from '../../../lib/content';

export function getStaticPaths() {
  return locales.map((lang) => ({ params: { lang } }));
}

/**
 * 索引清单。客户端先取清单，再按需加载最近若干个月的分片，
 * 因此首屏加载体积与历史总量无关。
 */
export const GET: APIRoute = () => {
  const months = [...new Set(publishedNews().map((n) => toDateKey(n.publishedAt).slice(0, 7)))]
    .sort()
    .reverse();

  return new Response(JSON.stringify({ months, generatedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
