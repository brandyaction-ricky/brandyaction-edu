import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['lib/lesson-reading-pages.ts'], bundle:true, platform:'node', format:'esm', write:false });
const { lessonReadingPages, withoutBlankPages, lessonSections } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

test('pages preserve paragraphs, rich formatting, embedded exercises and side-by-side images', () => {
  const nodes = [
    {type:'paragraph',content:[{type:'text',text:'가'.repeat(960),marks:[{type:'bold'}]}]},
    {type:'details',content:[{type:'detailsSummary',content:[{type:'text',text:'직접 해보기'}]},
      {type:'detailsContent',content:[{type:'lessonEmbed',attrs:{blockId:'practice'}}]}]},
  ];
  const prefix = 'edu-lesson:v1\n';
  const body = {id:'body',type:'text',content:prefix + JSON.stringify({type:'doc',content:nodes})};
  const image = id => ({id,type:'image',assetId:id,imageGroup:'pair'});
  const blocks = [body,{id:'practice',type:'question',question:{kind:'text',label:'직접 쓰기',required:true}},image('left'),image('right'),{id:'quiz',type:'quiz'}];
  const before = structuredClone(blocks);
  const pages = lessonReadingPages(blocks), flat=pages.flat();
  assert.deepEqual(flat.filter(b=>b.id==='body').flatMap(b=>JSON.parse(b.content.slice(prefix.length)).content),nodes);
  assert.ok(pages.some(page=>page.some(b=>b.id==='left') && page.some(b=>b.id==='right')));
  assert.equal(flat.filter(b=>b.id==='practice').length,0);
  assert.deepEqual(flat.filter(b=>b.id!=='body'),blocks.slice(2));
  assert.deepEqual(blocks,before);
});

test('long legacy text paginates without headings and reconstructs exactly', () => {
  const original = ('학생이 적은 예시 '.repeat(35)+'\r\n\n').repeat(14);
  const pages=lessonReadingPages([{type:'text',id:'lesson',content:original}]);
  assert.ok(pages.length>1);
  assert.equal(pages.flat().map(b=>b.content).join(''),original);
});

test('an instruction stays with its following action across a spacer and size break', () => {
  for (const type of ['link','audio','image','prompt','prompt-generator','question','quiz']) {
    const blocks = [
      {id:'intro',type:'text',content:'가'.repeat(850)},
      {id:'step',type:'text',content:'아래 항목을 열어 실습하세요.'},
      {id:'space',type:'text',content:'edu-lesson:v1\n'+JSON.stringify({type:'doc',content:[{type:'paragraph',content:[]}]})},
      {id:'action',type},
    ];
    const pages = lessonReadingPages(blocks);
    assert.deepEqual(pages.map(page => page.map(b => b.id)), [['intro'],['step','space','action']]);
  }
});

test('a wrapped paragraph stays intact even when its size exceeds the reading budget', () => {
  const paragraph = '문장이 계속됩니다\n'.repeat(120);
  const pages = lessonReadingPages([{id:'body',type:'text',content:paragraph}]);
  assert.deepEqual(pages.map(page=>page[0].content), [paragraph]);
});

test('a rich-text heading belongs to the paragraph it introduces', () => {
  const node=(type,text)=>({type,content:[{type:'text',text}]});
  const prefix='edu-lesson:v1\n';
  const nodes=[node('paragraph','가'.repeat(950)),node('heading','실행 방법을 확인하고 다음 단계를 진행하세요.'.repeat(5)),node('paragraph','나'.repeat(1000))];
  const pages=lessonReadingPages([{id:'body',type:'text',content:prefix+JSON.stringify({type:'doc',content:nodes})}]);
  assert.deepEqual(pages.map(page=>JSON.parse(page[0].content.slice(prefix.length)).content.map(n=>n.type)),[['paragraph'],['heading','paragraph']]);
});

test('a step left empty after an edit folds into the previous page instead of showing blank', () => {
  const t = (id, content) => ({id,type:'text',content});
  const pages = [[t('a','하나')],[t('emptied','')],[{id:'img',type:'image',assetId:'x'}],[{id:'h',type:'heading',content:''}]];
  const out = withoutBlankPages(pages, ['1','2','3','4']);
  assert.deepEqual(out.map(p=>p.label), ['1','3']);
  assert.deepEqual(out.flatMap(p=>p.blocks.map(b=>b.id)), ['a','emptied','img','h']);
  assert.deepEqual(withoutBlankPages([[t('e','')],[t('b','둘')]], ['x','y']).map(p=>[p.label,p.blocks.map(b=>b.id)]), [['y',['e','b']]]);
});

test('a lesson without a matching step plan splits into big tasks at each heading, keeping every block', () => {
  const h = (id, text) => ({id,type:'heading',content:text}), t = id => ({id,type:'text',content:'본문 '+id});
  const blocks = [t('intro'),h('h1','1. 설치하기'),{id:'s',type:'subheading',content:'작은 제목'},t('a'),h('h2','2. 연결하기'),h('h2b','바로 이어진 제목'),t('b')];
  const out = lessonSections(blocks);
  assert.deepEqual(out.map(s=>s.label), [undefined,'1. 설치하기','2. 연결하기']);
  assert.deepEqual(out.flatMap(s=>s.blocks.map(b=>b.id)), blocks.map(b=>b.id));
  assert.deepEqual(lessonSections([h('only','하나')]).map(s=>s.blocks.length), [1]);
});

test('big titles inside rich text also start a task; small titles and embedded images stay inside', () => {
  const P = 'edu-lesson:v1\n', h = (level, text) => ({type:'heading',attrs:{level},content:[{type:'text',text}]}), para = text => ({type:'paragraph',content:[{type:'text',text}]});
  const body = {id:'body',type:'text',content:P+JSON.stringify({type:'doc',content:[para('들어가며'),h(2,'1. 폴더 이해하기'),h(3,'작은 제목'),para('설명'),{type:'lessonImage',attrs:{blockId:'img'}},h(2,'2. 봇 만들기'),para('실습')]})};
  const out = lessonSections([body,{id:'img',type:'image',assetId:'x'}]);
  assert.deepEqual(out.map(s=>s.label), [undefined,'1. 폴더 이해하기','2. 봇 만들기']);
  assert.equal(out.flatMap(s=>s.blocks).filter(b=>b.id==='img').length, 0);
  const texts = out.map(s=>s.blocks.map(b=>JSON.parse(b.content.slice(P.length)).content.map(n=>n.content?.[0]?.text||n.type).join('/')));
  assert.deepEqual(texts, [['들어가며'],['1. 폴더 이해하기/작은 제목/설명/lessonImage'],['2. 봇 만들기/실습']]);
});
