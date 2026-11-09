// Local-only capacity fixture. No remote URL, real identities, or cloud credentials.
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {prepareReport} from '../../scripts/campus-office-report.mjs';
const requireQA=createRequire(pathToFileURL(resolve(process.env.OFFICE_QA_DEPS||'.','package.json')));
const Embedded=(await import(pathToFileURL(requireQA.resolve('embedded-postgres')).href)).default;
const {Pool}=requireQA('pg');
const root=fileURLToPath(new URL('../..',import.meta.url));process.chdir(root);
const scratch=await mkdtemp(join(tmpdir(),'campus-office-local-'));
const password=randomBytes(24).toString('hex'), port=45889;
const cluster=new Embedded({databaseDir:join(scratch,'db'),port,user:'postgres',password,persistent:false,authMethod:'scram-sha-256',postgresFlags:['-c','listen_addresses=127.0.0.1','-k',scratch],onLog:()=>{},onError:()=>{}});
let pool,server,browser;
const sqlid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha=s=>createHash('sha256').update(s).digest('hex');
const people=Array.from({length:200},(_,n)=>({id:sqlid(n+100),en:sqlid(n+1000),cookie:randomUUID(),employee:'qa-staff',job:randomUUID(),name:'검수 '+(n+1)+'번',token:randomBytes(32).toString('hex')}));
const issued=Math.floor(Date.now()/1000),writers=people.slice(0,10), ui=people.slice(0,4);
const metrics={list:[],poll:[],screen:[],detail:[],report:[],runningLag:[],resultLag:[],errors:[],statuses:{},pageErrors:[]};
let inFlight=0,peak=0;
const quant=s=>{if(!s.length)return {n:0};s=[...s].sort((a,b)=>a-b);return {n:s.length,p50:Math.round(s[Math.ceil(s.length*.5)-1]),p95:Math.round(s[Math.ceil(s.length*.95)-1]),max:Math.round(s.at(-1))};};
async function bundled(src){const b=await build({stdin:{contents:src,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].contents).toString('base64'));}
try{
 await cluster.initialise();await cluster.start();pool=new Pool({host:'127.0.0.1',port,database:'postgres',user:'postgres',password,max:20,connectionTimeoutMillis:10000});
 await pool.query(`create schema auth;create schema private;create role authenticated;create role anon;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 create table profiles(id uuid primary key,status text);create table courses(id uuid primary key,status text,archived_at timestamptz);
 create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create function private.campus_community_url(text) returns boolean language sql immutable as $$select $1='' or $1 like 'https://%'$$;
 insert into courses values('${sqlid(1)}','published',null);insert into cohorts values('${sqlid(2)}','${sqlid(1)}',null);`);
 for(const f of ['20261102154425_edu_campus_private_office_jobs','20261103012334_edu_campus_office_dispatch_outbox','20261105013100_campus_personal_bot_office','20261107004756_edu_campus_office_registered_reports','20261107115635_edu_campus_student_office_connections','20261109073438_office_directory_paged_jobs','20261109074548_office_seek_indexes'])await pool.query(await readFile('supabase/migrations/'+f+'.sql','utf8'));
 await pool.query('insert into private.campus_student_reporting_enabled values(true)');
 for(const s of people){
  await pool.query("insert into profiles values($1,'active')",[s.id]);await pool.query("insert into enrollments(id,user_id,course_id,cohort_id,status) values($1,$2,$3,$4,'active')",[s.en,s.id,sqlid(1),sqlid(2)]);
  const profile={employeeId:s.employee,name:s.name+' 직원',telegramUrl:'https://t.me/local_fixture_bot',duties:'',appearanceSeed:1,seatIndex:1};
  await pool.query('insert into edu_campus_office_employees values($1,$2,$3)',[s.id,s.employee,profile]);
  await pool.query("insert into edu_campus_office_jobs(id,owner_id,enrollment_id,employee_id,objective,output_type,status,created_at) select gen_random_uuid(),$1,$2,$3,$4||n,'copy','review',now()-interval '1 day'+n*interval '1 second' from generate_series(1,201)n",[s.id,s.en,s.employee,s.name+' 이전 업무 ']);
 }
 async function as(role,id,statement,args){const c=await pool.connect();try{await c.query('begin');await c.query(role==='authenticated'?'set local role authenticated':'set local role service_role');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);const r=await c.query(statement,args);await c.query('commit');return r.rows;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 for(const s of writers){
   const v=sha(s.token),pair=(...args)=>as('authenticated',s.id,'select edu_campus_student_connection($1,$2,$3,$4,$5) as v',args).then(r=>r[0].v);
   const conn=await pair(s.en,s.employee,'pair','MS1-'+issued+'-'+v,null);const row=(await pair(s.en,null,'list',null,null)).find(x=>x.id===conn.id);
   await as('service_role',null,'select edu_campus_student_report($1,$2,$3,null,null,null)',[v,issued,row.confirmation]);
 }
 await pool.query('analyze');console.log('Ready: 200 separate owners, 40,200 historical jobs, 10 confirmed local devices');
 const {handleOffice,loadOfficeState}=await bundled("export {handleOffice} from './features/campus/office/handler';export {loadOfficeState} from './features/campus/office/repository'");
 const assets=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {OfficePanel} from './features/campus/office/panel';import {student} from './tests/campus-fixture/data';
 const root=createRoot(document.getElementById('root'));document.querySelector('button').onclick=()=>{window.openAt=performance.now();root.render(<OfficePanel snapshot={{...student,viewer:{...student.viewer,id:window.actor.id},selectedEnrollmentId:window.actor.en}} demo={false}/>)};`,resolveDir:root,loader:'tsx'},platform:'browser',format:'esm',jsx:'automatic',bundle:true,write:false,outdir:'office-qa',define:{'process.env.NODE_ENV':'"production"'}});
 const assetsByPath=new Map(assets.outputFiles.map(f=>['/'+f.path.split('/').at(-1),f.contents]));
 const rpc=(s,name,args)=>{const specs={edu_campus_office_access:['p_enrollment'],edu_campus_office_page:['p_enrollment','p_employee','p_archived','p_before','p_id'],edu_campus_office_connection:['p_enrollment']};const keys=specs[name];assert.ok(keys);return as('authenticated',s.id,'select * from '+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>args[k])).then(rows=>({data:name.endsWith('_page')?rows:rows[0][name],error:null}));};
 // Translate the repository's two selected-job PostgREST queries into bound local SQL.
 function localTable(s,table){
   const definitions={edu_campus_office_jobs:{fields:['id','employee_id','owner_id','enrollment_id','objective','material_urls','output_type','status','revision','draft_text','draft_url','review_note','error_note','created_at','updated_at'],keys:['id','owner_id','enrollment_id']},edu_campus_office_history:{fields:['id','job_id','revision','actor_type','action','status','note','draft_text','created_at'],keys:['job_id']}};
   const def=definitions[table];assert.ok(def);const filters=[],params=[];let cols=[],suffix='';
   const run=async(single)=>{const rows=await as('authenticated',s.id,'select '+cols.join(',')+' from '+table+' where '+filters.join(' and ')+suffix,params);return {data:single?(rows[0]??null):rows,error:null};};
   const q={select(v){cols=v.split(',');assert.ok(cols.every(c=>def.fields.includes(c)));return q;},eq(k,v){assert.ok(def.keys.includes(k));params.push(v);filters.push(k+'=$'+params.length);return q;},order(k,o){assert.equal(k,'revision');assert.equal(o.ascending,false);suffix=' order by revision desc';return q;},limit(n){assert.equal(n,20);suffix+=' limit 20';return run(false);},maybeSingle(){return run(true);}};return q;
 }
 const sessions=new Map(people.map(s=>[s.cookie,s]));
 server=createServer(async(req,res)=>{inFlight++;peak=Math.max(peak,inFlight);res.on('finish',()=>{inFlight--;const k=res.statusCode;metrics.statuses[k]=(metrics.statuses[k]||0)+1;});
  try{const url=new URL(req.url,'http://127.0.0.1'),s=sessions.get((req.headers.cookie||'').split('qa=')[1]);const send=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(v));};
   if(url.pathname==='/report'){assert.ok(req.method==='POST');let raw='';for await(const chunk of req)raw+=chunk;const event=JSON.parse(raw);
    const rows=await as('service_role',null,'select edu_campus_student_report($1,$2,null,$3,$4,$5) as receipt',[sha(req.headers['x-device']),issued,req.headers['x-event'],sha(raw),event]);return send(rows[0].receipt);}
   if(!s)return send({},403);const q=url.searchParams;
   if(assetsByPath.has(url.pathname))return res.writeHead(200,{'content-type':url.pathname.endsWith('css')?'text/css':'text/javascript'}).end(assetsByPath.get(url.pathname));
   if(url.pathname==='/')return res.writeHead(200,{'content-type':'text/html;charset=UTF-8'}).end('<link rel="icon" href="data:,"><link rel="stylesheet" href="/stdin.css"><button>업무 관리 열기</button><main id="root"></main><script>window.actor='+JSON.stringify({id:s.id,en:s.en})+'</script><script type="module" src="/stdin.js"></script>');
   if(url.pathname==='/api/campus/office/agents'){assert.equal((await rpc(s,'edu_campus_office_access',{p_enrollment:q.get('enrollmentId')})).data,true);
    return send({employees:(await as('authenticated',s.id,'select profile from edu_campus_office_employees where owner_id=$1 order by employee_id limit 25',[s.id])).map(x=>x.profile),next:null});}
   if(url.pathname==='/api/campus/office/dispatch'){return send({dispatches:[],connected:false});}
   if(url.pathname==='/api/campus/office'){const r=await handleOffice(new Request(url),{enabled:true,authenticate:async()=>({id:s.id}),load:(viewer,en,params)=>loadOfficeState({rpc:(name,args)=>rpc(s,name,args),from:table=>localTable(s,table)},viewer,en,params)});return send(await r.json(),r.status);}
   return send({},404);
  }catch(e){metrics.errors.push(e.message);res.writeHead(500).end();}});
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch();await Promise.all(ui.map(async(s,i)=>{const ctx=await browser.newContext({viewport:i<2?{width:1280,height:900}:{width:390,height:844}});await ctx.addCookies([{name:'qa',value:s.cookie,url:base}]);s.page=await ctx.newPage();s.page.on('pageerror',e=>metrics.pageErrors.push(e.message));await s.page.goto(base);}));
 const http=async(url,opts={})=>{const r=await fetch(base+url,{...opts,signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();};
 async function read(s,kind){const t=performance.now();const reqs=[http('/api/campus/office?enrollmentId='+s.en,{headers:{cookie:'qa='+s.cookie}})];if(kind==='list')reqs.push(http('/api/campus/office/agents?directory=1&enrollmentId='+s.en,{headers:{cookie:'qa='+s.cookie}}));
  const [data]=await Promise.all(reqs);metrics[kind].push(performance.now()-t);assert.equal(data.jobs.length,20);assert.ok(data.jobs.every(j=>j.objective.startsWith(s.name+' ')));return data;}
 const start=performance.now();const until=ms=>sleep(Math.max(0,start+ms-performance.now()));
 async function client(s){if(s.page){const p=s.page;await p.evaluate(()=>document.querySelector('button').click());await p.getByRole('heading',{name:s.name+' 이전 업무 201',exact:true}).waitFor();metrics.screen.push(await p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-window.openAt;}));
   const card=p.getByRole('button').filter({has:p.getByRole('heading',{name:s.name+' 새 공지를 작성해 주세요',exact:true})});
   await card.filter({hasText:'실행 중'}).waitFor({timeout:25000});metrics.runningLag.push(performance.now()-s.runningAt);
   await card.filter({hasText:'내 검토 필요'}).waitFor({timeout:35000});metrics.resultLag.push(performance.now()-s.resultAt);const detailStart=performance.now();await card.click();await p.getByRole('heading',{name:'검토할 초안',exact:true}).locator('..').getByText(s.name+' 공지 작성 결과입니다.',{exact:true}).waitFor();metrics.detail.push(performance.now()-detailStart);
  }else{await read(s,'list');await sleep(15000);await read(s,'poll');await sleep(15000);const latest=await read(s,'poll');if(writers.includes(s)){assert.equal(latest.jobs[0].id,s.job);assert.equal(latest.jobs[0].status,'review');}}}
 async function writer(s){for(const [index,event] of [{event:'registered',enrollmentId:s.en,objective:s.name+' 새 공지를 작성해 주세요',outputType:'copy'},{event:'accepted',expectedRevision:1},{event:'started',expectedRevision:2},{event:'draft',expectedRevision:3,draftText:s.name+' 공지 작성 결과입니다.'}].entries()){
   if(index===3)await until(18000);const env=prepareReport({...event,jobId:s.job});const post=async()=>{const t=performance.now();const r=await http('/report',{method:'POST',headers:{'x-device':s.token,'x-event':env.eventId,'content-type':'application/json'},body:env.raw});metrics.report.push(performance.now()-t);assert.equal(r.jobId,s.job);assert.equal(r.revision,index+1);};await post();
   if(index===2)s.runningAt=performance.now();if(index===3){s.resultAt=performance.now();await post();}
  }}
 const outcomes=await Promise.allSettled([...people.map(client),...writers.map(writer)]);const failures=outcomes.filter(x=>x.status==='rejected').map(x=>String(x.reason).slice(0,320));
 const verify=await pool.query(`select j.id,j.owner_id,j.status,j.revision,j.draft_text,array_agg(h.action order by h.revision) history from edu_campus_office_jobs j join edu_campus_office_history h on h.job_id=j.id where j.id=any($1::uuid[]) group by j.id`,[writers.map(s=>s.job)]);
 const bad=writers.filter(s=>{const j=verify.rows.find(x=>x.id===s.job);return !j||j.owner_id!==s.id||j.status!=='review'||j.revision!==4||j.draft_text!==s.name+' 공지 작성 결과입니다.'||j.history.join(',')!=='registered,accepted,started,draft';});
 const evidence={localOnly:true,owners:200,seedJobs:40200,chromium:4,httpUsers:196,poolSize:20,peakHttpInFlight:peak,elapsedMs:Math.round(performance.now()-start),failures,errors:metrics.errors,pageErrors:metrics.pageErrors,statuses:metrics.statuses,firstBothHttpMs:quant(metrics.list),pollMs:quant(metrics.poll),paintMs:quant(metrics.screen),screenRawMs:metrics.screen.map(Math.round),resultClickMs:quant(metrics.detail),reportMs:quant(metrics.report),runningVisibleMs:quant(metrics.runningLag),resultVisibleMs:quant(metrics.resultLag),verifiedJobs:verify.rowCount,mismatchedJobs:bad.length};
 console.log(JSON.stringify(evidence,null,2));if(process.env.QA_RESULT_FILE)await writeFile(process.env.QA_RESULT_FILE,JSON.stringify(evidence,null,2));
 assert.equal(failures.length+metrics.errors.length+metrics.pageErrors.length+bad.length,0);
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(pool)await pool.end();await cluster.stop();await rm(scratch,{recursive:true,force:true});}
