import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {setup} from './learning-notifications.mjs';
export const read=name=>fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
export async function communityFixture(t) {
 const h=await setup(t,{push:true});
 await h.owner(`alter table cohorts add column name text default '4기';
 alter table curriculum_weeks add column week_number integer default 1;
 alter table curriculum_lessons add column day_number integer default 1;
 alter table edu_questions add column course_id uuid references courses(id),add column status text default 'open',add column is_archived boolean default false,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
 create table edu_mutation_receipts(actor_id uuid,request_id uuid,target_table text,fingerprint text,result jsonb,primary key(actor_id,request_id));
 grant select,insert,update on edu_mutation_receipts to service_role;`);
 for(const file of ['20260927035640_lesson_private_questions.sql','20260928205907_question_answer_threads.sql','20260928211554_question_private_images.sql','20260929071444_question_learner_followups.sql','20260930055906_question_hub.sql'])await h.owner(fs.readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await h.owner("alter table courses add column category text default 'paid_class'; alter table cohorts add column status text default 'in_progress', add column operation_end_at timestamptz;");
 const graduate=read('20261001024207_alumni_read_mode.sql').match(/create function public\.edu_is_graduate_enrollment\([\s\S]*?\$\$;/)[0];
 await h.owner(graduate);
 await h.owner(read('20261001053500_alumni_questions.sql'));
 await h.owner(read('20261001180000_cohort_curriculum_visibility.sql'));
 // Minimal existing table needed by the progression gate; no recurring writes here.
 await h.owner('create table edu_ongoing_rules(lesson_id uuid primary key); grant select on edu_ongoing_rules to service_role;');
 await h.owner(read('20261002102052_learner_feedback_question_community.sql'));
 const create=(overrides={})=>h.rpc('edu_create_visible_question',Object.values({actor:h.student,request:id(),enrollment:h.enrollment,lesson:h.lesson,title:'공개 질문',content:'어떻게 하나요?',image:null,category:'learning',visibility:'cohort',...overrides}));
 const feed=(actor=h.student,lesson=null,enrollment=null,own=false,page=0)=>h.rpc('edu_read_cohort_questions',[actor,'',enrollment,lesson,page,own]);
 return {...h,create,feed};
}
