import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['features/campus/webinar/dev-presence.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'no-external-client',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'sdk',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createClient(){throw Error("Unexpected client");}'}));}}]});
const {sanitizeDevVisitor,connectDevVisitors}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('public DEV visual presence strips chat, identity, roles and unknown fields',()=>{
 const p=sanitizeDevVisitor({id:'00000000-0000-4000-8000-000000000001',x:1,y:28,yaw:0,moving:true,gender:'female',model:5,coat:'#abcdef',heldItem:'book',email:'private@example.test',nickname:'private',message:'not rendered',role:'admin'});
 assert.equal(p.gender,'female');assert.equal(p.model,5);assert.equal(p.heldItem,'book');for(const k of ['email','nickname','message','role'])assert.equal(p[k],undefined);
 for(const patch of [{id:'wrong'},{x:Infinity},{y:101},{yaw:'0'}])assert.equal(sanitizeDevVisitor({...p,...patch}),null);
 const fallback=sanitizeDevVisitor({...p,coat:'url(evil)',model:999,heldItem:'script'});assert.equal(fallback.coat,'#386eb4');assert.equal(fallback.model,0);assert.equal(fallback.heldItem,'none');
});
test('DEV visitor transport never connects to production or unknown Supabase projects',()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 try{process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test';for(const url of ['https://qitqxizuwmmlhlcgsrqe.supabase.co','https://other.supabase.co','']){process.env.NEXT_PUBLIC_SUPABASE_URL=url;assert.throws(()=>connectDevVisitors(()=>{}),/DEV 연결/);}}finally{if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
