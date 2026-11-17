import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {privateFile} from './registry.mjs';

export const MIGRATION_VERSIONS_QUERY='select version from supabase_migrations.schema_migrations order by version';
// No arbitrary SQL, customer rows, writable endpoint, redirect, or provider URL.
export async function createMetadataReader(config, fetcher=fetch) {
  if(config.mode!=='production'||config.supabaseProjectRef!=='qitqxizuwmmlhlcgsrqe')throw Error('Unregistered metadata database');
  const token=(await privateFile(config.supabaseReadTokenFile)).trim();
  const fingerprint=await readFile(fileURLToPath(new URL('./schema-fingerprint.sql',import.meta.url)),'utf8');
  const allowed=new Set([fingerprint,MIGRATION_VERSIONS_QUERY]);
  return {
    async connect(){},async end(){},
    async query(sql){
      if(!allowed.has(sql))throw Error('Only installed metadata queries are allowed');
      const response=await fetcher('https://api.supabase.com/v1/projects/qitqxizuwmmlhlcgsrqe/database/query/read-only',{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({query:sql}),redirect:'error',signal:AbortSignal.timeout(20000),
      });
      if(!response.ok)throw Error(`Metadata read failed (${response.status})`);
      const rows=await response.json();if(!Array.isArray(rows))throw Error('Unexpected metadata response');
      return {rows};
    },
  };
}
