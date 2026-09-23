import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}),actor=randomUUID(),code=randomUUID(),template=randomUUID();
test('recruitment delivery endpoint requires full authority and origin; reads never schedule and body cannot choose actor or recipients',async()=>{
 const calls=[];let permissions={products:true,members:true,orders:true};
 const route=load('../app/api/conversion/delivery/route.ts',{'@/lib/conversion-review-server':server,'@/lib/operator-permissions':{getOperatorUser:async()=>({id:actor,permissions})},'@/lib/crm-delivery':{crmDeliveryState:()=>({enabled:false})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{state:'ready'},error:null};}})}},{EDU_CONVERSION_REVIEW_ENABLED:'true'});
 const post=(body,origin='https://example.test')=>new Request('https://example.test/api/conversion/delivery',{method:'POST',headers:{origin},body:JSON.stringify(body)});
 const body={code,template,purpose:'encore',token:'a'.repeat(32),name:'합성 예약',at:new Date(Date.now()+600000).toISOString(),actor:'forged',recipientIds:[randomUUID()]};
 const read=await route.GET(new Request(`https://example.test/api/conversion/delivery?code=${code}&template=${template}`));assert.equal(read.status,200);assert.equal(calls[0].args.p_schedule,null);assert.match(read.headers.get('cache-control'),/no-store/);
 assert.equal((await route.POST(post(body))).status,200);assert.equal(calls[1].args.p_actor,actor);assert.deepEqual(Object.keys(calls[1].args.p_schedule).sort(),['at','name','token']);
 assert.equal((await route.POST(post(body,'https://evil.test'))).status,403);
 assert.equal((await route.POST(post({...body,token:''}))).status,400);
 assert.equal((await route.POST(post({...body,template:null}))).status,400);
 assert.equal((await route.POST(post({code,cancel:randomUUID()}))).status,200);
 permissions={products:true,members:true,orders:false};assert.equal((await route.POST(post(body))).status,403);assert.equal((await route.GET(new Request(`https://example.test?code=${code}`))).status,403);
 assert.equal(calls.length,3);
});
test('dispatch recruitment branch never queries all members; failed claim sends nothing and ambiguous provider outcomes are not exposed or retried',async()=>{
 for(const mode of ['accepted','claim-error','provider-error','disabled']){
  const steps=[],updates=[];let state='scheduled';
  const templateRow={id:template,channel:'lms',purpose:'marketing',content:'QA',is_active:true};
  const member={id:randomUUID(),phone:'01000000000',status:'active',marketing_consent:true};
  const db={rpc:async()=>{steps.push('claim');return mode==='claim-error'?{error:{message:'CONVERSION_STALE'}}:{data:{template:templateRow,members:[member]}};},from:table=>{
   steps.push(table);let operation='read',values;
   const q={select:()=>q,eq:()=>q,lte:()=>q,order:()=>q,limit:()=>q,in:()=>q,
    insert:v=>{operation='insert';values=v;return q;},update:v=>{operation='update';values=v;updates.push({table,values:v});return q;},
    maybeSingle:async()=>table==='crm_campaigns'?operation==='update'?{data:{id:code}}:{data:state==='scheduled'?{id:code,recruitment_id:randomUUID(),template:templateRow}:null}:{data:null},
    then:(resolve,reject)=>Promise.resolve(table==='crm_automation_runs'?{data:[]}:table==='crm_message_logs'&&operation==='insert'?{data:values.map((v,i)=>({id:'log'+i,member_id:v.member_id}))}:{data:null}).then(resolve,reject)};
   if(table==='profiles'||table==='crm_member_tags')throw Error('unscoped audience access');return q;
  }};
  const env={EDU_CONVERSION_REVIEW_ENABLED:'true',CRM_DELIVERY_ENABLED:mode==='disabled'?'false':'true',SOLAPI_API_KEY:'test',SOLAPI_API_SECRET:'test',SOLAPI_SENDER_PHONE:'0200000000',SOLAPI_OPTOUT_PHONE:'0800000000'};
  const service=load('../lib/crm-delivery.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},solapi:{SolapiMessageService:class{async send(){steps.push('provider');if(mode==='provider-error')throw Error('sensitive upstream payload');return{groupInfo:{groupId:'qa',status:'accepted'},failedMessageList:[]};}}}},env);
  await service.dispatchDueCrm();
  if(mode==='disabled')assert.deepEqual(steps,[]);
  else if(mode==='claim-error')assert.equal(steps.includes('provider'),false);
  else assert.ok(steps.indexOf('claim')<steps.indexOf('provider'));
  if(mode==='provider-error'){
   assert.ok(updates.some(u=>u.table==='crm_message_logs'&&u.values.status==='unknown'));
   assert.equal(JSON.stringify(updates).includes('sensitive'),false);
  }
  state='failed';await service.dispatchDueCrm();assert.ok(steps.filter(s=>s==='provider').length<=1);
 }
});
