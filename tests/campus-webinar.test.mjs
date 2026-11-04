import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async p=>{const r=await build({entryPoints:[p],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const d=await load('features/campus/webinar/domain.ts'),{config}=await load('tests/webinar-fixture/data.ts'),{isAnonymousWebinarRoute}=await load('features/campus/webinar/public-route.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('event configuration restricts public output, embed IDs, redirects, time windows and unknown fields',()=>{
 const parsed=d.validateWebinar(config);assert.equal(parsed.slug,config.slug);const pub=d.projectWebinar(parsed);assert.equal(pub.revision,undefined);assert.equal(pub.status,undefined);assert.equal(pub.cohortId,undefined);assert.match(pub.checkoutPath,/utm_campaign=moonshot-open/);
 for(const patch of [{slug:'../admin'},{slug:'a'},{title:''},{detailPath:'//evil.test'},{detailPath:'/classes/a?next=//evil.test'},{kakaoUrl:'https://pf.kakao.com.evil.test/a'},{kakaoUrl:'https://a:b@pf.kakao.com/a'},{kakaoUrl:'javascript:alert(1)'},{kakaoUrl:'https://pf.kakao.com:123/a'},{kakaoUrl:'https://pf.kakao.com/a?redirect=https://evil.test'},{youtubeId:'<script>'},{cohortId:'bad'},{revision:'bad'},{endsAt:config.startsAt},{endsAt:'2027-01-01'},{startsAt:'bad'},{status:'visible'},{privateKey:'secret'}])assert.throws(()=>d.validateWebinar({...config,...patch}),JSON.stringify(patch));
});
test('member access rejects foreign, refunded, expired, malformed windows and returns upcoming access only to welcome',()=>{
 const base={id:id(8),user_id:id(2),cohort_id:id(1),status:'active',revoked_at:null,access_starts_at:'2026-01-01',access_ends_at:'2027-01-01'},now=Date.parse('2026-11-03');
 assert.equal(d.accessFor([base],id(2),id(1),now).kind,'member');
 for(const patch of [{user_id:id(3)},{cohort_id:id(4)},{status:'revoked'},{revoked_at:'2026-11-02'},{access_ends_at:'2026-11-03'},{access_ends_at:'oops'},{access_starts_at:'oops'},{id:'bad'}])assert.equal(d.accessFor([{...base,...patch}],id(2),id(1),now).kind,'offer');
 assert.deepEqual(d.accessFor([{...base,access_starts_at:'2026-12-01'}],id(2),id(1),now),{kind:'welcome',href:'/campus/enter?cohort='+id(1)+'&welcome=1'});assert.equal(d.accessFor([],id(2),id(1),now).kind,'offer');
});
test('anonymous session refresh exemption never includes private access, admins, other campus routes or malformed paths',()=>{
 for(const method of ['GET','HEAD'])assert.equal(isAnonymousWebinarRoute('/campus/live/moonshot-open',method),true);
 assert.equal(isAnonymousWebinarRoute('/api/campus/webinar/moonshot-open/events','POST'),true);
 for(const [path,method] of [['/api/campus/webinar/moonshot-open/access','GET'],['/admin/campus/webinars','GET'],['/campus/workspace','GET'],['/campus/live/moonshot-open','POST'],['/campus/live/a/../../workspace','GET'],['/api/campus/webinar/moonshot-open/events','GET']])assert.equal(isAnonymousWebinarRoute(path,method),false);
});
test('scheduled phase boundaries are deterministic',()=>{assert.equal(d.phase(config,Date.parse(config.startsAt)-1),'upcoming');assert.equal(d.phase(config,Date.parse(config.startsAt)),'live');assert.equal(d.phase(config,Date.parse(config.endsAt)),'ended');});
// Route-level tests replace only external Auth/DB/Next-cache dependencies.
const state={};globalThis.__webinarTest=state;
const plugin={name:'webinar-dependencies',setup(b){b.onResolve({filter:/^(?:@\/lib\/(?:server-auth|operator-permissions|supabase\/(?:admin|server))|next\/cache)$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='next/cache'?'export const unstable_cache=f=>f;export const revalidateTag=()=>{globalThis.__webinarTest.revalidated++};':args.path.includes('server-auth')?'export const getAuthenticatedUser=async()=>{if(globalThis.__webinarTest.authError)throw Error("temporary");return globalThis.__webinarTest.user};':args.path.includes('operator-permissions')?'export const getOperatorUser=async scope=>globalThis.__webinarTest.operator;':'export const createAdminClient=()=>globalThis.__webinarTest.db;export const createClient=async()=>globalThis.__webinarTest.db;',loader:'js'}));}};
async function route(path){const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,plugins:[plugin]});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const access=await route('app/api/campus/webinar/[slug]/access/route.ts'),admin=await route('app/api/admin/campus/webinars/route.ts'),events=await route('app/api/campus/webinar/[slug]/events/route.ts');
function reset(){Object.assign(state,{user:null,operator:null,authError:false,revalidated:0,event:{...config},enrollments:[],writes:0,queries:[],events:[],dbError:false,conflict:false});state.db={from(table){const q={filters:[],op:'read',payload:null,select(){return this;},eq(k,v){this.filters.push([k,v]);return this;},limit(){return this;},abortSignal(){return this;},maybeSingle(){return this;},insert(v){this.op='insert';this.payload=v;return this;},update(v){this.op='update';this.payload=v;return this;},then(resolve,reject){state.queries.push(table);if(state.dbError)return Promise.resolve({error:{message:'db offline'},data:null}).then(resolve,reject);let result={error:null,data:null};if(table==='site_settings'){if(this.op==='read'){result.data=state.event?{value:state.event}:null;}else{state.writes++;if(state.conflict||this.op==='update'&&this.filters.find(x=>x[0]==='value->>revision')?.[1]!==state.event?.revision){result.data=null;}else{state.event=this.payload.value;result.data={key:d.WEBINAR_PREFIX+config.slug};}}}else if(table==='enrollments'){result.data=state.enrollments;}else if(table==='cohorts'){result.data={id:config.cohortId,archived_at:null,courses:{slug:'moonshot',status:'published',archived_at:null}};}return Promise.resolve(result).then(resolve,reject);}};return q;},rpc(name,args){state.events.push({name,args});return {abortSignal:async()=>({error:null,data:true})};}};}
const params={params:Promise.resolve({slug:config.slug})};const origin='https://edu.test';
const req=(path='/api/admin/campus/webinars',body,headers={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
test('access route is private, fails closed and reads no enrollments before login',async()=>{
 reset();let r=await access.GET(req(),params);assert.equal((await r.json()).kind,'login');assert.match(r.headers.get('cache-control'),/private, no-store/);assert.ok(!state.queries.includes('enrollments'));
 state.user={id:id(2)};state.enrollments=[{id:id(8),user_id:id(2),cohort_id:config.cohortId,status:'active'}];r=await access.GET(req(),params);assert.equal((await r.json()).href,'/campus/workspace?enrollmentId='+id(8)+'&section=space');
 r=await access.GET(req('/api/campus/webinar/moonshot-open/access?section=office'),params);assert.match((await r.json()).href,/section=office$/);
 assert.equal((await access.GET(req('/api/campus/webinar/moonshot-open/access?section=admin'),params)).status,400);
 state.authError=true;r=await access.GET(req(),params);assert.equal(r.status,503);state.authError=false;state.event.status='paused';r=await access.GET(req(),params);assert.equal(r.status,404);
 r=await access.GET(req(undefined,undefined,{'sec-fetch-site':'cross-site'}),params);assert.equal(r.status,403);
});
test('admin saves enforce operator/origin/CAS, idempotency and conflict without overwrite',async()=>{
 reset();const fresh={...config,title:'수정 행사',revision:id(9)},body={event:fresh,expectedRevision:config.revision};
 assert.equal((await admin.POST(req(undefined,body))).status,403);assert.equal(state.writes,0);
 state.operator={id:id(2)};assert.equal((await admin.POST(req(undefined,body,{origin:'https://evil.test'}))).status,403);
 assert.equal((await admin.POST(req(undefined,body))).status,200);assert.equal(state.writes,1);assert.equal(state.revalidated,1);
 assert.equal((await admin.POST(req(undefined,body))).status,200);assert.equal(state.writes,1);
 assert.equal((await admin.POST(req(undefined,{...body,event:{...fresh,title:'별도 변경'}}))).status,409);assert.equal(state.writes,1);
 assert.equal((await admin.POST(req(undefined,{event:{...fresh,revision:id(10)},expectedRevision:config.revision}))).status,409);
 state.conflict=true;assert.equal((await admin.POST(req(undefined,{event:{...fresh,revision:id(10)},expectedRevision:fresh.revision}))).status,409);assert.equal(state.event.revision,fresh.revision);
});
test('telemetry accepts only bounded anonymous whitelisted events on published events and never records purchases',async()=>{
 reset();const body={session:id(4),event:'checkout'};
 assert.equal((await events.POST(req(undefined,body),params)).status,204);assert.equal(state.events[0].args.p_event,'click');assert.equal(state.events[0].args.p_metadata.webinar_action,'checkout');assert.equal(state.events[0].args.p_user,null);
 for(const patch of [{event:'purchase'},{session:'x'},{user_id:id(2)},{event:'x'.repeat(1500)}])assert.equal((await events.POST(req(undefined,{...body,...patch}),params)).status,400);
 assert.equal((await events.POST(req(undefined,body,{origin:'https://evil.test'}),params)).status,403);
 state.event.status='draft';assert.equal((await events.POST(req(undefined,body),params)).status,404);assert.equal(state.events.length,1);
});
