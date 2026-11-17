import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export function auditMigrations(source, applied) {
  const errors=[],versions=new Map(),ledger=new Map();
  for(const file of source){
    const version=file.path.match(/^supabase\/migrations\/(\d{14})_[a-zA-Z0-9_-]+\.sql$/)?.[1];
    if(!version||versions.has(version))errors.push('invalid-or-duplicate-source-version');
    else versions.set(version,file);
    if(!/^[a-f0-9]{64}$/.test(file.sha256||''))errors.push('source-content-unverified');
  }
  for(const row of applied){
    if(!/^\d{14}$/.test(row.version)||ledger.has(row.version))errors.push('invalid-or-duplicate-applied-version');
    ledger.set(row.version,row);
    const file=versions.get(row.version);
    if(!file)errors.push(`applied-migration-missing:${row.version}`);
    else if(!/^[a-f0-9]{64}$/.test(row.sha256||''))errors.push(`applied-content-unverified:${row.version}`);
    else if(file.sha256!==row.sha256)errors.push(`applied-content-changed:${row.version}`);
  }
  return {ok:errors.length===0,errors,pending:errors.length?[]:source.filter(f=>!ledger.has(f.path.match(/\/(\d{14})_/)?.[1])).sort((a,b)=>a.path.localeCompare(b.path))};
}

// Reads blobs from a full immutable commit, never working-tree SQL or the network.
export function sourceMigrations(checkout,commit){
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Full commit required');
  const git=(...args)=>execFileSync('git',args,{cwd:checkout,encoding:'utf8'});
  return git('ls-tree','-r','--name-only',commit,'--','supabase/migrations').trim().split('\n').filter(p=>p.endsWith('.sql')).map(path=>({path,sha256:createHash('sha256').update(git('show',`${commit}:${path}`)).digest('hex')}));
}
