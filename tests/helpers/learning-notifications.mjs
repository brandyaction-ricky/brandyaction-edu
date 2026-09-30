import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture, document } from './lesson-block-review.mjs';
export async function setup(t,{enabled=true,push=false,daily=false,feedback=true}={}){
 const h=await fixture({...document,...(daily?{progression:{track:'daily',dayNumber:1}}:{}),completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true}});t.after(()=>h.db.close());
 const owner=async(sql,args=[])=>{await h.db.exec('reset role');try{return args.length?await h.db.query(sql,args):await h.db.exec(sql);}finally{await h.db.exec('set role service_role');}};
 await owner(`alter table profiles add column email text;
 alter table curriculum_missions add column title text;
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 create table edu_questions(id uuid primary key default gen_random_uuid(),user_id uuid,title text,content text,answer text);
 create table mission_submissions(id uuid primary key,enrollment_id uuid,mission_id uuid,status text,reviewer_feedback text,reviewed_at timestamptz,reviewed_by uuid);
 create table audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb);
 grant select,insert,update on edu_questions,mission_submissions,audit_logs,edu_ongoing_completions to service_role;`);
 for(const file of ['20260925221921_submission_review_audit.sql','20260928194336_edu_member_messages.sql','20260928200320_edu_web_push_delivery.sql','20260928203235_edu_learning_notifications.sql',...(feedback?['20260928204904_lesson_block_feedback_notes.sql']:[])])await owner(fs.readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 if(enabled)await owner('update edu_learning_notice_control set enabled=true');
 if(push){await owner('update edu_push_control set enabled=true');for(const who of [h.admin,h.student])await h.db.query('select edu_register_push($1,$2,$3,$4)',[who,'https://fcm.googleapis.com/fcm/send/'+who,'A'.repeat(87),'B'.repeat(22)]);}
 const rpc=async(name,args=[]) => (await h.db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 const inbox=(actor=h.student)=>rpc('edu_list_member_messages',[actor,'inbox',null]);
 const unread=(actor=h.student)=>rpc('edu_unread_member_messages',[actor]);
 const question=async(content='질문 원문')=>{const q=id();await h.db.query('insert into edu_questions values($1,$2,$3,$4,null)',[q,h.student,'질문 제목',content]);return q;};
 const answer=(q,body='답변 원문')=>h.db.query('update edu_questions set answer=$1 where id=$2',[body,q]);
 const decide=(s,decision='approved',feedback='좋습니다',request=id())=>rpc('edu_decide_lesson_blocks',[h.admin,s.id,s.stateId,request,decision,feedback]);
 const count=async(table)=>(await h.db.query(`select count(*)::integer n from ${table}`)).rows[0].n;
 return{...h,owner,rpc,inbox,unread,question,answer,decide,count};
}
