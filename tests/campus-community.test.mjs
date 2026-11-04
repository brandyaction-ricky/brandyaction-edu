import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
async function load(path){const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {validateCommunityCommand,safeCommunityUrl,calculateCommunityRewards}=await load('../features/campus/community/domain.ts');
const {handleCommunity}=await load('../features/campus/community/handler.ts');
const {createCommunityDemo,mutateCommunityDemo,demoPeerId}=await load('../features/campus/community/demo.ts');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const snapshot={viewer:{id:uid(1),displayName:'PRIVATE REAL NAME'},selectedEnrollmentId:uid(2),scopes:[{enrollmentId:uid(2),courseId:uid(3),cohortId:uid(4),courseTitle:'문샷',cohortName:'3기'}],lessons:[{id:uid(5),day:1,title:'첫 제안',version:'v1',missions:[{id:uid(6),required:true,status:'approved'}]}]};
const make=(n,extra={})=>({requestId:uid(n),enrollmentId:uid(2),action:'create',kind:'portfolio',title:'첫 결과물',body:'첫 결과물의 대상과 결과를 정리했습니다.',alias:'문샷 동료',url:'https://example.com',imageUrls:[],lessonId:uid(5),visibility:'private',...extra});
for(const bad of ['http://example.com','javascript:alert(1)','data:text/html,x','https://localhost/x','https://127.0.0.1','https://[::1]/','https://user:password@example.com','https://example.com:8080','https://x.internal','https://example.com\\@evil.example','https://example.com/\n'])test(`reject unsafe community URL ${JSON.stringify(bad)}`,()=>assert.throws(()=>safeCommunityUrl(bad),{status:400}));
test('normalizes allowed commands, strips forged ownership/points and caps fields',()=>{
 const actual=validateCommunityCommand({...make(100),owner_id:uid(22),xp:100000,hidden:false});
 assert.equal(actual.url,'https://example.com/'); assert.equal(actual.owner_id,undefined);assert.equal(actual.xp,undefined);
 for(const invalid of [null,[],{},make(101,{expectedRevision:undefined,action:'revise',postId:uid(100)}),make(102,{title:'x'}),make(103,{imageUrls:Array(5).fill('https://example.com/a.png')}),make(104,{kind:'admin'}),make(105,{visibility:'public'}),make(106,{lessonId:'invalid'}),make(107,{action:'delete'})])assert.throws(()=>validateCommunityCommand(invalid),{status:400});
});
test('reward formula denies empty curriculum, does not take duration or count launches as current eligibility',()=>{
 assert.equal(calculateCommunityRewards(0,0,10,1).eligible,false);
 assert.equal(calculateCommunityRewards(1,2,1,1).eligible,false);
 const r=calculateCommunityRewards(2,2,1,1);assert.equal(r.eligible,true);assert.equal(r.xp,220);assert.equal(r.level,2);assert.equal(r.badges.length,4);
 const revoked=calculateCommunityRewards(1,2,1,1,'2026-11-01',1);assert.equal(revoked.eligible,false);assert.ok(revoked.claimedAt);
});
test('memory demo runs same validation, private default, immutable revisions and recipient/CAS guards',()=>{
 let state=createCommunityDemo(snapshot);const receipts=new Map();
 state=mutateCommunityDemo(state,make(100),snapshot,undefined,receipts);assert.equal(state.posts[0].visibility,'private');assert.equal(state.revisions[0].revision,1);
 assert.ok(!JSON.stringify(state).includes('PRIVATE REAL NAME'));
 assert.strictEqual(mutateCommunityDemo(state,make(100),snapshot,undefined,receipts),state);
 assert.throws(()=>mutateCommunityDemo(state,make(100,{title:'다른 요청'}),snapshot,undefined,receipts),{status:409});
 state=mutateCommunityDemo(state,make(101,{action:'revise',postId:uid(100),expectedRevision:1,changeNote:'제안을 더 구체적으로 바꿨습니다.',visibility:'cohort'}),snapshot);
 assert.equal(state.revisions.filter(v=>v.post_id===uid(100)).length,2);
 const comment={requestId:uid(200),enrollmentId:uid(2),action:'comment',postId:uid(100),expectedRevision:2,alias:'예시 동료',body:'첫 화면에서 고객 대상이 더 잘 드러나면 좋겠습니다.'};
 state=mutateCommunityDemo(state,comment,snapshot,demoPeerId);
 const ack={requestId:uid(300),enrollmentId:uid(2),action:'acknowledge',postId:uid(100),commentId:uid(200),expectedRevision:0,useful:true,decision:'keep',reason:'지금은 초보자 대상의 표현을 유지하겠습니다.'};
 assert.throws(()=>mutateCommunityDemo(state,ack,snapshot,demoPeerId),{status:403});state=mutateCommunityDemo(state,ack,snapshot);
 assert.equal(state.acknowledgments[0].decision,'keep');assert.equal(state.rewards.usefulFeedback,0);
 assert.throws(()=>mutateCommunityDemo(state,{...ack,requestId:uid(301)},snapshot),{status:409});
});
const req=(method='GET',init={})=>new Request(`https://edu.test/api/campus/community?enrollmentId=${uid(2)}`,{method,...init});
const deps={enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({posts:[]}),save:async(_v,c)=>({id:c.requestId})};
test('API flags/auth/origin/method/body bounds and no-store; no secrets in errors',async()=>{
 assert.equal((await handleCommunity(req(),{...deps,enabled:false})).status,404);
 assert.equal((await handleCommunity(req(),{...deps,authenticate:async()=>null})).status,401);
 assert.equal((await handleCommunity(req('GET',{headers:{origin:'https://evil.test'}}),deps)).status,403);
 assert.equal((await handleCommunity(req('POST',{body:'{}'}),deps)).status,403);
 assert.equal((await handleCommunity(req('DELETE'),deps)).status,405);
 for(const body of ['null','[]','{}','bad','x'.repeat(24001)])assert.equal((await handleCommunity(req('POST',{headers:{origin:'https://edu.test','content-type':'application/json'},body}),deps)).status,400);
 const okay=await handleCommunity(req('POST',{headers:{origin:'https://edu.test','content-type':'application/json'},body:JSON.stringify(make(100))}),deps);assert.equal(okay.status,200);assert.equal(okay.headers.get('cache-control'),'private, no-store');
 const failed=await handleCommunity(req(),{...deps,load:async()=>{throw new Error('PRIVATE SECRET');}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('SECRET'));
});
test('community enforces streamed byte limits and rejects malformed UTF-8 before parsing',async()=>{
 let pulls=0,canceled=false;
 const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(24000));if(pulls===100)controller.close();},cancel(){canceled=true;}});
 const headers={origin:'https://edu.test','content-type':'application/json'};
 assert.equal((await handleCommunity(req('POST',{headers,body,duplex:'half'}),deps)).status,400);
 assert.equal(canceled,true);assert.ok(pulls<5);
 assert.equal((await handleCommunity(req('POST',{headers,body:new Uint8Array([0xc0,0xaf])}),deps)).status,400);
 assert.equal((await handleCommunity(req('POST',{headers,body:JSON.stringify(make(111,{body:'가'.repeat(9000)}))}),deps)).status,400);
});

const {loadCommunityExhibition,handleCommunityExhibition}=await load('../features/campus/community/exhibition.ts');
const {requestCommunityOpen,consumeCommunityOpen,getCommunityDemoState,getCommunityDemoExhibition,rememberCommunityDemoState}=await load('../features/campus/community/events.ts');
test('space exhibition is current cohort sharing only, report-held records fail closed and output excludes URLs/content',async()=>{
 const row=(n,extra={})=>({id:uid(n),cohort_id:uid(4),kind:'portfolio',visibility:'cohort',hidden:false,title:'검토한 결과물',alias:'동료 별명',revision:1,updated_at:'2026-11-03T00:00:00Z',body:'PRIVATE BODY',url:'https://private.example',image_urls:['https://private.example/image'],...extra});
 const rows=[row(100),row(101,{visibility:'private'}),row(102,{hidden:true}),row(103,{kind:'talent_offer'}),row(104,{cohort_id:uid(99)}),row(105),row(106)];let reads=0,heldReads=0;
 const ports={scope:async(actor,eid)=>{assert.equal(actor,uid(1));assert.equal(eid,uid(2));return uid(4);},authorizedPosts:async(cohort,ids)=>{assert.equal(cohort,uid(4));reads++;return ids?rows.filter(r=>ids.includes(r.id)&&r.id!==uid(106)):rows;},reportedPostIds:async ids=>{heldReads++;assert.ok(!ids.includes(uid(101))&&!ids.includes(uid(104)));return[uid(105)];}};
 const result=await loadCommunityExhibition(ports,uid(1),uid(2));assert.deepEqual(result.items,[{id:uid(100),title:'검토한 결과물',alias:'동료 별명',revision:1,updatedAt:'2026-11-03T00:00:00Z'}]);assert.equal(reads,2);assert.equal(heldReads,2);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('https'));
 await assert.rejects(loadCommunityExhibition({...ports,reportedPostIds:async()=>{throw Error('unavailable');}},uid(1),uid(2)));
 await assert.rejects(loadCommunityExhibition({...ports,scope:async()=>{throw Object.assign(Error('revoked'),{status:403});}},uid(1),uid(2)),{status:403});
 const many=Array.from({length:12},(_,i)=>row(200+i));assert.equal((await loadCommunityExhibition({...ports,authorizedPosts:async()=>many,reportedPostIds:async()=>[]},uid(1),uid(2))).items.length,6);
});
test('exhibition HTTP is authenticated, feature-gated, same-origin and no-store; no database errors leak',async()=>{
 const req=(params={},headers={},method='GET')=>new Request('https://edu.test/api/campus/community/exhibition?'+new URLSearchParams({enrollmentId:uid(2),...params}),{method,headers});
 const deps={enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({items:[]})};
 const result=await handleCommunityExhibition(req(),deps);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.equal((await handleCommunityExhibition(req(),{...deps,enabled:false})).status,404);
 assert.equal((await handleCommunityExhibition(req(),{...deps,authenticate:async()=>null})).status,401);
 assert.equal((await handleCommunityExhibition(req({}, {origin:'https://evil.example'}),deps)).status,403);
 assert.equal((await handleCommunityExhibition(req({enrollmentId:'bad'}),deps)).status,400);
 assert.equal((await handleCommunityExhibition(req({}, {}, 'POST'),deps)).status,405);
 const failed=await handleCommunityExhibition(req(),{...deps,load:async()=>{throw Error('PRIVATE DATABASE DETAIL');}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('PRIVATE'));
});
test('space exhibition navigation survives delayed panel mount and consumes only the matching enrollment once',()=>{
 requestCommunityOpen({enrollmentId:uid(2),tab:'all',postId:uid(100)});
 assert.equal(consumeCommunityOpen(uid(99)),null);
 assert.deepEqual(consumeCommunityOpen(uid(2)),{enrollmentId:uid(2),tab:'all',postId:uid(100)});
 assert.equal(consumeCommunityOpen(uid(2)),null);
 const state=createCommunityDemo(snapshot);state.posts=[{id:uid(100),owner_id:uid(1),kind:'portfolio',visibility:'cohort',hidden:false,title:'공개 체험',alias:'동료',revision:1,updated_at:'2026-11-03'},{id:uid(101),owner_id:uid(1),kind:'portfolio',visibility:'private',hidden:false,title:'비공개 체험'}];state.reports=[];state.blockedIds=[];
 rememberCommunityDemoState(uid(2),uid(1),state);assert.equal(getCommunityDemoState(uid(2),uid(9)),null);assert.equal(getCommunityDemoState(uid(2),uid(1)),state);assert.deepEqual(getCommunityDemoExhibition(uid(2)).map(p=>p.id),[uid(100)]);
 state.reports=[{post_id:uid(100),status:'open'}];rememberCommunityDemoState(uid(2),uid(1),state);assert.deepEqual(getCommunityDemoExhibition(uid(2)),[]);
});
