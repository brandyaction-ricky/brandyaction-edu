import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {fixture,document} from './lesson-block-review.mjs';
const sql=readFileSync(new URL('../../supabase/migrations/20261001065746_lesson_author_drafts.sql',import.meta.url),'utf8');
export async function setup(database){
 const f=await fixture(document,database);await f.db.exec('reset role');
 await f.db.exec(`alter table curriculum_lessons add column day_number integer not null default 1,add column description text,add column duration_label text,add column content_type text not null default 'text',add column is_preview boolean not null default false,add column display_order integer not null default 0,add column updated_at timestamptz not null default now();
 alter table curriculum_lessons add constraint lesson_day unique(week_id,day_number);
 alter table lesson_contents add column vod_url text,add column external_url text,add column resource_storage_path text,add column resource_name text,add column updated_at timestamptz not null default now();
 alter table lesson_contents add constraint content_kind check(num_nonnulls(body_text,vod_url,external_url,resource_storage_path)=1);
 create table audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 grant select,insert on audit_logs to service_role;
 create function mission_operator_allowed(actor uuid, scope text) returns boolean language sql as $$ select exists(select 1 from public.profiles where id=actor and role='admin' and status='active') $$;`);
 await f.db.exec(sql);await f.db.exec(readFileSync(new URL('../../supabase/migrations/20261005090119_lesson_author_conflict_backups.sql',import.meta.url),'utf8'));await f.db.exec('set role service_role');
 const read=async(lesson=f.lesson,actor=f.admin,version=null)=>(await f.db.query('select edu_read_lesson_author($1,$2,$3) as v',[actor,lesson,version])).rows[0].v;
 const save=async(payload,snapshot,opts={})=>(await f.db.query('select edu_save_lesson_author($1,$2,$3,$4,$5,$6,$7,$8) as v',[opts.actor||f.admin,opts.lesson||f.lesson,snapshot.revision,opts.request||id(),snapshot.public.stamp,payload,opts.create||false,opts.rebase||false])).rows[0].v;
 const publish=async(revision,request=id(),actor=f.admin)=>(await f.db.query('select edu_publish_lesson_author($1,$2,$3,$4) as v',[actor,f.lesson,revision,request])).rows[0].v;
 return{...f,read,save,publish};
}
