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

/**
 * 中文标题上限，按「失控线」设定，不是目标线。
 *
 * 2026-11 的 40 条里有 25 条超过 34 字，多数并非越界：加纳那条把罚款额放在冒号后、
 * 尼日利亚那条放的是部署重点，都是事件核心。34 字会误伤正常写法。
 * 40 字只挡明显失控的——三四件事塞进一个标题。目标仍是 30 字上下。
 * 真正要防的是标题与 summary 重复，那一条靠判据约束，不靠字数。
 */
const TITLE_ZH_MAX = 40;

/**
 * whyItMatters 中文下限，防回归用，不是纠错工具。
 * 10 月有 22 条只写了一层就收尾；11 月的 40 条全部超过 120 字，已经自己修好。
 * 这条线只防止退回那种写法。
 */
const WHY_ZH_MIN = 120;

/**
 * 自称媒体机构。这个站没有编辑部，出现即是从原文口吻串味。
 * 只ban自称，不ban「记者」——引述他人身份是正常写法。
 */
const SELF_REFERENCE = ['本刊', '本报', '本台', '本社'];

/** 取出草稿里所有中文正文与判断，供禁止词扫描。 */
function readableZhTexts(raw) {
  const blocks = Array.isArray(raw.body) ? raw.body : [];
  const fromBody = blocks.flatMap((block) =>
    block?.kind === 'ul' && Array.isArray(block.items)
      ? block.items.map((item) => (typeof item?.zh === 'string' ? item.zh : ''))
      : [typeof block?.text?.zh === 'string' ? block.text.zh : '']
  );
  const fromWhy = typeof raw.whyItMatters?.zh === 'string' ? [raw.whyItMatters.zh] : [];
  return [...fromBody, ...fromWhy].filter(Boolean);
}

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

  const titleZh = raw.title?.zh;
  if (typeof titleZh === 'string' && titleZh.length > TITLE_ZH_MAX) {
    messages.push(
      `title.zh 长 ${titleZh.length} 字，超出 ${TITLE_ZH_MAX} 字上限：先看 summary 是不是在复述标题，删掉重复的那半句`
    );
  }

  const whyZh = raw.whyItMatters?.zh;
  if (typeof whyZh === 'string' && whyZh.length < WHY_ZH_MIN) {
    messages.push(
      `whyItMatters.zh 只有 ${whyZh.length} 字，低于 ${WHY_ZH_MIN} 字下限：选 1–3 个分析维度写透，落到具体受影响方`
    );
  }

  for (const text of readableZhTexts(raw)) {
    const hit = SELF_REFERENCE.find((word) => text.includes(word));
    if (hit) {
      messages.push(`正文出现「${hit}」：本站不是媒体机构，不要用编辑部口吻，改为「公告未说明」这类写法`);
      break;
    }
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
