// Disposable localhost PostgreSQL + real PostgREST. No hosted URLs or credentials.
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import EmbeddedPostgres from 'embedded-postgres';
import {build} from 'esbuild';

const here=dirname(fileURLToPath(import.meta.url)), repo=resolve(here,'../..');
const port=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const dir=await mkdtemp(join(tmpdir(),'edu-db-contract-'));
const dbPort=await port(),apiPort=await port(),secret=randomBytes(32).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:join(dir,'data'),user:'postgres',password:secret,port:dbPort,persistent:true,autoRehydrateSymlinks:true,createPostgresUser:false,postgresFlags:['-h','127.0.0.1','-k',dir],onLog:()=>{},onError:()=>{}});
let db,server;
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const jwt=(role,sub)=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({role,sub,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return `${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;};
const binary=process.env.POSTGREST_BIN || join(here,'.bin/postgrest');
const localEnv={PATH:process.env.PATH,LANG:'C.UTF-8',PGRST_DB_URI:`postgres://postgres:${secret}@127.0.0.1:${dbPort}/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(apiPort),PGRST_LOG_LEVEL:'crit'};
if(process.platform==='darwin')localEnv.DYLD_LIBRARY_PATH=join(here,`node_modules/@embedded-postgres/darwin-${process.arch}/native/lib`);
async function startApi(){
  server=spawn(binary,[],{env:localEnv,stdio:['ignore','ignore','pipe']});let error;
  server.on('error',e=>{error=e;});server.stderr.resume();
  for(let n=0;n<100;n++){
    if(error)throw error;if(server.exitCode!==null)throw Error('PostgREST failed to start');
    try {const r=await fetch(`http://127.0.0.1:${apiPort}/`,{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}
    await delay(50);
  }throw Error('Local PostgREST readiness timed out');
}
async function stopApi(){if(!server||server.exitCode!==null)return;const exit=once(server,'exit');server.kill('SIGTERM');await exit;}
const request=async(select,token=jwt('authenticated',uid(1)),id=uid(30))=>{
  const url=new URL(`http://127.0.0.1:${apiPort}/enrollments`);url.searchParams.set('select',select);url.searchParams.set('id',`eq.${id}`);
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});return {status:r.status,body:await r.json()};
};
try {
  await pg.initialise();await pg.start();db=pg.getPgClient();await db.connect();
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table public.courses(id uuid primary key,status text,archived_at timestamptz);
    create table public.cohorts(id uuid primary key,course_id uuid references courses(id),archived_at timestamptz);
    create table public.enrollments(id uuid primary key,user_id uuid not null,cohort_id uuid references cohorts(id),course_id uuid references courses(id),status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
    create table public.curriculum_lessons(id uuid primary key);
    alter table courses enable row level security;alter table cohorts enable row level security;alter table enrollments enable row level security;alter table curriculum_lessons enable row level security;
    create policy own_enrollment on enrollments for select to authenticated using(user_id=auth.uid());
    create policy own_course on courses for select to authenticated using(exists(select 1 from enrollments e where e.course_id=courses.id));
    create policy own_cohort on cohorts for select to authenticated using(exists(select 1 from enrollments e where e.cohort_id=cohorts.id));
    grant select on courses,cohorts,enrollments to authenticated;
    insert into courses values('${uid(10)}','published',null);
    insert into cohorts values('${uid(20)}','${uid(10)}',null);
    insert into enrollments values('${uid(30)}','${uid(1)}','${uid(20)}','${uid(10)}','active',null,'2020-01-01',null);`);
  const source=await readFile(join(repo,'app/api/campus/welcome/route.ts'),'utf8');
  const current=source.match(/from\('enrollments'\)\.select\('([^']+)'\)/)?.[1];
  assert.ok(current,'Cannot find the real welcome route enrollment query');
  const old=current.replace('cohorts!enrollments_cohort_id_fkey(', 'cohorts(');
  assert.notEqual(old,current,'Expected explicit production relationship fix');
  await startApi();
  assert.equal((await request(old)).status,200,'old code + old DB');
  assert.equal((await request(current)).status,200,'new code + old DB');
  await stopApi();
  const migration=await readFile(join(repo,'supabase/migrations/20261112123400_preserve_open_lessons.sql'),'utf8');
  const ddl=migration.slice(migration.indexOf('create table public.edu_preserved_lesson_access'),migration.indexOf('create function edu_private.store_lesson_access'));
  assert.match(ddl,/primary key \(enrollment_id,cohort_id,lesson_id,legacy\)/);
  await db.query(ddl);await startApi(); // fresh real schema cache, not a mocked join
  const broken=await request(old);
  assert.equal(broken.status,300);assert.equal(broken.body.code,'PGRST201','old code + new DB must expose the incident');
  const fixed=await request(current);assert.equal(fixed.status,200);assert.equal(fixed.body.length,1);
  assert.deepEqual(fixed.body[0].cohorts,{archived_at:null});
  assert.deepEqual((await request(current,jwt('authenticated',uid(2)))).body,[],'another learner cannot read enrollment');
  assert.equal((await request(current,jwt('anon'))).status,401,'anon has no grant');
  const compiled=await build({entryPoints:[join(repo,'features/campus/entry.ts')],bundle:true,platform:'node',format:'esm',write:false});
  const {campusEntry}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  assert.ok(campusEntry(fixed.body[0],uid(1),uid(20)));
  await db.query("update enrollments set status='revoked',revoked_at=now()");
  const revoked=await request(current);assert.equal(campusEntry(revoked.body[0],uid(1),uid(20)),null);
  console.log(JSON.stringify({engine:'PostgreSQL 17 + PostgREST 16.6',scope:'real welcome enrollment query + exact access-table DDL; isolated synthetic fixture, not full production schema',oldCodeOldDb:'passed',newCodeOldDb:'passed',oldCodeNewDb:'blocked: PGRST201 (expected regression)',newCodeNewDb:'passed',foreignLearner:'denied',anonymous:'denied',revokedEnrollment:'denied',hostedWrites:0}));
} finally {
  await stopApi();if(db)await db.end();await pg.stop();await rm(dir,{recursive:true,force:true});
}
