import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const {validateResources,youtubeVideoId}=await load('features/campus/webinar/resources.ts'),{projectWebinar,validateWebinar}=await load('features/campus/webinar/domain.ts'),{config}=await load('tests/webinar-fixture/data.ts');
const resource={id:'guide',kind:'file',title:'무료 안내',description:'실습 자료',url:'https://files.example.test/guide.pdf',published:true};
test('library accepts bounded public links and rejects unsafe or malformed resources',()=>{
 assert.deepEqual(validateResources(undefined),[]);assert.equal(validateResources([resource])[0].title,'무료 안내');
 for(const patch of [{url:'javascript:alert(1)'},{url:'http://files.example.test/a'},{url:'https://files.example.test/'+ '가'.repeat(500)},{url:'https://user:pass@example.test/a'},{url:'https://127.0.0.1/a'},{url:'https://localhost/a'},{url:'https://[::1]/a'},{title:''},{published:'yes'},{kind:'html'},{secret:'x'}])assert.throws(()=>validateResources([{...resource,...patch}]));
 assert.throws(()=>validateResources([resource,resource]));assert.throws(()=>validateResources(Array.from({length:13},(_,i)=>({...resource,id:String(i)}))));
 assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk'),'abcdefghijk');assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk'),'abcdefghijk');
 assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk'),null);assert.throws(()=>validateResources([{...resource,kind:'youtube'}]));
});
test('anonymous event projection never includes hidden library titles or URLs',()=>{
 const w=validateWebinar({...config,resources:[resource,{...resource,id:'hidden',published:false,url:'https://files.example.test/private.pdf',title:'비공개 문서'}]});
 const pub=projectWebinar(w);assert.equal(pub.resources.length,1);assert(!JSON.stringify(pub).includes('private.pdf'));assert(!JSON.stringify(pub).includes('비공개'));assert.equal(w.resources.length,2);
});

test('a full library of long Korean titles and descriptions stays within the bounded request size',()=>{
 const entries=Array.from({length:12},(_,i)=>({...resource,id:String(i),title:'가'.repeat(80),description:'나'.repeat(240),url:'https://files.example.test/'+ 'a'.repeat(1150)}));
 const event=validateWebinar({...config,resources:entries});const size=Buffer.byteLength(JSON.stringify({event,expectedRevision:event.revision}));assert(size>24000);assert(size<40000);
});
