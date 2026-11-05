import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleSegments, pauseBetween } from '../scripts/lib/tts-text.mjs';

const loc = (zh, en, es) => ({ zh, en, es });

const item = {
  slug: 'demo',
  title: loc('标题没有句号', 'A title without a period', 'Un titulo sin punto'),
  summary: loc(
    '这句导语不该被读出来 SENTINEL_SUMMARY',
    'This summary must not be read SENTINEL_SUMMARY',
    'Este resumen no debe leerse SENTINEL_SUMMARY'
  ),
  whyItMatters: loc('因为它改变了形态', 'Because it changes the form factor', 'Porque cambia el formato'),
  body: [
    { kind: 'h', text: loc('小标题', 'Heading', 'Encabezado') },
    { kind: 'p', text: loc('第一段', 'First paragraph', 'Primer parrafo') },
    {
      kind: 'ul',
      items: [
        loc('要点一', 'Point one', 'Punto uno'),
        loc('要点二', 'Point two', 'Punto dos'),
        loc('要点三', 'Point three', 'Punto tres'),
      ],
    },
    { kind: 'p', text: loc('结尾没有标点', 'Last paragraph without punctuation', 'Ultimo parrafo sin puntuacion') },
  ],
};

test('段顺序为 title / h / p / ul×3 / p / transition / why', () => {
  const segs = assembleSegments(item, 'zh');
  assert.deepEqual(
    segs.map((s) => s.kind),
    ['title', 'h', 'p', 'ul', 'ul', 'ul', 'p', 'transition', 'why']
  );
});

test('过渡语为中文固定文案，whyItMatters 收尾', () => {
  const segs = assembleSegments(item, 'zh');
  assert.equal(segs.at(-2).text, '为什么重要。');
  assert.equal(segs.at(-1).text, '因为它改变了形态。');
});

test('三语过渡语各自固定', () => {
  assert.equal(assembleSegments(item, 'en').at(-2).text, 'Why it matters.');
  assert.equal(assembleSegments(item, 'es').at(-2).text, 'Por qué importa.');
});

test('summary 不进入朗读稿', () => {
  const segs = assembleSegments(item, 'zh');
  assert.ok(!segs.some((s) => s.text.includes('SENTINEL_SUMMARY')));
});

test('ul 的每个条目单独成块且内容互不相同', () => {
  const ul = assembleSegments(item, 'en').filter((s) => s.kind === 'ul');
  assert.deepEqual(ul.map((s) => s.text), ['Point one.', 'Point two.', 'Point three.']);
});

test('块间停顿按规则表取值', () => {
  assert.equal(pauseBetween('title', 'p', 'zh'), 0.8);
  assert.equal(pauseBetween('transition', 'why', 'en'), 0.35);
  assert.equal(pauseBetween('h', 'p', 'zh'), +(0.45 * 1.4).toFixed(3));
  assert.equal(pauseBetween('p', 'h', 'es'), +(0.4 * 1.4).toFixed(3));
  assert.equal(pauseBetween('ul', 'ul', 'en'), +(0.3 * 0.7).toFixed(3));
  assert.equal(pauseBetween('p', 'p', 'es'), 0.4);
});

test('英文与西语块尾无标点时补句号，已有问号时不补', () => {
  const en = assembleSegments(item, 'en');
  assert.equal(en[0].text, 'A title without a period.');
  assert.equal(en.at(-3).text, 'Last paragraph without punctuation.');

  const withQuestion = {
    ...item,
    title: loc('带问号？', 'Does it end here?', 'Termina aqui?'),
  };
  assert.equal(assembleSegments(withQuestion, 'en')[0].text, 'Does it end here?');
  assert.equal(assembleSegments(withQuestion, 'es')[0].text, 'Termina aqui?');
  assert.equal(assembleSegments(withQuestion, 'zh')[0].text, '带问号？');
});
