import type { APIRoute } from 'astro';
import { locales, type Locale } from '../../../config/site';
import { audioDates } from '../../../lib/audio';
import { buildPodcastSlice } from '../../../lib/podcast';

/** 只生成「该语种确实有音频」的日期，空分片会让前端多一次无谓的判空。 */
export function getStaticPaths() {
  return locales.flatMap((lang) =>
    audioDates(lang).map(({ date }) => ({ params: { lang, date } }))
  );
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Locale;
  const date = params.date as string;

  return new Response(JSON.stringify({ date, items: buildPodcastSlice(lang, date) }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
