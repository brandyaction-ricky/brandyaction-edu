import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {fixture,document} from './lesson-block-review.mjs';
const file=name=>fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const table=(sql,name)=>sql.match(new RegExp(`create table (?:if not exists )?public\\.${name} \\([\\s\\S]+?\\n\\);`,'i'))[0];
export const migration=file('20260928215751_copy_interactive_curriculum.sql');
export async function setup(t,{upgrade=true}={}){
 const f=await fixture({...document,completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true}});t.after(()=>f.db.close());
 const owner=async(sql,args=[])=>{await f.db.exec('reset role');try{return args.length?await f.db.query(sql,args):await f.db.exec(sql);}finally{await f.db.exec('set role service_role');}};
 await owner(`alter table courses add column status text default 'published',add column category text default 'paid_class',add column metadata jsonb default '{}',add column updated_at timestamptz default now();
 alter table curriculum_weeks add column week_number integer default 1,add column title text default '주차',add column goal text,add column display_order integer default 0;
 alter table curriculum_lessons add column day_number integer default 1,add column description text,add column content_type text default 'text',add column duration_label text,add column is_preview boolean default false,add column display_order integer default 0,add column access_mode text default 'enrolled';
 alter table lesson_contents add column vod_url text,add column resource_name text,add column resource_storage_path text,add column external_url text;
 alter table curriculum_missions add column title text,add column is_required boolean default true,add column submission_type text,add column is_published boolean default false,add column archived_at timestamptz,add column form_schema jsonb;
 ${table(file('20260908070719_admin_content_and_quiz_workflows.sql'),'mission_quizzes')}
 ${table(file('20260911100000_edu_qa_integrity.sql'),'edu_mutation_receipts')}
 create table audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,after_data jsonb);
 grant select,insert,update on mission_quizzes,edu_mutation_receipts,audit_logs to service_role;`);
 await owner(file('20260928184735_ongoing_lesson_periods.sql'));
 await owner(file('20260927031849_copy_product_curriculum.sql'));
 if(upgrade)await owner(migration);
 const rpc=async(name,args=[])=>(await f.db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 const target=async()=>{const key=id();await f.db.query("insert into courses(id,title,status,metadata) values($1,'새 과정','draft','{\"ownSetting\":true}')",[key]);return key;};
 const preview=(source=f.course,actor=f.admin)=>rpc('edu_preview_curriculum_copy',[actor,source]);
 const copy=async({to,source=f.course,actor=f.admin,request=id(),revision}={})=>rpc('edu_copy_product_curriculum',[actor,request,source,to,revision||(await preview(source,actor)).revision]);
 const asset=async(kind='image')=>{const ext={image:'png',audio:'mp3',video:'mp4'}[kind],mime={image:'image/png',audio:'audio/mpeg',video:'video/mp4'}[kind];const a=await rpc('edu_prepare_lesson_media',[f.admin,f.course,id(),{name:'자료.'+ext,size:8,kind,extension:ext,contentType:mime}]);await rpc('edu_complete_lesson_media',[f.admin,a.id,'a'.repeat(64)]);return a.id;};
 const save=async(lesson,doc)=>{const head=(await f.db.query('select revision from edu_lesson_block_heads where lesson_id=$1',[lesson])).rows[0]?.revision||null;const next=id();await rpc('edu_save_lesson_blocks',[f.admin,lesson,head,next,doc]);return next;};
 const lesson=async(title,doc,day=2)=>{const key=id();await f.db.query('insert into curriculum_lessons(id,week_id,title,day_number,is_published) values($1,$2,$3,$4,true)',[key,f.week,title,day]);await save(key,doc);return key;};
 const docs=async(course=f.course)=>(await f.db.query('select l.id,l.title,l.is_published,l.is_preview,w.is_published as week_public,h.revision,v.document,r.cadence from curriculum_weeks w join curriculum_lessons l on l.week_id=w.id left join edu_lesson_block_heads h on h.lesson_id=l.id left join edu_lesson_block_versions v on v.id=h.revision left join edu_ongoing_rules r on r.lesson_id=l.id where w.course_id=$1 order by l.day_number,l.id',[course])).rows;
 return{...f,owner,rpc,target,preview,copy,asset,save,lesson,docs,lessonId:f.lesson};
}
