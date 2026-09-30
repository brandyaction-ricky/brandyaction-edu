import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {loadTs} from './helpers/question-ai.mjs';
const {lessonQuestionContext,loadQuestionAiContext,questionVisionImage,questionDraftInstructions,outsideBeginnerScope}=loadTs('lib/question-ai-context.ts');
const png=fs.readFileSync(new URL('../public/brandy-action-logo.png',import.meta.url));
const doc={schemaVersion:1,blocks:[{id:'h',type:'heading',content:'첫 단계'},{id:'text',type:'text',content:'수업 근거 자료'},{id:'q',type:'question',question:{label:'해 보세요',kind:'text',required:true}},{id:'prompt',type:'prompt-generator',content:'역할 예시 {{역할}}',fields:[{id:'role',label:'어떤 역할',placeholder:'안내자',variable:'역할',required:true,sensitive:false}]},{id:'quiz',type:'quiz',quiz:{questions:[{id:'one',prompt:'어느 것인가요',options:['가','나'],correctIndex:1}],passPercent:100}}],checklist:[{id:'done',label:'직접 실행',required:true}]};
function harness({document=doc,image=true,scope='course',published=true,broken=false,error=false}={}){
 const queries=[],downloads=[],rpc=[];
 const q={id:'q',title:'학습 질문',content:'이 부분이 궁금해요',lesson_id:'lesson',course_id:'course',image_id:image?'image':null};
 const tables={curriculum_lessons:{id:'lesson',title:'수업 제목',description:'설명',week_id:'week',is_published:published,archived_at:null},curriculum_weeks:{id:'week',course_id:scope,is_published:true,archived_at:null},edu_lesson_block_heads:document?{revision:'revision'}:null,edu_lesson_block_versions:{id:'revision',document},lesson_contents:{body_text:'기존 수업 본문'}};
 const file={id:'image',name:'photo.png',size:png.length,path:'private/photo.png',sha256:broken?'b'.repeat(64):createHash('sha256').update(png).digest('hex'),ready_at:'2026-09-01'};
 const db={from(table){queries.push(table);const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:tables[table],error:error?{message:'private DB failure'}:null})};return query;},rpc:async(name,args)=>{rpc.push({name,args});return{data:file,error:null};},storage:{from(bucket){assert.equal(bucket,'question-images');return{download:async path=>{downloads.push(path);return{data:new Blob([png]),error:null};}};}}};
 return{db,q,queries,downloads,rpc};
}
test('context keeps ordered headings, prompt questions/examples and activity labels but never quiz answer keys or learner answers',()=>{
 const r=lessonQuestionContext({title:'학습',document:doc});assert.ok(r.text.indexOf('첫 단계')<r.text.indexOf('수업 근거'));for(const v of ['해 보세요','어떤 역할','안내자','어느 것인가요','직접 실행'])assert.match(r.text,new RegExp(v));assert.doesNotMatch(r.text,/correctIndex|passPercent/);assert.equal(r.truncated,false);
 const long=lessonQuestionContext({title:'긴 수업',body:'긴 내용'.repeat(5000)});assert.equal(long.text.length,12000);assert.equal(long.truncated,true);
 const rich=lessonQuestionContext({title:'서식',body:'edu-lesson:v1\n'+JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'서식 있는 본문'}]}]})});assert.match(rich.text,/서식 있는 본문/);assert.doesNotMatch(rich.text,/edu-lesson/);
 assert.match(questionDraftInstructions(true),/신뢰할 수 없는/);assert.match(questionDraftInstructions(true),/수업의 범위/);assert.ok(outsideBeginnerScope.test('터미널에서 실행'));assert.ok(!outsideBeginnerScope.test('채팅창의 첨부 버튼을 눌러 주세요.'));
});
test('server context loads only the question lesson and verified private image, excluding unrelated tables and paths',async()=>{
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';try{const h=harness(),r=await loadQuestionAiContext(h.db,'operator',h.q);assert.equal(r.reference.revision,'revision');assert.equal(r.reference.imageIncluded,true);assert.match(r.image,/^data:image\/jpeg;base64,/);assert.match(r.context,/수업 근거/);assert.deepEqual(h.rpc,[{name:'edu_read_question_image',args:{p_actor:'operator',p_question:'q'}}]);assert.deepEqual(h.downloads,['private/photo.png']);assert.ok(!h.queries.includes('edu_lesson_block_drafts'));assert.ok(!h.queries.includes('profiles'));assert.ok(!h.queries.includes('lesson_contents'));}finally{delete process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED;}
});
test('legacy fallback matches the learner renderer and no linked lesson uses only the question',async()=>{
 const h=harness({image:false});let r=await loadQuestionAiContext(h.db,'operator',h.q);assert.match(r.context,/기존 수업 본문/);assert.ok(!h.queries.includes('edu_lesson_block_heads'));assert.equal(r.reference.contextMissing,false);
 const general=harness({image:false});r=await loadQuestionAiContext(general.db,'operator',{...general.q,lesson_id:null});assert.equal(r.context,'');assert.equal(r.reference.contextMissing,true);assert.equal(general.queries.length,0);
});
test('missing/mismatched/unpublished context and altered image bytes stop generation instead of silently omitting evidence',async()=>{
 for(const config of [{scope:'different-course'},{published:false},{error:true},{broken:true}]){const h=harness(config);await assert.rejects(()=>loadQuestionAiContext(h.db,'operator',h.q));}
});
test('actual decoding bounds image size, removes metadata and converts the first GIF frame without keeping the original private object path',async()=>{
 const large=await sharp({create:{width:3000,height:1500,channels:3,background:'#fff'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'private metadata'}}}).toBuffer();
 const result=await questionVisionImage(large),out=Buffer.from(result.url.split(',')[1],'base64'),meta=await sharp(out).metadata();assert.equal(meta.width,2048);assert.equal(meta.height,1024);assert.equal(meta.exif,undefined);assert.equal(meta.format,'jpeg');
 const gif=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).gif().toBuffer();assert.match((await questionVisionImage(gif)).url,/^data:image\/jpeg/);await assert.rejects(()=>questionVisionImage(Buffer.from('<svg/>')));
});
