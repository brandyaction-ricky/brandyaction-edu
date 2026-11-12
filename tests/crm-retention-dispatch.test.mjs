import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const local={id:'template',is_active:true,channel:'alimtalk',purpose:'transactional',content:'#{이름}님, 학습을 이어가요.',alimtalk_template_id:'approved'};
const remote={templateId:'approved',channelId:'pf',status:'APPROVED',isHidden:false,messageType:'BA',content:local.content,variables:[{name:'이름'}]};
function fixture({enabled=true,claim={id:'member',phone:'01000001234',status:'active'},approval=remote,providerError=false,receipt,daytime=true}={}){
 const writes=[],calls=[],sends=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='edu_scan_retention_automations'?1:claim,error:null};},from(table){
  let values,filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},like(){return q;},lte(){return q;},order(){return q;},limit(){return q;},update(v){values=v;return q;},then(resolve,reject){
   if(values)writes.push({table,values,filters});
   const data=values?null:filters.status==='accepted'?(receipt?[{id:'prior',provider_group_id:'group'}]:[]):[{id:'run',automation:{template:local}}];
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }};return q;
 }};
 const modules={
  solapi:{SolapiMessageService:class{getKakaoAlimtalkTemplate(){if(approval instanceof Error)throw approval;return approval;}getGroupMessages(){return receipt;}}},
  '@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/crm-sms-settings':{loadSmsSettings:async()=>({transactionalEnabled:true,senderPhone:'0200000000'}),marketingAllowedNow:()=>daytime},
  '@/lib/crm-retention':{retentionFailure:{TEMPLATE_UNVERIFIED:'승인 확인 실패',PROVIDER_UNKNOWN:'접수 미확인 · 자동 재발송 안 함'}},
  '@/lib/crm-delivery':{sendBatch:async(...args)=>{sends.push(args);if(providerError)throw Error('private provider body');return {sent:1,groupId:'new-group'};}},
 };
 const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL('../lib/crm-retention-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>modules[name],{env:enabled?{CRM_RETENTION_ENABLED:'true',CRM_AUTOMATIONS_ENABLED:'true',CRM_DELIVERY_ENABLED:'true',SOLAPI_API_KEY:'test',SOLAPI_API_SECRET:'test',SOLAPI_KAKAO_PF_ID:'pf'}:{}});
 return {...exports,db,writes,calls,sends};
}
test('provider approval verifies channel, exact body and supported variables, never a bare template ID',()=>{
 const {verifiedRetentionTemplate:verify}=fixture();assert.equal(verify(local,remote,'pf'),true);
 for(const changed of [{status:'PENDING'},{status:'REJECTED'},{channelId:'other'},{isHidden:true},{templateId:'other'},{content:'changed'},{messageType:'AD'},{variables:[{name:'결제금액'}]}])assert.equal(verify(local,{...remote,...changed},'pf'),false);
 for(const changed of [{is_active:false},{purpose:'marketing'},{channel:'sms'},{content:'{{unknown}}'}])assert.equal(verify({...local,...changed},remote,'pf'),false);
});
test('default OFF and daytime guard do not scan, claim or send',async()=>{
 for(const options of [{enabled:false},{daytime:false}]){const f=fixture(options);assert.equal((await f.dispatchRetentionCrm()).disabled,true);assert.equal(f.calls.length+f.sends.length+f.writes.length,0);}
});
test('unverified template fails closed; live eligibility rejection never calls provider send',async()=>{
 for(const approval of [{...remote,status:'INSPECTING'},new Error('secret')]){const f=fixture({approval});await f.dispatchRetentionCrm();assert.deepEqual(f.calls.map(x=>x.name),['edu_scan_retention_automations']);assert.equal(f.sends.length,0);assert.equal(f.writes[0].values.status,'failed');assert.doesNotMatch(JSON.stringify(f.writes),/secret/);}
 const f=fixture({claim:null});assert.equal((await f.dispatchRetentionCrm()).skipped,1);assert.equal(f.sends.length,0);
});
test('accepted is distinct from delivered; unknown provider result is recorded without a retry',async()=>{
 const f=fixture();const result=await f.dispatchRetentionCrm();assert.equal(result.sent,1);assert.equal(f.writes.at(-1).values.status,'accepted');assert.equal(f.sends[0][2].retention,true);assert.deepEqual(f.sends[0][1],[{id:'member',phone:'01000001234',status:'active'}]);
 const failed=fixture({providerError:true});assert.equal((await failed.dispatchRetentionCrm()).failed,1);assert.equal(failed.sends.length,1);assert.equal(failed.writes.at(-1).values.status,'failed');assert.doesNotMatch(JSON.stringify(failed.writes),/private provider body/);
});
test('receipt confirmation requires a single ATA, matching group and final 4000, while failure codes remain failures',async()=>{
 for(const [code,status] of [['2000',null],['3000',null],['4000','completed'],['1029','failed']]){
  const f=fixture({receipt:{messageList:{one:{groupId:'group',type:'ATA',statusCode:code}}}});
  await f.syncRetentionReceipts(f.db,{getGroupMessages:async()=>({messageList:{one:{groupId:'group',type:'ATA',statusCode:code}}})});
  assert.equal(f.writes.length,status?3:1);if(status){assert.equal(f.writes.at(-1).values.status,status);assert.equal(f.writes[1].values.status,status==='completed'?'delivered':'failed');}
 }
 for(const response of [{messageList:{one:{groupId:'other',type:'ATA',statusCode:'4000'}}},{messageList:{one:{groupId:'group',type:'SMS',statusCode:'4000'}}},{messageList:{one:{groupId:'group',type:'ATA',statusCode:'4000'}},nextKey:'more'},{messageList:{}}]){
  const f=fixture({receipt:response});await f.syncRetentionReceipts(f.db,{getGroupMessages:async()=>response});assert.equal(f.writes.length,1);
 }
});
