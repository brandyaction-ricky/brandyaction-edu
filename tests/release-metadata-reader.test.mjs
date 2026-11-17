import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMetadataReader,MIGRATION_VERSIONS_QUERY} from '../tools/release-guard/metadata-reader.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'metadata-reader-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const path=join(root,'token');await writeFile(path,'test-only-credential',{mode:0o600});
 return {mode:'production',supabaseProjectRef:'qitqxizuwmmlhlcgsrqe',supabaseReadTokenFile:path};
}
test('metadata uses the fixed read-only project endpoint and exact installed queries',async t=>{
 const calls=[],reader=await createMetadataReader(await fixture(t),async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>[{version:'20261112123400'}]};});
 assert.deepEqual((await reader.query(MIGRATION_VERSIONS_QUERY)).rows,[{version:'20261112123400'}]);
 await reader.query(await readFile(new URL('../tools/release-guard/schema-fingerprint.sql',import.meta.url),'utf8'));
 assert.equal(calls.length,2);
 for(const {url,options} of calls){assert.equal(url,'https://api.supabase.com/v1/projects/qitqxizuwmmlhlcgsrqe/database/query/read-only');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-only-credential');}
});
test('customer reads and SQL writes never reach the network',async t=>{
 let calls=0;const reader=await createMetadataReader(await fixture(t),async()=>{calls++;throw Error('unexpected network');});
 for(const sql of ['select * from public.profiles','delete from public.orders',MIGRATION_VERSIONS_QUERY+'; select 1','set default_transaction_read_only=off'])await assert.rejects(reader.query(sql),/installed metadata/);
 assert.equal(calls,0);
});
test('wrong project or mode is refused before reading credentials',async()=>{
 for(const config of [{mode:'production',supabaseProjectRef:'other'},{mode:'rehearsal',supabaseProjectRef:'qitqxizuwmmlhlcgsrqe'}])await assert.rejects(createMetadataReader(config),/Unregistered/);
});
test('permission errors and malformed provider responses fail closed without fallback',async t=>{
 const config=await fixture(t);
 const denied=await createMetadataReader(config,async()=>({ok:false,status:403}));await assert.rejects(denied.query(MIGRATION_VERSIONS_QUERY),/403/);
 const malformed=await createMetadataReader(config,async()=>({ok:true,json:async()=>({error:'bad'})}));await assert.rejects(malformed.query(MIGRATION_VERSIONS_QUERY),/Unexpected/);
});
