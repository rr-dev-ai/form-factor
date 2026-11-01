/**
 * 校验一个池文件。编辑每写完一条就跑一次，不要等构建来发现。
 *
 * 用法：node scripts/check-draft.mjs content/_pool/2026-11-02-banking.json
 * 退出码：0 全部合规；1 有问题（逐条打印）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { draftItemSchema } from '../src/lib/schema.ts';
import { tags } from '../src/config/taxonomy.ts';
import { regionIssues } from '../src/config/regions.ts';

const KNOWN_TAGS = new Set(tags.map((t) => t.slug));

/** 草稿不许写的三个字段：它们在发布时由提升脚本统一填写。 */
const FORBIDDEN = ['status', 'publishedAt', 'ingestedAt'];

/** 三语长度，只用于打印，判定交给 schema。 */
function lens(value) {
  const at = (k) => (typeof value?.[k] === 'string' ? value[k].length : 0);
  return [at('zh'), at('en'), at('es')];
}

export function inspectDraft(raw) {
  if (!raw || typeof raw !== 'object') return ['草稿不是一个对象'];

  const messages = [];

  for (const field of FORBIDDEN) {
    if (field in raw) messages.push(`草稿不得包含 ${field}，由提升脚本在发布时填写`);
  }

  const parsed = draftItemSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      messages.push(`${issue.path.join('.') || '(根节点)'}：${issue.message}`);
    }
  }

  const draftTags = Array.isArray(raw.tags) ? raw.tags : [];
  for (const tag of draftTags) {
    if (!KNOWN_TAGS.has(tag)) messages.push(`未在 taxonomy 中定义的标签：${tag}`);
  }

  const regions = Array.isArray(raw.regions) ? raw.regions : [];
  if (typeof raw.region === 'string') {
    messages.push(...regionIssues({ region: raw.region, regions }));
  }

  return messages;
}

export function inspectPool(doc) {
  const drafts = Array.isArray(doc?.drafts) ? doc.drafts : [];
  const problems = [];
  const lengths = [];

  // 池级字段先查：缺 startedAt 会让整池草稿在提升时填不出 ingestedAt，
  // 而单条草稿的校验看不出来。
  const poolProblems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc?.date ?? '')) poolProblems.push('池缺少合法 date（YYYY-MM-DD）');
  if (!doc?.industry) poolProblems.push('池缺少 industry');
  if (!doc?.startedAt) poolProblems.push('池缺少 startedAt，提升时无法填写 ingestedAt');
  if (poolProblems.length) problems.push({ slug: '(池)', messages: poolProblems });

  drafts.forEach((draft) => {
    const slug = draft?.slug ?? '(无 slug)';
    const messages = inspectDraft(draft);
    if (messages.length) problems.push({ slug, messages });
    lengths.push({ slug, title: lens(draft?.title), why: lens(draft?.whyItMatters) });
  });

  return { ok: problems.length === 0, problems, lengths };
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('用法：node scripts/check-draft.mjs <池文件>');
    process.exit(2);
  }

  const file = path.resolve(process.cwd(), target);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`读不了池文件：${file}\n${err.message}`);
    process.exit(1);
  }

  const result = inspectPool(doc);
  for (const row of result.lengths) {
    console.log(`${row.slug}  title ${row.title.join('/')}  why ${row.why.join('/')}`);
  }

  if (!result.ok) {
    console.error(`\n${result.problems.length} 条草稿不合规：`);
    for (const problem of result.problems) {
      console.error(`· ${problem.slug}`);
      for (const message of problem.messages) console.error(`    ${message}`);
    }
    process.exit(1);
  }

  console.log(`\n${result.lengths.length} 条草稿全部合规`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
