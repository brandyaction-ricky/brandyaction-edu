// Fixed provider operations only. Never execute candidate scripts on this runner.
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from 'pg';
import {atomicRecord, privateFile, verifyEnvelope} from './registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const execute=promisify(execFile);
export function sourceFingerprint(tree) {
  const files=[];
  const walk=(entries,prefix='')=>{for(const entry of entries){const path=prefix+entry.name;if(entry.type==='directory')walk(entry.children||[],path+'/');else if(path.startsWith('src/'))files.push([path,entry.uid]);}};
  walk(tree); if (!files.length) throw Error('Deployment source unavailable');
  return hash(JSON.stringify(files.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)));
}
export async function createAdapter(config, envelope, {requestId, publicKey, fetcher=fetch}={}) {
  const payload=verifyEnvelope(envelope,publicKey), plan=payload.plan;
  if (config.repository!==plan.repository || config.project!==plan.project || config.productionHost!==plan.productionHost) throw Error('Unregistered target');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !/^[\w/-]+$/.test(config.branch)) throw Error('Invalid repository target');
  if (!/^prj_[A-Za-z0-9]+$/.test(config.project) || !/^team_[A-Za-z0-9]+$/.test(config.team)) throw Error('Invalid provider target');
  const rehearsal=config.mode==='rehearsal';
  const providerQa=config.mode==='provider-qa', cli=config.transport==='cli';
  if(cli&&!providerQa)throw Error('CLI credential reuse is restricted to isolated provider QA');
  for (const [name,expected] of [['vercelOrigin','https://api.vercel.com'],['githubOrigin','https://api.github.com']]) {
    const url=new URL(config[name]);
    if (rehearsal ? url.hostname!=='127.0.0.1'||url.protocol!=='http:' : config[name]!==expected) throw Error('Untrusted provider origin');
  }
  const connectionString=await privateFile(config.dbConnectionFile);
  if((rehearsal||providerQa) && new URL(connectionString.trim()).hostname!=='127.0.0.1')throw Error('QA DB must be loopback');
  const client=new Client({connectionString:connectionString.trim(),connectionTimeoutMillis:5000,statement_timeout:15000,options:'-c default_transaction_read_only=on'});
  const tokens=cli?{}:{vercel:await privateFile(config.vercelTokenFile),github:await privateFile(config.githubTokenFile)};
  await client.connect();
  const git=(...args)=>execFileSync('git',args,{cwd:config.checkout,maxBuffer:20_000_000,encoding:'utf8'});
  async function api(provider,path,method='GET') {
    const url=new URL(path,config[provider+'Origin']);
    if(provider==='vercel')url.searchParams.set('teamId',config.team);
    if(cli){
      const executable=provider==='vercel'?config.vercelCli:config.githubCli;
      if(!executable?.startsWith('/'))throw Error('Fixed installed CLI path required');
      const args=['api',url.pathname+url.search,'--method',method,...(provider==='vercel'?['--raw']:[])];
      const {stdout}=await execute(executable,args,{encoding:'utf8',timeout:30000,maxBuffer:20_000_000});
      return stdout.trim()?JSON.parse(stdout):{};
    }
    const response=await fetcher(url,{method,headers:{Authorization:`Bearer ${tokens[provider].trim()}`,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`${provider} ${method} failed (${response.status}); reconcile before retry`);
    // Promotion can acknowledge with an empty 201/202 body. Its final result is
    // independently checked through the live alias, never inferred from a body.
    if(method==='POST'||response.status===204){await response.arrayBuffer();return {};}
    return response.json();
  }
  const deployment=id=>api('vercel',`/v13/deployments/${encodeURIComponent(id)}`);
  const deploymentProject=d=>d.projectId||d.project?.id;
  async function shaOf(d,allowBase=false){
    const sha=d.gitSource?.sha||(providerQa?d.meta?.githubCommitSha:null);
    if(sha)return sha;
    if(allowBase&&d.id===plan.baseDeployment&&payload.baseAttestation?.sha===plan.base){
      const files=await api('vercel',`/v6/deployments/${d.id}/files`);
      if(sourceFingerprint(files)===payload.baseAttestation.sourceFingerprint)return plan.base;
    }
    throw Error('Deployment source is unverified');
  }
  async function fingerprint(){
    const sql=await readFile(join(here,'schema-fingerprint.sql'),'utf8');
    const {rows}=await client.query(sql);return hash(JSON.stringify(rows));
  }
  async function live(){
    const d=await deployment(config.productionHost);
    if(deploymentProject(d)!==config.project||d.target!=='production')throw Error('Live alias points to wrong target');
    return d;
  }
  async function verifyCandidate(){
    if(!/^dpl_[A-Za-z0-9]+$/.test(plan.candidateDeployment||''))throw Error('Missing prepared deployment');
    const d=await deployment(plan.candidateDeployment);
    if(deploymentProject(d)!==config.project||d.readyState!=='READY'||await shaOf(d)!==plan.candidate)throw Error('Candidate deployment mismatch');
    // Promotion must use a build made for production settings, not a preview DB.
    if(d.target!=='production')throw Error('Candidate was built for wrong environment');
  }
  async function ci(){
    if(!config.requiredChecks?.length)throw Error('Required CI registry missing');
    const checks=[];
    for(let page=1;;page++){
      const result=await api('github',`/repos/${config.repository}/commits/${plan.candidate}/check-runs?per_page=100&page=${page}`);
      checks.push(...result.check_runs);if(result.check_runs.length<100)break;if(page>=20)throw Error('CI pagination limit');
    }
    for(const name of config.requiredChecks){
      const found=checks.filter(c=>c.name===name&&c.head_sha===plan.candidate&&c.app?.id===config.actionsAppId).sort((a,b)=>b.id-a.id)[0];
      if(!found||found.status!=='completed'||found.conclusion!=='success')throw Error(`Required CI not passed: ${name}`);
    }
  }
  const writeAllowed=()=>{if(config.executionEnabled!==true)throw Error('Execution disabled pending activation approval');};
  if(providerQa){
    const project=await api('vercel',`/v9/projects/${config.project}`);
    if(project.id!==config.project||!/^brandyaction-release-qa-\d{8}$/.test(project.name)||project.link||project.env?.length){
      await client.end();throw Error('Provider QA requires a disposable unlinked project without environment variables');
    }
  }
  async function unresolved(){
    let files;try{files=await readdir(config.journalRoot);}catch(e){if(e.code==='ENOENT')return false;throw e;}
    for(const file of files.filter(f=>f.endsWith('.json'))){
      const status=JSON.parse(await privateFile(join(config.journalRoot,file)));
      if(status.state!=='complete'||file===requestId+'.json')return true;
    }
    return false;
  }
  return {
    close:()=>client.end(),databaseFingerprint:fingerprint,
    isAncestor:async(base,candidate)=>{try{git('merge-base','--is-ancestor',base,candidate);return true;}catch{return false;}},
    async observe(){
      const d=await live(),head=await api('github',`/repos/${config.repository}/git/ref/heads/${config.branch}`);
      const applied=await client.query('select version from supabase_migrations.schema_migrations order by version');
      const versions=new Set(applied.rows.map(r=>r.version));
      return {project:config.project,repository:config.repository,environment:'production',liveSha:await shaOf(d,true),liveDeployment:d.id,releaseHead:head.object.sha,dbFingerprint:await fingerprint(),pendingMigrations:plan.migrations.filter(m=>!versions.has(m.path.split('/').at(-1).slice(0,14))),unresolvedRun:await unresolved()};
    },
    async verifyApprovals(){verifyEnvelope(envelope,publicKey);await ci();await verifyCandidate();},
    async applyMigrations(migrations){
      writeAllowed();
      const migrationConnection=(await privateFile(config.migrationConnectionFile)).trim();
      const migrationUrl=new URL(migrationConnection),readUrl=new URL(connectionString.trim());
      if(rehearsal?migrationUrl.hostname!=='127.0.0.1':migrationUrl.username===readUrl.username)throw Error('Separate migration authority required');
      if(migrationUrl.host!==readUrl.host||migrationUrl.pathname!==readUrl.pathname)throw Error('Migration targets another database');
      const writer=new Client({connectionString:migrationConnection,connectionTimeoutMillis:5000,statement_timeout:15000});
      await atomicRecord(config.journalRoot,requestId,{state:'started',phase:'sql',plan});
      try{
        await writer.connect();await writer.query('begin');
        for(const m of migrations){
          let sql=git('show',`${plan.candidate}:${m.path}`);
          if(hash(sql)!==m.sha256)throw Error('SQL blob changed');
          sql=sql.replace(/^\s*begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
          if(/\b(?:begin|commit|rollback)\s*;/i.test(sql))throw Error('Migration transaction control requires separate review');
          await writer.query(sql);
          const filename=m.path.split('/').at(-1);
          await writer.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[filename.slice(0,14),filename.slice(15,-4),[git('show',`${plan.candidate}:${m.path}`)]]);
        }
        await writer.query('commit');
      }catch(error){await writer.query('rollback').catch(()=>{});throw error;}finally{await writer.end();}
    },
    async promote(){
      writeAllowed();await verifyCandidate();
      const current=await live(),head=await api('github',`/repos/${config.repository}/git/ref/heads/${config.branch}`);
      if(current.id!==plan.baseDeployment||await shaOf(current,true)!==plan.base||head.object.sha!==plan.candidate)throw Error('Production or release head changed before promotion');
      if(await fingerprint()!==plan.dbAfter)throw Error('Database changed before promotion');
      verifyEnvelope(envelope,publicKey);
      await atomicRecord(config.journalRoot,requestId,{state:'started',phase:'promotion',plan});
      await api('vercel',`/v10/projects/${config.project}/promote/${plan.candidateDeployment}`,'POST');
    },
    async verifyLive(){
      // No automatic rollback: DB/code recovery is a separate reviewed request.
      let d;
      for(let i=0;i<30;i++){d=await live();if(d.id===plan.candidateDeployment&&d.readyState==='READY')break;await new Promise(resolve=>setTimeout(resolve,1000));}
      const sha=await shaOf(d);if(d.id!==plan.candidateDeployment)throw Error('Promotion did not settle');
      const url=new URL(config.smokeUrl);
      if(rehearsal?url.hostname!=='127.0.0.1':url.protocol!=='https:'||url.hostname!==config.productionHost)throw Error('Invalid smoke target');
      const response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
      const body=response.ok?await response.json():{};
      return {sha,ready:d.readyState==='READY',smoke:response.ok&&body.ok===true&&body.release===sha.slice(0,12)?'passed':'failed',deployment:d.id};
    },
    async recordComplete(result){await atomicRecord(config.journalRoot,requestId,{state:'complete',plan,result,completedAt:new Date().toISOString()});},
  };
}
