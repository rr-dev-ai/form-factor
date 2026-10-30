import MiniSearch, { type Options } from 'minisearch';

/**
 * 三语共用的分词器。
 * 中文没有空格，默认的空格分词会让「移动支付」搜不到「移动支付市场」，
 * 退化成单字匹配又会把「支行」「付钱」一并捞出。这里按双字切分：
 * 「移动支付」→ 移/移动/动/动支/支/支付/付，兼顾召回与噪音。
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  const latin = lower.match(/[a-z0-9]+/g);
  if (latin) tokens.push(...latin);

  const cjkRuns = lower.match(/[\u4e00-\u9fff]+/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      for (let i = 0; i < run.length; i += 1) {
        tokens.push(run[i]);
        if (i + 1 < run.length) tokens.push(run.slice(i, i + 2));
      }
    }
  }

  return tokens;
}

/** 构建索引与客户端加载必须使用同一份配置，否则分片无法被正确检索 */
export const searchOptions: Options = {
  fields: ['title', 'summary', 'tags', 'industry'],
  storeFields: ['title', 'summary', 'date', 'industryLabel', 'tagLabels', 'url'],
  tokenize,
  searchOptions: {
    boost: { title: 3, tags: 2 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'AND',
  },
};

export type SearchRecord = {
  id: string;
  title: string;
  summary: string;
  tags: string;
  industry: string;
  date: string;
  industryLabel: string;
  tagLabels: string[];
  url: string;
};

export function buildIndex(records: SearchRecord[]) {
  const index = new MiniSearch(searchOptions);
  index.addAll(records);
  return index;
}
