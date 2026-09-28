import { randomUUID as id } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './lesson-block-review.mjs';
export function batchFor(courseId,days=2){
 const weeks=Array.from({length:Math.ceil(days/5)},(_,i)=>({id:id(),number:i+2,title:`원본 ${i+1}주차`,goal:'학습 목표',existing:false}));
 const lessons=[];
 for(const track of ['daily','learning'])for(let day=1;day<=days;day++)lessons.push({id:id(),revision:id(),sourceKey:`${track}:${day}`,weekId:weeks[Math.floor((day-1)/5)].id,order:(day-1)%5+(track==='daily'?1:6),title:`${track} ${day}`,description:'',durationLabel:'10분',provenance:{sourceWeek:Math.ceil(day/5),sourceDay:day,metadata:{tag:'기존 태그'},mapping:[],checklistMapping:[]},document:{schemaVersion:1,blocks:[{id:'text',type:'text',content:`${track} 원문 ${day}`}],checklist:[],progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}}});
 return {formatVersion:1,courseId,sourceDigest:'a'.repeat(64),sourceCapturedAt:'2026-09-29T00:00:00Z',weeks,lessons,media:[]};
}
export async function importFixture(){
 const f=await fixture();try{await f.db.exec('reset role');
 await f.db.exec(`alter table curriculum_weeks add column week_number integer not null default 1, add column title text not null default '기존 주차',add column goal text,add column display_order integer default 0;
 alter table curriculum_weeks add unique(course_id,week_number);
 alter table curriculum_lessons add column day_number integer not null default 1,add column description text,add column duration_label text,add column display_order integer default 0,add column content_type text default 'text',add column is_preview boolean default false,add column access_mode text default 'enrolled';
 alter table curriculum_lessons add unique(week_id,day_number);`);
 await f.db.exec(readFileSync(new URL('../../supabase/migrations/20260928181955_lesson_curriculum_import_batches.sql',import.meta.url),'utf8'));
 await f.db.exec(readFileSync(new URL('../../supabase/migrations/20260928184735_ongoing_lesson_periods.sql',import.meta.url),'utf8'));
 await f.db.exec(readFileSync(new URL('../../supabase/migrations/20260928191618_ongoing_curriculum_import_and_review.sql',import.meta.url),'utf8'));
 await f.db.exec('set role service_role');
 return {...f,run:async(batch,request=id(),apply=false,actor=f.admin)=>(await f.db.query('select edu_import_lesson_batch($1,$2,$3,$4) as result',[actor,request,batch,apply])).rows[0].result};
 }catch(error){await f.db.close();throw error;}
}
