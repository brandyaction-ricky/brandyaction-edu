import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const state={}; globalThis.__eventAccess=state;
const plugin={name:'event-deps',setup(b){
 b.onResolve({filter:/^(?:@\/lib\/(?:server-auth|operator-permissions|supabase\/admin)|next\/cache|@\/features\/campus\/event\/server)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/cache'?'export const unstable_cache=f=>f;':a.path.includes('server-auth')?'export const getAuthenticatedUser=async()=>globalThis.__eventAccess.user;':a.path.includes('operator-permissions')?'export const getOperatorUser=async()=>globalThis.__eventAccess.operator;':a.path.endsWith('/event/server')?'export const getEvent=async()=>globalThis.__eventAccess.zone;export const eventView=async()=>({claimed:true});export const eventError=e=>{throw Error(e.message);};':'export const createAdminClient=()=>globalThis.__eventAccess.db;',loader:'js'}));
}};
async function load(p){const r=await build({entryPoints:[p],bundle:true,platform:'node',format:'esm',write:false,plugins:[plugin]});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const route=await load('app/api/campus/event/route.ts'),admin=await load('app/api/admin/campus/events/route.ts'),model=await load('features/campus/event/model.ts');
const id='00000000-0000-4000-8000-000000000001',slug='event-test',path=`edu/campus-event/${slug}/${id}/${id}.pdf`;
function reset(){Object.assign(state,{user:{id},operator:{id},award:true,revoked:false,size:100,signed:0,calls:[],zone:{id,slug,enabled:true,resources:[{id,title:'QA',description:'',fileName:'안내.pdf',storagePath:path,published:true}]}});state.db={
 from(table){return{select(){return this},eq(k,v){if(table==='edu_event_awards'&&k==='user_id')assert.equal(v,id);return this},async maybeSingle(){return{data:state.award?{wallet_id:id}:null}},async single(){return{data:{status:state.revoked?'revoked':'available'}}},async insert(){return{error:null}}};},
 async rpc(name,args){state.calls.push({name,args});return{data:null,error:null}},
 storage:{from(bucket){assert.equal(bucket,'campus-event-assets');return{async info(p){assert.equal(p,path);return{data:{size:state.size}}},async createSignedUrl(p,ttl,options){assert.equal(p,path);assert.equal(ttl,60);assert.equal(options.download,'안내.pdf');state.signed++;return{data:{signedUrl:'https://files.example.invalid/private-download'}}}}}}
};}
const post=(body,origin='https://edu.test')=>new Request('https://edu.test/api/campus/event',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const download=()=>new Request(`https://edu.test/api/campus/event?slug=${slug}&file=${id}`);
test('only the signed-in awarded account can receive a short-lived private download',async()=>{
 reset();state.user=null;assert.equal((await route.GET(download())).status,401);
 state.user={id};state.award=false;assert.equal((await route.GET(download())).status,403);
 state.award=true;state.revoked=true;assert.equal((await route.GET(download())).status,403);
 state.revoked=false;state.zone.resources[0].published=false;assert.equal((await route.GET(download())).status,404);
 state.zone.resources[0].published=true;state.zone.resources[0].storagePath='edu/paid/foreign.pdf';assert.equal((await route.GET(download())).status,404);
 state.zone.resources[0].storagePath=path;state.size=21*1024*1024;assert.equal((await route.GET(download())).status,404);assert.equal(state.signed,0);
 state.size=100;const r=await route.GET(download());assert.equal(r.status,303);assert.equal(state.signed,1);assert.match(r.headers.get('cache-control'),/private, no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(route.HEAD().status,405);
});
test('claims reject foreign origins and anonymous users; identity is server-derived and token is hashed',async()=>{
 reset();const token='a'.repeat(64),body={slug,action:'claim',invite:token,userId:'spoof'};
 assert.equal((await route.POST(post(body,'https://foreign.test'))).status,403);state.user=null;assert.equal((await route.POST(post(body))).status,401);assert.equal(state.calls.length,0);
 state.user={id};assert.equal((await route.POST(post(body))).status,200);assert.deepEqual(state.calls[0],{name:'edu_event_claim',args:{p_user:id,p_slug:slug,p_hash:createHash('sha256').update(token).digest('hex'),p_live:false}});
});
test('event management requires a marketing operator and a same-origin request',async()=>{
 reset();state.operator=null;assert.equal((await admin.GET(new Request('https://edu.test/api/admin/campus/events'))).status,403);assert.equal((await admin.POST(post({action:'save'}))).status,403);
 state.operator={id};assert.equal((await admin.POST(post({action:'save'},'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
});
test('event settings reject foreign files, invalid dates, duplicate materials and privilege fields',()=>{
 reset();const v={slug,title:'QA',description:'',cohortId:id,claimEndsAt:'2026-11-08T00:00:00Z',couponEndsAt:'2026-11-10T00:00:00Z',liveEndsAt:'2026-11-08T14:59:59.999Z',enabled:true,resources:state.zone.resources};assert.equal(model.eventSettings(v).resources.length,1);
 for(const patch of[{role:'admin'},{claimEndsAt:'bad'},{claimEndsAt:'2026-12-01T00:00:00Z'},{resources:[...v.resources,...v.resources]},{resources:[{...v.resources[0],storagePath:'edu/paid/other.pdf'}]},{resources:[{...v.resources[0],fileName:'run.html'}]}])assert.throws(()=>model.eventSettings({...v,...patch}));
});
