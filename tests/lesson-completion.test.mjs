import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../lib/lesson-completion.ts',import.meta.url),'utf8');
const {legacyLessonUnlocked:open}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(source,{loader:'ts',format:'esm'}).code).toString('base64'));
test('lesson identity retains earned access across insertion, rename and reorder without completing new content',()=>{
 const done=new Set(['finished']);
 const lessons=[{id:'new-early'},{id:'finished'},{id:'next'},{id:'later'}];
 assert.deepEqual(lessons.map(l=>open(lessons,done,l.id)),[true,true,true,false]);
 assert.deepEqual([...done],['finished']);
 assert.equal(open(lessons,done,'missing'),false);
 assert.equal(open([],done,'finished'),false);
 assert.deepEqual(lessons.map(l=>open(lessons,new Set(),l.id)),[true,false,false,false]);
 assert.deepEqual(lessons.map(l=>open(lessons,new Set(['archived-id']),l.id)),[true,false,false,false]);
 assert.equal(open([...lessons].reverse(),done,'finished'),true);
});
test('classroom opens preserved visible lesson without marking inserted lesson complete',()=>{
 const lessons=['A','new','B','C'].map(id=>({id}));
 const done=new Set(['A']), preserved=new Set(['B','hidden']);
 assert.deepEqual(lessons.map(l=>open(lessons,done,l.id,preserved)),[true,true,true,false]);
 assert.equal(open(lessons,done,'hidden',preserved),false);
 assert.deepEqual([...done],['A']);
});
