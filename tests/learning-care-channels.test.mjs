import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path,mocks={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(exports,n=>n in mocks?mocks[n]:require(n),{env});return exports;}
const logic=load('lib/learning-care-channels.ts'),config={enabled:true,push:true,email:true,alimtalk:true,sms:true,alimtalkTemplateId:'11111111-1111-4111-8111-111111111111'};
const member='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
const reach={memberId:member,push:true,email:true,alimtalk:true,sms:true,emailMasked:'q***@example.test',phoneMasked:'010****5678'};
test('push-first routes only registered reachable channels; explicit all and inbox-only remain predictable',()=>{
 assert.deepEqual(logic.careChannelsFor(reach,config,['push','email','alimtalk'],'push_first'),['push']);
 assert.deepEqual(logic.careChannelsFor({...reach,push:false},config,['push','email','alimtalk'],'push_first'),['email','alimtalk']);
 assert.deepEqual(logic.careChannelsFor(reach,config,['email'],'push_first'),['email']);
 assert.deepEqual(logic.careChannelsFor(reach,config,['push','email','alimtalk'],'all'),['push','email','alimtalk']);
 assert.deepEqual(logic.careChannelsFor(reach,{...config,enabled:false},['push','email','alimtalk'],'all'),[]);
 assert.deepEqual(logic.careChannelsFor(reach,{...config,alimtalk:false},['alimtalk'],'all'),[]);
 assert.deepEqual(logic.careChannelsFor(reach,config,[],'all'),[]);
});
function server({env={},template={},settings={},send=async()=>({groupInfo:{groupId:'provider-id'}})}={}){
 const record={id:config.alimtalkTemplateId,channel:'alimtalk',purpose:'transactional',is_active:true,content:logic.CARE_ALIMTALK_BODY,alimtalk_template_id:'approved-id',...template};
 const providerCalls=[];
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:record,error:null})})})})};
 const mocks={
  'server-only':{},
  solapi:{SolapiMessageService:class{async send(message){providerCalls.push(message);return send(message);}}},
  '@/lib/learning-care-channels':logic,
  '@/lib/web-push-server':{pushConfiguration:()=>true},
  '@/lib/crm-sms-settings':{loadSmsSettings:async()=>({transactionalEnabled:true,senderPhone:'01000000000',...settings})},
  '@/lib/supabase/admin':{createAdminClient:()=>db},
 };
 return {providerCalls,api:load('lib/learning-care-delivery-server.ts',mocks,env)};
}
const environment={EDU_CARE_DELIVERY_ENABLED:'true',CRM_DELIVERY_ENABLED:'true',RESEND_API_KEY:'synthetic',CRM_EMAIL_FROM:'qa@example.test',SOLAPI_API_KEY:'synthetic',SOLAPI_API_SECRET:'synthetic',SOLAPI_KAKAO_PF_ID:'synthetic',EDU_CARE_ALIMTALK_TEMPLATE_ID:config.alimtalkTemplateId};
const job={id:member,lease:actor,channel:'email',destination:'learner@example.test',name:'검수 회원',content:'개인 학습 안내',templateId:config.alimtalkTemplateId};
test('channel configuration fails closed without rollout, email credentials or exact approved transactional template',async()=>{
 assert.equal((await server().api.careDeliveryConfiguration()).enabled,false);
 assert.deepEqual(await server({env:environment}).api.careDeliveryConfiguration(),config);
 for(const change of [{is_active:false},{channel:'sms'},{purpose:'marketing'},{content:'changed'},{alimtalk_template_id:null}]) assert.equal((await server({env:environment,template:change}).api.careDeliveryConfiguration()).alimtalk,false);
 assert.equal((await server({env:{...environment,RESEND_API_KEY:''}}).api.careDeliveryConfiguration()).email,false);
 assert.equal((await server({env:environment,settings:{transactionalEnabled:false}}).api.careDeliveryConfiguration()).alimtalk,false);
});
test('email provider receives a stable idempotency key; ambiguous transport or response is never called delivered',async()=>{
 const {api}=server({env:environment});let called;
 const result=await api.deliverCareEmail(job,async(url,init)=>{called={url,init};return Response.json({id:'receipt'});});assert.equal(result.status,'accepted');assert.equal(called.init.headers['Idempotency-Key'],'edu-care-'+job.id);assert.equal(JSON.parse(called.init.body).text,job.content);
 for(const status of [200,500,503])assert.equal((await api.deliverCareEmail(job,async()=>Response.json({}, {status}))).status,'unknown');
 assert.equal((await api.deliverCareEmail(job,async()=>Response.json({}, {status:422}))).status,'failed');
 assert.equal((await api.deliverCareEmail(job,async()=>{throw Error('SECRET');})).code,'TRANSPORT_UNCERTAIN');
});
test('alimtalk sends only fixed approved template, no freeform contents and no SMS fallback',async()=>{
 const {api,providerCalls}=server({env:environment});assert.equal((await api.deliverCareAlimtalk({...job,channel:'alimtalk'})).status,'accepted');
 assert.equal(providerCalls[0].type,'ATA');assert.equal(providerCalls[0].kakaoOptions.disableSms,true);assert.equal(providerCalls[0].kakaoOptions.templateId,'approved-id');assert.doesNotMatch(JSON.stringify(providerCalls),/개인 학습 안내/);
 const wrong=server({env:environment,template:{content:'changed'}});assert.equal((await wrong.api.deliverCareAlimtalk(job)).status,'skipped');assert.equal(wrong.providerCalls.length,0);
});
test('queue worker does no work while disabled, never sends changed recipients, and records unknown without retry',async()=>{
 const {api}=server();const calls=[],sendCalls=[];
 const deps={config:{...config,enabled:false},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='edu_claim_care_channels'?[{id:member,lease:actor}]:name==='edu_read_care_channel'?null:true,error:null};},send:async j=>{sendCalls.push(j);return{status:'unknown',code:'TRANSPORT_UNCERTAIN'};}};
 await api.dispatchCareChannels(deps);assert.equal(calls.length,0);deps.config=config;await api.dispatchCareChannels(deps);assert.equal(sendCalls.length,0);assert.equal(calls.at(-1).args.p_status,'skipped');
 const rpc=deps.rpc;deps.rpc=(name,args)=>name==='edu_read_care_channel'?{data:job,error:null}:rpc(name,args);await api.dispatchCareChannels(deps);assert.equal(sendCalls.length,1);assert.equal(calls.at(-1).args.p_status,'unknown');
});
test('channel preview and receipt enforce actor scope, bounds, no cache and no customer writes',async()=>{
 const calls=[];let user={id:actor};const api=load('app/api/admin/learning-care/channels/route.ts',{
 '@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async()=>true},'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)},'@/lib/learning-care-delivery-server':{careDeliveryConfiguration:async()=>config},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,args});return{data:name==='edu_care_channel_reach'?[reach]:{count:1,deliveries:[]},error:null};}})})}});
 const get=q=>api.GET(new Request('https://edu.test/api/admin/learning-care/channels?'+q));
 const r=await get('members='+member+'&actor=forged');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(calls[0].args.p_actor,actor);
 await get('request='+member);assert.equal(calls[1].name,'edu_care_delivery_receipt');assert.equal((await get('members=bad')).status,400);
 user=null;assert.equal((await get('members='+member)).status,403);assert.equal(calls.length,2);
});
test('new delivery cron requires exact configured authentication',async()=>{
 let n=0;const api=load('app/api/cron/learning-care-delivery/route.ts',{'@/lib/learning-care-delivery-server':{dispatchCareChannels:async()=>{n++;return{processed:0};}}},{CRON_SECRET:'synthetic'});
 for(const token of ['', 'Bearer other'])assert.equal((await api.GET(new Request('https://edu.test/api/cron/learning-care-delivery',{headers:{authorization:token}}))).status,401);
 assert.equal(n,0);assert.equal((await api.GET(new Request('https://edu.test/api/cron/learning-care-delivery',{headers:{authorization:'Bearer synthetic'}}))).status,200);assert.equal(n,1);
});
test('send API accepts only server-ready channels and binds exact reviewed routes to the authenticated actor',async()=>{
 const calls=[];let active=config,track='learning';
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
 const api=load('app/api/admin/learning-care/route.ts',{
 '@/lib/learning-care':load('lib/learning-care.ts'),
 '@/lib/server-auth':{getAuthenticatedUser:async()=>({id:actor})},'@/lib/operator-permissions':{getOperatorUser:async(_scope,user)=>user},'@/lib/edu-workflows':{uuid},'@/lib/learning-care-delivery-server':{careDeliveryConfiguration:async()=>active},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,args});return{data:name==='edu_admin_learning_care'?{rows:[{cells:[{lessonId:member,track,published:true,state:'not_submitted'}]}]}:{count:1,deliveries:[]},error:null};}})})}
 },{NEXT_PUBLIC_EDU_MESSAGES_ENABLED:'true'});
 const payload={actor:'forged',requestId:member,cohortId:member,lessonId:member,recipients:[member],content:'학습 안내',delivery:{mode:'push_first',channels:['push','email','alimtalk'],routes:[{memberId:member,channels:['push']}]}};
 const post=body=>api.POST(new Request('https://edu.test/api/admin/learning-care',{method:'POST',headers:{origin:'https://edu.test'},body:JSON.stringify(body)}));
 assert.equal((await post(payload)).status,200);assert.equal(calls[1].name,'edu_send_learning_care_channels');assert.equal(calls[1].args.p_actor,actor);assert.equal(calls[1].args.p_template,config.alimtalkTemplateId);
 for(const d of [{...payload.delivery,channels:['fax']},{...payload.delivery,mode:'bogus'},{...payload.delivery,routes:[]},{...payload.delivery,routes:[{memberId:'bad',channels:['push']}]}])assert.equal((await post({...payload,delivery:d})).status,400);
 active={...config,alimtalk:false};assert.equal((await post(payload)).status,409);active={...config,enabled:false};assert.equal((await post(payload)).status,409);assert.equal(calls.length,2);
 active=config;track="daily";assert.equal((await post(payload)).status,409);assert.equal(calls.length,3);assert.equal(calls.at(-1).name,"edu_admin_learning_care");
});
test('SMS uses a short notification with the inbox link, without LMS upgrade, and requires the registered sender',async()=>{
 const {api,providerCalls}=server({env:environment});assert.equal((await api.deliverCareSms({...job,channel:'sms'})).status,'accepted');
 assert.equal(providerCalls[0].type,'SMS');assert.equal(providerCalls[0].text,logic.CARE_SMS_BODY);assert.ok(Buffer.byteLength(logic.CARE_SMS_BODY,'utf8')<=90);assert.ok(!JSON.stringify(providerCalls).includes(job.content));
 const disabled=server({env:environment,settings:{transactionalEnabled:false}});assert.equal((await disabled.api.deliverCareSms(job)).status,'skipped');assert.equal(disabled.providerCalls.length,0);
});
test('push-first uses SMS only when Alimtalk is unavailable or not selected; all requires explicit duplicate choice',()=>{
 const selected=['push','email','alimtalk','sms'],r={...reach,push:false};
 assert.deepEqual(logic.careChannelsFor(r,config,selected,'push_first'),['email','alimtalk']);
 assert.deepEqual(logic.careChannelsFor(r,{...config,alimtalk:false},selected,'push_first'),['email','sms']);
 assert.deepEqual(logic.careChannelsFor(r,config,['email','sms'],'push_first'),['email','sms']);
 assert.deepEqual(logic.careChannelsFor(r,config,selected,'all'),['email','alimtalk','sms']);
});
test('SMS configuration is available independently of the Alimtalk template',async()=>{
 const c=await server({env:{...environment,EDU_CARE_ALIMTALK_TEMPLATE_ID:''}}).api.careDeliveryConfiguration();assert.equal(c.sms,true);assert.equal(c.alimtalk,false);
});

test('Kakao routing excludes email/push and chooses one reviewed mobile channel in either mode',()=>{
 const r={...reach,mobileOnly:true};
 for(const mode of ['push_first','all']){
  assert.deepEqual(logic.careChannelsFor(r,config,['push','email','alimtalk','sms'],mode),['alimtalk']);
  assert.deepEqual(logic.careChannelsFor(r,{...config,alimtalk:false},['push','email','alimtalk','sms'],mode),['sms']);
  assert.deepEqual(logic.careChannelsFor({...r,sms:false,alimtalk:false},config,['push','email','alimtalk','sms'],mode),[]);
  assert.deepEqual(logic.careChannelsFor(r,config,['email','push'],mode),[]);
 }
});
