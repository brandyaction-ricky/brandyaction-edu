import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['lib/lesson-reading-pages.ts'], bundle:true, platform:'node', format:'esm', write:false });
const { lessonReadingPages } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

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
