import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as id} from 'node:crypto';
import {loadTs} from './helpers/question-ai.mjs';
const {validateLessonBlocks,lessonBlockTypes}=loadTs('lib/lesson-blocks.ts');
const {newGuidedBlock}=loadTs('lib/lesson-guided-tools.ts'),{newCalculatorBlock}=loadTs('lib/lesson-calculators.ts');
import {setup,migration} from './helpers/interactive-curriculum-copy.mjs';
const basic={schemaVersion:1,blocks:[],checklist:[],completion:{mode:'self',requireAnswers:false,requireQuizPass:false}};
const definition=()=>({schemaVersion:1,blocks:[{id:'h',type:'heading',content:'원문 제목\n두 번째 줄'},{id:'text',type:'text',content:'본문 [링크](https://example.test)'},{id:'p',type:'prompt',content:'원본 프롬프트'},{id:'q',type:'question',question:{label:'원본 질문',kind:'text',required:true}},{id:'generator',type:'prompt-generator',content:'{name}의 목표',fields:[{id:'name',variable:'name',label:'이름',placeholder:'예시',sensitive:false,required:true}]},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'one',prompt:'정확한 시험 문항',options:['1','2'],correctIndex:1}]}},{id:'link',type:'link',content:'자료 링크',url:'https://example.test/resource'}],checklist:[{id:'check',label:'확인할 일',required:true}],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true},progression:{track:'daily',dayNumber:1}});
const count=async(f,table)=>(await f.db.query(`select count(*)::int n from ${table}`)).rows[0].n;

test('copies current ordered interactive definitions, media and repeat schedules privately without copying learner history',async t=>{
 const f=await setup(t),picture=await f.asset(),audio=await f.asset('audio'),video=await f.asset('video');const doc=definition();doc.blocks.push(...[picture,audio,video,picture].map((assetId,i)=>({id:'media'+i,type:['image','audio','video','image'][i],assetId,alt:'자료 '+i})));
 doc.blocks.push({id:'sub',type:'subheading',content:'소제목'},{id:'divider',type:'divider'},...['persona-generator','landing-planner'].map(type=>newGuidedBlock(type,type)),...['recipe-calculator','margin-calculator','marketing-funnel'].map(type=>newCalculatorBlock(type,type)));
 assert.deepEqual([...new Set(doc.blocks.map(b=>b.type))].sort(),[...lessonBlockTypes].sort());assert.deepEqual(validateLessonBlocks(doc),doc);const revision=await f.save(f.lessonId,doc);const learning={...basic,blocks:[doc.blocks[5]],completion:{mode:'self',requireAnswers:false,requireQuizPass:true},progression:{track:'learning',dayNumber:1}};await f.lesson('별도 학습',learning,3);
 const ongoing={...basic,blocks:[{id:'repeat',type:'question',question:{kind:'text',label:'이번 기간 실행',required:true}}]};const ongoingId=await f.lesson('반복 실천',ongoing,4);await f.rpc('edu_configure_ongoing',[f.admin,ongoingId,'weekly',id()]);
 // Authored configuration only: the source learner's private draft is not a template.
 await f.rpc('edu_save_block_draft',[f.student,f.lessonId,f.enrollment,revision,null,id(),{blocks:{q:'PRIVATE LEARNER ANSWER'},checklist:[]}]);
 const before=await f.rpc('edu_curriculum_copy_snapshot',[f.course]),oldCounts=await Promise.all(['edu_lesson_block_drafts','edu_lesson_block_submissions','lesson_progress','edu_ongoing_rounds'].map(name=>count(f,name)));
 const p=await f.preview();assert.equal(p.interactiveLessons,3);assert.equal(p.privateMedia,3);assert.equal(p.ongoingLessons,1);assert.doesNotMatch(JSON.stringify(p),/정확한 시험|correctIndex|PRIVATE|\.png|assetId/);
 const to=await f.target(),request=id(),result=await f.copy({to,request,revision:p.revision});assert.equal(result.interactiveLessons,3);assert.deepEqual(await f.copy({to,request,revision:p.revision}),result);
 const copied=await f.docs(to);assert.equal(copied.length,3);for(const row of copied){assert.equal(row.is_published,false);assert.equal(row.is_preview,false);assert.equal(row.week_public,false);}
 const d=copied.find(x=>x.document.progression?.track==='daily');assert.notEqual(d.revision,revision);assert.notEqual(d.id,f.lessonId);
 const aliases=(await f.db.query('select * from edu_lesson_media where course_id=$1',[to])).rows;assert.equal(aliases.length,3);const mapping=Object.fromEntries(aliases.map(a=>[a.source_asset_id,a.id]));const expected=structuredClone(doc);for(const b of expected.blocks)if(b.assetId)b.assetId=mapping[b.assetId];assert.deepEqual(d.document,expected);
 assert.deepEqual(copied.find(x=>x.title==='별도 학습').document,learning);assert.deepEqual(copied.find(x=>x.cadence==='weekly').document,ongoing);
 for(const a of aliases){const original=(await f.db.query('select * from edu_lesson_media where id=$1',[a.source_asset_id])).rows[0];assert.equal(a.path,original.path);assert.equal(a.sha256,original.sha256);assert.notEqual(a.id,original.id);assert.equal(a.course_id,to);}
 assert.deepEqual(await Promise.all(['edu_lesson_block_drafts','edu_lesson_block_submissions','lesson_progress','edu_ongoing_rounds'].map(name=>count(f,name))),oldCounts);
 assert.deepEqual(await f.rpc('edu_curriculum_copy_snapshot',[f.course]),before);
 await f.save(d.id,{...expected,blocks:[{id:'new',type:'text',content:'복사본만 편집'}]});assert.deepEqual(await f.rpc('edu_curriculum_copy_snapshot',[f.course]),before);
 assert.equal((await f.db.query('select metadata from courses where id=$1',[to])).rows[0].metadata.ownSetting,true);assert.equal(await count(f,'audit_logs'),1);
});

test('preview revision includes block edits and ongoing settings; old or archived content and unreferenced assets are excluded',async t=>{
 const f=await setup(t),to=await f.target(),p=await f.preview();await f.asset();assert.equal((await f.preview()).revision,p.revision);
 await f.save(f.lessonId,{...basic,blocks:[{id:'now',type:'text',content:'새 본문'}]});await assert.rejects(f.copy({to,revision:p.revision}),/COPY_SOURCE_CHANGED/);
 const active=await f.preview(),archive=await f.lesson('보관 수업',{...basic,blocks:[{id:'private',type:'text',content:'HISTORICAL'}]});await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[archive]);assert.equal((await f.preview()).revision,active.revision);
 const recurring=await f.lesson('반복',basic);const before=await f.preview();await f.rpc('edu_configure_ongoing',[f.admin,recurring,'monthly',id()]);await assert.rejects(f.copy({to,revision:before.revision}),/COPY_SOURCE_CHANGED/);
 await f.copy({to});const copied=await f.docs(to);assert.equal(copied.length,2);assert.doesNotMatch(JSON.stringify(copied),/HISTORICAL|필수 질문/);assert.equal((await f.db.query('select count(*)::int n from edu_lesson_block_versions v join curriculum_lessons l on l.id=v.lesson_id join curriculum_weeks w on w.id=l.week_id where w.course_id=$1',[to])).rows[0].n,2);
});

test('late copy failure rolls back files, blocks, repeat rules, receipt and audit as one transaction',async t=>{
 const f=await setup(t),a=await f.asset(),doc={...basic,blocks:[{id:'image',type:'image',assetId:a}]};await f.save(f.lessonId,doc);await f.rpc('edu_configure_ongoing',[f.admin,f.lessonId,'daily',id()]);
 await f.db.query("update courses set metadata='{\"product_resources\":[{\"name\":\"bad\",\"path\":\"../bad\",\"scope\":\"public\"}]}' where id=$1",[f.course]);const to=await f.target(),request=id();const tables=['curriculum_weeks','curriculum_lessons','edu_lesson_media','edu_lesson_block_versions','edu_lesson_block_heads','edu_ongoing_rules','edu_mutation_receipts','audit_logs'];const before=await Promise.all(tables.map(name=>count(f,name)));
 await assert.rejects(f.copy({to,request}),/COPY_RESOURCE_INVALID/);assert.deepEqual(await Promise.all(tables.map(name=>count(f,name))),before);assert.equal((await f.docs(to)).length,0);
});

test('copied media requires the new lesson enrollment and retains immutable same-course safeguards even after source archival',async t=>{
 const f=await setup(t),a=await f.asset();await f.save(f.lessonId,{...basic,blocks:[{id:'photo',type:'image',assetId:a}]});const to=await f.target();await f.copy({to});const target=(await f.docs(to))[0],assetId=target.document.blocks[0].assetId;
 const read=(actor,asset,lesson,enrollment)=>f.rpc('edu_read_lesson_media',[actor,asset,lesson,enrollment,null,null]);
 await assert.rejects(read(f.student,assetId,target.id,f.enrollment),/BLOCK_FORBIDDEN/);await assert.rejects(read(f.student,assetId,null,null),/BLOCK_FORBIDDEN/);
 const enrollment=id();await f.db.query("insert into enrollments(id,user_id,course_id,status,access_starts_at) values($1,$2,$3,'active',now()-interval '1 day')",[enrollment,f.student,to]);
 await assert.rejects(read(f.student,assetId,target.id,enrollment),/BLOCK_FORBIDDEN/);await f.db.query('update curriculum_weeks set is_published=true where course_id=$1',[to]);await f.db.query('update curriculum_lessons set is_published=true where id=$1',[target.id]);
 await assert.rejects(read(f.student,a,target.id,enrollment),/BLOCK_FORBIDDEN/);assert.equal((await read(f.student,assetId,target.id,enrollment)).id,assetId);
 await f.db.query('update courses set archived_at=now() where id=$1',[f.course]);assert.equal((await read(f.student,assetId,target.id,enrollment)).id,assetId);
 await assert.rejects(f.save(target.id,{...basic,blocks:[{id:'photo',type:'image',assetId:a}]}),/BLOCK_MEDIA_INVALID/);
 await assert.rejects(f.db.query("update edu_lesson_media set path='bad' where id=$1",[assetId]),/permission denied/);await assert.rejects(f.db.query("update edu_lesson_media set sha256=$1 where id=$2",['b'.repeat(64),assetId]),/COPY_MEDIA_INVALID/);
 await f.db.query('update enrollments set revoked_at=now() where id=$1',[enrollment]);await assert.rejects(read(f.student,assetId,target.id,enrollment),/BLOCK_FORBIDDEN/);
});

test('source media missing or outside its course prevents a partial copy; direct client roles cannot bypass copying permissions',async t=>{
 const f=await setup(t),to=await f.target(),bad=id();
 await f.owner('alter table edu_lesson_block_versions disable trigger edu_lesson_media_refs');await f.save(f.lessonId,{...basic,blocks:[{id:'bad',type:'image',assetId:bad}]});await f.owner('alter table edu_lesson_block_versions enable trigger edu_lesson_media_refs');
 await assert.rejects(f.copy({to}),/COPY_MEDIA_INVALID/);assert.equal((await f.docs(to)).length,0);
 await assert.rejects(f.copy({to,actor:f.student}),/COPY_FORBIDDEN/);
 for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.rpc('edu_curriculum_copy_snapshot',[f.course]),/permission denied/);await assert.rejects(f.rpc('edu_preview_curriculum_copy',[f.admin,f.course]),/permission denied/);await assert.rejects(f.db.query('select * from edu_lesson_media'),/permission denied/);}
});

test('migration preserves existing media and old receipts while subsequent copies use independent rich revisions',async t=>{
 const f=await setup(t,{upgrade:false}),a=await f.asset();await f.save(f.lessonId,{...basic,blocks:[{id:'image',type:'image',assetId:a}]});const to=await f.target(),request=id(),revision=(await f.preview()).revision,prior=await f.copy({to,request,revision});const media=(await f.db.query('select * from edu_lesson_media where id=$1',[a])).rows[0];
 await f.owner(migration);assert.deepEqual(await f.copy({to,request,revision}),prior);const nextMedia=(await f.db.query('select * from edu_lesson_media where id=$1',[a])).rows[0];assert.equal(nextMedia.source_asset_id,null);delete nextMedia.source_asset_id;assert.deepEqual(nextMedia,media);
 const richTarget=await f.target();await f.copy({to:richTarget});const third=await f.target();await f.copy({to:third,source:richTarget});const thirdDoc=(await f.docs(third))[0];assert.ok(thirdDoc.document.blocks[0].assetId);assert.notEqual(thirdDoc.document.blocks[0].assetId,a);
});


test('copied media references do not exhaust the hourly byte allowance for new uploads',async t=>{
 const f=await setup(t),asset=id();const spec={name:'큰영상.mp4',size:52428800,kind:'video',extension:'mp4',contentType:'video/mp4'};
 await f.rpc('edu_prepare_lesson_media',[f.admin,f.course,asset,spec]);await f.rpc('edu_complete_lesson_media',[f.admin,asset,'a'.repeat(64)]);await f.save(f.lessonId,{...basic,blocks:[{id:'video',type:'video',assetId:asset}]});
 for(let n=0;n<21;n++)await f.copy({to:await f.target()});
 assert.ok((await f.db.query('select sum(size)::bigint as n from edu_lesson_media where owner_id=$1',[f.admin])).rows[0].n>1073741824);
 await f.rpc('edu_prepare_lesson_media',[f.admin,f.course,id(),spec]);
});


test('legacy-only courses still copy body, mission forms, quizzes and shared resources without invented rich content',async t=>{
 const f=await setup(t);await f.db.query('delete from edu_lesson_block_heads where lesson_id=$1',[f.lessonId]).catch(async()=>{await f.owner('delete from edu_lesson_block_heads where lesson_id=$1',[f.lessonId]);});
 const mission=id(),quizRevision=id(),questions=[{id:'one',question:'문제',options:['가','나'],answer:1}],form={fields:[{id:'goal',type:'text',label:'목표'}]};
 await f.db.query("insert into lesson_contents(lesson_id,body_text,vod_url,resource_name,resource_storage_path,external_url) values($1,'옛 본문','https://example.test/video','자료','edu/doc.pdf','https://example.test/link')",[f.lessonId]);
 await f.db.query("insert into curriculum_missions(id,lesson_id,title,instructions,submission_type,form_schema,is_published) values($1,$2,'미션','설명','quiz',$3,true)",[mission,f.lessonId,form]);await f.db.query('insert into mission_quizzes(mission_id,revision,questions,pass_percent) values($1,$2,$3,80)',[mission,quizRevision,JSON.stringify(questions)]);
 await f.db.query('update courses set metadata=$1 where id=$2',[{product_resources:[{id:id(),name:'공통 자료',path:'edu/document.pdf',scope:'purchaser'}]},f.course]);
 const to=await f.target(),result=await f.copy({to});assert.equal(result.interactiveLessons,0);assert.equal(result.missions,1);assert.equal(result.quizzes,1);assert.equal(result.resources,1);
 const row=(await f.db.query('select c.body_text,c.vod_url,c.resource_name,c.resource_storage_path,c.external_url,m.id,m.form_schema,m.is_published,q.questions,q.revision from curriculum_weeks w join curriculum_lessons l on l.week_id=w.id join lesson_contents c on c.lesson_id=l.id join curriculum_missions m on m.lesson_id=l.id join mission_quizzes q on q.mission_id=m.id where w.course_id=$1',[to])).rows[0];
 assert.equal(row.body_text,'옛 본문');assert.equal(row.vod_url,'https://example.test/video');assert.equal(row.resource_storage_path,'edu/doc.pdf');assert.equal(row.external_url,'https://example.test/link');assert.equal(row.is_published,false);assert.deepEqual(row.form_schema,form);assert.deepEqual(row.questions,questions);assert.notEqual(row.id,mission);assert.notEqual(row.revision,quizRevision);assert.equal((await f.docs(to))[0].document,null);
 await assert.rejects(f.copy({to}),/COPY_TARGET_NOT_EMPTY/);
});
