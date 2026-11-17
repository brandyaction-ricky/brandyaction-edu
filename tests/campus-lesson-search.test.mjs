import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=await build({entryPoints:[root+'features/campus/lesson-search.ts'],bundle:true,platform:'node',format:'esm',write:false,alias:{'@':root.replace(/\/$/,'')}});
const {searchLessons,lessonSearchText}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('lesson search finds words in the body, ranks title hits first and shows where the word appears',()=>{
 const lessons=[{id:'a',title:'옵시디언 설치',day:2,text:'먼저 프로그램을 내려받습니다.'},{id:'b',title:'메타 광고 정본',day:5,text:'광고 소재를 세 가지로 나눕니다.'},{id:'c',title:'랜딩 페이지',day:9,text:'앞 내용이 길게 이어지는 문단입니다. 이 수업에서는 광고에서 넘어온 사람이 처음 보는 화면을 다룹니다.'}];
 const hits=searchLessons(lessons,'광고');
 assert.deepEqual(hits.map(h=>h.lessonId),['b','c']);
 assert.match(hits[1].excerpt,/광고에서 넘어온/);
 assert.deepEqual(searchLessons(lessons,'가'),[]);
 assert.deepEqual(searchLessons(lessons,'없는낱말'),[]);
});
test('lesson text falls back to the old body when there is no block document',()=>{
 assert.equal(lessonSearchText(undefined,'예전 본문'),'예전 본문');
 assert.match(lessonSearchText({schemaVersion:1,blocks:[{id:'b1',type:'text',content:'블록 본문'}],checklist:[{id:'c1',label:'확인 항목',required:true}]}),/블록 본문\n확인 항목/);
});
