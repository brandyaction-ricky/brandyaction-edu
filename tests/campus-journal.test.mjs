import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const state={user:{id:uid(1)},rows:[],cursor:null,trace:[],error:null};
globalThis.__campusJournal=state;
const bundle=await build({entryPoints:['app/api/campus/journal/route.ts'],write:false,bundle:true,platform:'node',format:'esm',plugins:[{name:'journal-boundaries',setup(b){b.onResolve({filter:/^@\/lib\/(server-auth|supabase\/server)$/},args=>({path:args.path,namespace:'boundary'}));b.onLoad({filter:/.*/,namespace:'boundary'},args=>({loader:'js',contents:args.path.endsWith('server-auth')?'export const getAuthenticatedUser=async()=>globalThis.__campusJournal.user;':`export async function createClient(){return {from(table){const st=globalThis.__campusJournal;const trace=[table];st.trace.push(trace);const q={then(resolve){return Promise.resolve({data:st.rows,error:st.error}).then(resolve)},maybeSingle(){return Promise.resolve({data:st.cursor,error:st.error})}};for(const m of ['select','eq','order','limit','or'])q[m]=(...args)=>{trace.push([m,...args]);return q;};return q;}}}` }));}}]});
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('journal uses session owner and stable bounded pagination; foreign cursor fails closed',async()=>{
 process.env.EDU_CAMPUS_ENABLED='true';process.env.EDU_CAMPUS_FOCUS_ENABLED='true';
 const request=cursor=>new Request('https://edu.test/api/campus/journal?enrollmentId='+uid(2)+(cursor?'&cursor='+cursor:''));
 state.rows=Array.from({length:51},(_,i)=>({id:uid(i+20)}));state.trace=[];
 const r=await GET(request());assert.equal(r.status,200);const v=await r.json();assert.equal(v.items.length,50);assert.equal(v.nextCursor,uid(69));
 assert.ok(state.trace[0].some(x=>Array.isArray(x)&&x[0]==='eq'&&x[1]==='user_id'&&x[2]===uid(1)));
 assert.equal((await GET(request(uid(9)))).status,409);
 state.cursor={id:uid(9),created_at:'2026-11-01T00:00:00.000Z'};state.trace=[];await GET(request(uid(9)));
 assert.ok(state.trace[0].some(x=>Array.isArray(x)&&x[0]==='eq'&&x[1]==='enrollment_id'&&x[2]===uid(2)));
 assert.ok(state.trace[0].some(x=>Array.isArray(x)&&x[0]==='or'&&x[1].includes('id.lt.'+uid(9))));
});
test('journal rejects invalid cursors, no session and disabled flag, redacts storage errors',async()=>{
 const url='https://edu.test/api/campus/journal?enrollmentId='+uid(2);
 assert.equal((await GET(new Request(url+'&cursor=bad.or()'))).status,400);
 state.user=null;assert.equal((await GET(new Request(url))).status,401);state.user={id:uid(1)};
 state.error={message:'secret internal database error'};const r=await GET(new Request(url));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret internal/);state.error=null;
 process.env.EDU_CAMPUS_FOCUS_ENABLED='false';assert.equal((await GET(new Request(url))).status,404);
 delete process.env.EDU_CAMPUS_ENABLED;delete process.env.EDU_CAMPUS_FOCUS_ENABLED;
});
