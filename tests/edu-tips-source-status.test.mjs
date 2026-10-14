import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import{createRequire}from'node:module';import ts from'typescript';
import {candidate} from './helpers/edu-tips-candidate-loader.mjs';
const require=createRequire(import.meta.url),status=candidate('edu-tips-source-status');
const data={registration_pending:1,registration_attention:0,projection_pending:2,projection_attention:1,withdrawal_pending:3,withdrawal_attention:0,unclassified:0,identity_enabled:true,publisher_enabled:true,withdrawal_enabled:true};
test('status classifies operational counts without targets; malformed fields cannot be rendered as success',()=>{
 assert.equal(status.classifySourceStatus(data).state,'attention');
 for(const x of [{...data,email:'private'}, {...data,projection_attention:9},{...data,projection_pending:-1},{...data,publisher_enabled:'true'}])assert.throws(()=>status.classifySourceStatus(x));
});
test('admin route authenticates before reading; default OFF does no RPC, errors are sanitized and reads do not mutate',async()=>{
 const saved=process.env.EDU_TIPS_SOURCE_STATUS_ENABLED;let user=null,calls=0,row=data,err=null;
 const result={},code=ts.transpileModule(readFileSync(new URL('../app/api/admin/tips-source-status/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',code)(result,n=>n==='@/lib/server-auth'?{getAuthenticatedUser:async()=>user}:n==='@/lib/supabase/admin'?{createAdminClient:()=>({rpc:async(name)=>{calls++;assert.equal(name,'edu_tips_source_status_candidate');return{data:row,error:err};}})}:n==='@/lib/edu-tips-source-status'?status:require(n));
 try{
 process.env.EDU_TIPS_SOURCE_STATUS_ENABLED='true';assert.equal((await result.GET()).status,401);user={role:'staff'};assert.equal((await result.GET()).status,403);assert.equal(calls,0);
 user={role:'admin'};delete process.env.EDU_TIPS_SOURCE_STATUS_ENABLED;assert.deepEqual(await(await result.GET()).json(),{state:'disabled'});assert.equal(calls,0);
 process.env.EDU_TIPS_SOURCE_STATUS_ENABLED='true';assert.equal((await(await result.GET()).json()).state,'attention');err={message:'private credential error'};const r=await result.GET();assert.equal(r.status,503);assert.deepEqual(await r.json(),{state:'check_unavailable'});
 }finally{if(saved===undefined)delete process.env.EDU_TIPS_SOURCE_STATUS_ENABLED;else process.env.EDU_TIPS_SOURCE_STATUS_ENABLED=saved;}
});
test('admin notice hides while OFF and distinguishes pending/attention from deletion completion',()=>{
 const out={},code=ts.transpileModule(readFileSync(new URL('../app/ui/final/tips-source-notice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(out,n=>n.endsWith('.css')?{}:require(n));const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const render=s=>renderToStaticMarkup(React.createElement(out.TipsSourcePanel,{snapshot:s}));assert.equal(render({state:'disabled'}),'');
 const html=render(status.classifySourceStatus(data));assert.ok(html.includes('role="alert"'));assert.ok(html.includes('등록 대기 1건'));assert.ok(html.includes('삭제 완료를 뜻하지 않습니다'));
 const pending=render({...status.classifySourceStatus(data),state:'pending'});assert.ok(pending.includes('role="status"'));
 writeFileSync('/private/tmp/edu-hmac-source-panel-QA.html','<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:24px;color:#20252a;background:#f5f6f7}.panel{padding:24px;background:white;border:1px solid #ddd;border-radius:12px}'+readFileSync(new URL('../app/ui/final/tips-erasure-monitor-notice.css',import.meta.url),'utf8')+'</style><body class="edu-admin">'+html+'</body></html>');
});
