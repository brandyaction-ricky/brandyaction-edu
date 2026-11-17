import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('seek pages keep equal-time records distinct across employees and archives while the inbox grows', async()=>{
  const db=new PGlite(),uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  try {
    await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$ select '${uid(1)}'::uuid $$;
      create table edu_campus_office_jobs(id uuid,owner_id uuid,enrollment_id uuid,employee_id text,objective text,output_type text,status text,revision int,created_at timestamptz);
      create index office_jobs_page on edu_campus_office_jobs(id); create index office_employee_jobs_page on edu_campus_office_jobs(id);
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261109074548_office_seek_indexes.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.query(`insert into edu_campus_office_jobs select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,
      case when n=202 then 'writer' else 'editor' end,'title','copy',case when n=203 then 'archived' else 'review' end,4,'2026-11-01T00:00:00Z'
      from generate_series(1,203)n`,[uid(1),uid(2)]);
    const page=(employee,archive=false,tail=null)=>db.query('select * from edu_campus_office_page($1,$2,$3,$4,$5)',[uid(2),employee,archive,tail?.created_at??null,tail?.id??null]).then(r=>r.rows);
    const seen=[];let tail=null;
    for(let n=0;n<11;n++){
      const rows=await page('editor',false,tail);
      seen.push(...rows.slice(0,20).map(j=>j.id));
      if(n===0)await db.query("insert into edu_campus_office_jobs values($1,$2,$3,'editor','new','copy','running',3,now())",[uid(800),uid(1),uid(2)]);
      if(rows.length<=20)break;tail=rows[19];
    }
    assert.equal(seen.length,201);assert.equal(new Set(seen).size,201);assert.equal(seen.at(-1),uid(1));
    assert.equal((await page(null))[0].id,uid(800));
    assert.deepEqual((await page('writer')).map(r=>r.id),[uid(202)]);assert.deepEqual((await page('editor',true)).map(r=>r.id),[uid(203)]);
  } finally {await db.close();}
});
