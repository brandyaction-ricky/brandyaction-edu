import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out;}
const logic=compile('lib/kakao-sync.ts'), policy={POLICY_VERSION:'2026-08-11',CURRENT_PRIVACY_VERSION:'2026-10-17'};
const config={...logic.defaultKakaoSyncConfig,enabled:true,appId:'123',channelId:'_test',termsTag:'terms_v1',privacyTag:'privacy_v2',privacyVersion:policy.CURRENT_PRIVACY_VERSION,setupConfirmed:true};
const terms=[config.termsTag,config.privacyTag].map(tag=>({tag,agreed:true,agreed_at:'2026-10-17T01:00:00Z'}));
const user={id:'member-synthetic',last_sign_in_at:'2026-10-17T00:59:00Z',identities:[{provider:'kakao',id:'456'}],user_metadata:{kakao_required:true}};
function harness({cfg=config,receipt={app_id:'123',kakao_user_id:'456',policy_version:'2026-08-11/2026-10-17',terms,checked_at:'2026-10-17T01:00:00Z'},error=null}={}){
 const reads=[];const m=compile('lib/kakao-sync-server.ts',{'@/lib/legal-policies':policy,'@/lib/kakao-sync':logic,'@/lib/supabase/admin':{createAdminClient:()=>({from:table=>({select:()=>({eq:(key,value)=>{reads.push({table,key,value});return table==='kakao_sync_config'?{single:async()=>({data:{value:cfg,revision:1},error:null})}:{maybeSingle:async()=>({data:receipt,error})};}})})})}});
 return {...m,reads};
}
test('only matching server receipt, identity, current versions and complete required terms remove the checkbox',async()=>{
 const h=harness();assert.deepEqual(await h.getKakaoRequiredConsent(user),{agreedAt:'2026-10-17T01:00:00.000Z'});assert.deepEqual(h.reads[1],{table:'kakao_sync_members',key:'user_id',value:user.id});
 for(const options of [
  {cfg:{...config,enabled:false}}, {cfg:{...config,privacyVersion:undefined}}, {cfg:{...config,privacyVersion:'2026-08-11'}},
  {receipt:null},{error:{message:'private'}},
  ...[{app_id:'999'},{kakao_user_id:'999'},{policy_version:'2026-08-11'}, {checked_at:'2026-10-16T01:00:00Z'}, {checked_at:'2099-01-01T00:00:00Z'}, {terms:terms.slice(0,1)}, {terms:terms.map(t=>({...t,agreed:false}))}, {terms:terms.map(t=>({...t,agreed_at:'2099-01-01T00:00:00Z'}))}].map(p=>({receipt:{app_id:'123',kakao_user_id:'456',policy_version:'2026-08-11/2026-10-17',terms,checked_at:'2026-10-17T01:00:00Z',...p}}))
 ])assert.equal(await harness(options).getKakaoRequiredConsent(user),null);
 const noIdentity=harness();assert.equal(await noIdentity.getKakaoRequiredConsent({...user,identities:[]}),null);assert.equal(noIdentity.reads.length,0);
});
test('signup status is authenticated, read-only, no-store and returns no member identifiers',async()=>{
 function h({who=user,proof={agreedAt:'2026-10-17T01:00:00Z'},crash=false}={}){const calls=[];const m=compile('app/api/auth/signup-consent/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{if(crash)throw Error('private');return{data:{user:who},error:null};}}})},'@/lib/kakao-sync-server':{getKakaoRequiredConsent:async u=>{calls.push(u.id);return proof;}}});return{...m,calls};}
 const good=h(),r=await good.GET();assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(await r.json(),{requiredAccepted:true,agreedAt:'2026-10-17T01:00:00Z'});assert.deepEqual(good.calls,[user.id]);
 assert.equal((await h({who:null}).GET()).status,401);assert.equal((await h({crash:true}).GET()).status,503);assert.deepEqual(await(await h({proof:null}).GET()).json(),{requiredAccepted:false,agreedAt:null});
});
