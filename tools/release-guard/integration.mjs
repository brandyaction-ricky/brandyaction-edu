// End-to-end LOCAL rehearsal: actual runner process, signed registry, Git,
// PostgreSQL and HTTP transport. Provider HTTP is simulated; no hosted writes.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,sign,createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createServer as createTcpServer} from 'node:net';
import {once} from 'node:events';
import {execFileSync,spawn} from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';
import {digest,REQUIRED} from './gate.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=await mkdtemp(join(tmpdir(),'release-integration-'));
const checkout=join(root,'checkout');await mkdir(checkout);
const socket=createTcpServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const password=randomBytes(24).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:join(root,'pg'),user:'postgres',password,port,persistent:true,autoRehydrateSymlinks:true,createPostgresUser:false,postgresFlags:['-h','127.0.0.1','-k',root],onLog:()=>{},onError:()=>{}});
let db,server,base,candidate;const calls=[];let live='dpl_base',promotionFails=false;
const git=(...args)=>execFileSync('git',args,{cwd:checkout,encoding:'utf8'}).trim();
const hash=s=>createHash('sha256').update(s).digest('hex');
const results=[];
try{
 await pg.initialise();await pg.start();db=pg.getPgClient();await db.connect();
 await db.query('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]); create table public.example(id int primary key)');
 await mkdir(join(checkout,'supabase/migrations'),{recursive:true});
 git('init','-b','main');git('config','user.name','Isolated QA');git('config','user.email','qa@example.invalid');
 await writeFile(join(checkout,'baseline.txt'),'baseline');git('add','baseline.txt');git('commit','-m','baseline');base=git('rev-parse','HEAD');
 const migrationPath='supabase/migrations/20261117010000_fixture.sql',sql='create table public.release_fixture(id integer primary key);\n';
 await writeFile(join(checkout,migrationPath),sql);git('add',migrationPath);git('commit','-m','candidate');candidate=git('rev-parse','HEAD');
 const schemaSql=await readFile(join(here,'schema-fingerprint.sql'),'utf8');
 const fingerprint=async()=>hash(JSON.stringify((await db.query(schemaSql)).rows));
 const dbBefore=await fingerprint();
 await db.query('begin');await db.query(sql);await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['20261117010000','fixture',[sql]]);const dbAfter=await fingerprint();await db.query('rollback');
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 await writeFile(join(root,'key.pem'),publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 await writeFile(join(root,'token'),'local-rehearsal-only',{mode:0o600});
 await writeFile(join(root,'db'),`postgres://postgres:${password}@127.0.0.1:${port}/postgres`,{mode:0o600});
 const deployment=id=>({id,projectId:'prj_fixture',target:'production',readyState:'READY',gitSource:{sha:id==='dpl_base'?base:candidate}});
 server=createServer((req,res)=>{calls.push(req.method+' '+req.url);res.setHeader('Content-Type','application/json');
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/health'){res.end(JSON.stringify({ok:true,release:(live==='dpl_base'?base:candidate).slice(0,12)}));return;}
  if(req.headers.authorization!=='Bearer local-rehearsal-only'){res.writeHead(401);res.end('{}');return;}
  if(path.startsWith('/v13/deployments/')){res.end(JSON.stringify(deployment(path.endsWith('fixture.invalid')?live:path.split('/').at(-1))));return;}
  if(path.endsWith('/git/ref/heads/main')){res.end(JSON.stringify({object:{sha:candidate}}));return;}
  if(path.endsWith('/check-runs')){res.end(JSON.stringify({check_runs:[{id:1,name:'required-ci',head_sha:candidate,app:{id:1},status:'completed',conclusion:'success'}]}));return;}
  if(req.method==='POST'&&path==='/v10/projects/prj_fixture/promote/dpl_candidate'){live='dpl_candidate';res.writeHead(promotionFails?503:200);res.end('{}');return;}
  res.writeHead(404);res.end('{}');
 });server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 const config={mode:'rehearsal',executionEnabled:true,repository:'qa/repo',project:'prj_fixture',team:'team_fixture',branch:'main',productionHost:'fixture.invalid',vercelOrigin:origin,githubOrigin:origin,smokeUrl:origin+'/health',actionsAppId:1,requiredChecks:['required-ci'],checkout,dbConnectionFile:join(root,'db'),vercelTokenFile:join(root,'token'),githubTokenFile:join(root,'token'),approvalPublicKeyFile:join(root,'key.pem'),requestRoot:join(root,'requests'),journalRoot:join(root,'journal'),lockRoot:join(root,'locks')};
 await mkdir(config.requestRoot,{mode:0o700});
 const configPath=join(root,'config.json');
 const run=async(id,mode='--execute')=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[join(here,'run-request.mjs'),configPath,id,mode],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
 async function prepare(id,{migration=false,enabled=true}={}){
  live='dpl_base';calls.length=0;
  const plan={version:1,environment:'production',project:config.project,repository:config.repository,productionHost:config.productionHost,base,candidate,baseDeployment:'dpl_base',candidateDeployment:'dpl_candidate',dbBefore,dbAfter:migration?dbAfter:dbBefore,migrations:migration?[{path:migrationPath,sha256:hash(sql)}]:[]};
  const evidence={planDigest:digest(plan),completedAt:Date.now(),checks:REQUIRED.map(id=>({id,candidate,base,dbBefore,dbAfter:plan.dbAfter,status:'passed',passed:1,failed:0,skipped:0,cancelled:0}))};
  const payload={plan,evidence,expiresAt:Date.now()+60000,approvals:{code:digest(plan),sql:digest(plan)}};
  const envelope={payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')};
  await writeFile(configPath,JSON.stringify({...config,executionEnabled:enabled}),{mode:0o600});await writeFile(join(config.requestRoot,id+'.json'),JSON.stringify(envelope),{mode:0o600});return envelope;
 }
 await prepare('disabled',{enabled:false});assert.notEqual((await run('disabled')).code,0);assert.equal(calls.length,0);results.push('activation disabled: zero provider/DB writes');
 await prepare('preflight');const preflight=await run('preflight','--preflight');assert.equal(preflight.code,0,preflight.output);assert.equal(calls.filter(c=>c.startsWith('POST')).length,0);results.push('real child preflight: HTTP + DB read, zero promotion');
 const tampered=await prepare('tampered');tampered.payload.plan.candidate=base;await writeFile(join(config.requestRoot,'tampered.json'),JSON.stringify(tampered));assert.notEqual((await run('tampered')).code,0);assert.equal(calls.length,0);results.push('tampered signed request blocked');
 await prepare('success');let result=await run('success');assert.equal(result.code,0,result.output);assert.equal(live,'dpl_candidate');assert.equal(JSON.parse(await readFile(join(config.journalRoot,'success.json'),'utf8')).state,'complete');await assert.rejects(access(join(config.lockRoot,'production.lock')));results.push('code promotion + live check + durable completion');
 assert.notEqual((await run('success')).code,0);results.push('completed request cannot replay');
 await prepare('migration',{migration:true});result=await run('migration');assert.equal(result.code,0,result.output);assert.equal(await fingerprint(),dbAfter);assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);results.push('real transaction applies SQL + history once before promotion');
 await db.query('drop table public.release_fixture; delete from supabase_migrations.schema_migrations');
 await prepare('uncertain');promotionFails=true;result=await run('uncertain');assert.notEqual(result.code,0);await access(join(config.lockRoot,'production.lock'));assert.equal(JSON.parse(await readFile(join(config.journalRoot,'uncertain.json'),'utf8')).state,'started');const before=calls.filter(c=>c.startsWith('POST')).length;assert.notEqual((await run('uncertain')).code,0);assert.equal(calls.filter(c=>c.startsWith('POST')).length,before);results.push('provider applied then errored: persistent lock, no retry write');
 console.log(JSON.stringify({passed:true,checks:results,provider:'loopback HTTP simulator',database:'real isolated PostgreSQL',hostedWrites:0}));
}finally{
 if(server)await new Promise(r=>server.close(r));if(db)await db.end();await pg.stop();await rm(root,{recursive:true,force:true});
}
