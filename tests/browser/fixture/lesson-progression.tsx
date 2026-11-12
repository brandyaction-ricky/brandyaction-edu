import { Classroom } from '../../../app/ui/final/classroom';
import { LessonProgressionSettings } from '../../../app/ui/final/lesson-progression-settings';
import { withExistingCohortVisibility } from './cohort-visibility';
const id=(n:number)=>`aaaaaaac-1111-4111-8111-${String(n).padStart(12,'0')}`;
export function LessonProgressionFixture(){
 const cohorts=[{id:id(3),course_id:id(2),name:'진행 시험 4기'},{id:id(30),course_id:id(2),name:'진행 시험 5기'}];
 if(new URLSearchParams(location.search).has('settings'))return <main className="edu-admin" style={{padding:16}}><LessonProgressionSettings cohorts={cohorts}/></main>;
 if(new URLSearchParams(location.search).has('middleInserted')) {
  const lessons=[
   {id:id(10),week_id:id(6),day_number:2,title:'추가된 준비 수업'},
   {id:id(11),week_id:id(6),day_number:1,title:'이미 완료한 수업'},
   {id:id(12),week_id:id(6),day_number:3,title:'기존 다음 수업'},
   {id:id(13),week_id:id(6),day_number:4,title:'이후 잠긴 수업'},
  ].map(lesson=>({...lesson,is_published:true,content_type:'text'}));
  const data=withExistingCohortVisibility({enrollments:[{id:id(1),course_id:id(2),cohort_id:id(3),status:'active'}],courses:[{id:id(2),title:'수업 추가 진도 검수'}],cohorts,
   curriculum_weeks:[{id:id(5),course_id:id(2),week_number:0,title:'준비',is_published:true},{id:id(6),course_id:id(2),week_number:2,title:'실행',is_published:true}],curriculum_lessons:lessons,
   preserved_lesson_access:[{id:id(12),lesson_id:id(12)}],
   lesson_progress:[11].map(n=>({id:id(n+100),enrollment_id:id(1),lesson_id:id(n),completed_at:'2026-11-01T00:00:00Z'})),
   lesson_contents:lessons.map(lesson=>({id:lesson.id,lesson_id:lesson.id,body_text:lesson.title+' 본문'}))});
  const selected=Number(new URLSearchParams(location.search).get('target')||12);
  return <main className="edu-front" style={{padding:16}}><Classroom path={['learn',id(1),id(selected)]} data={data} pending={false} loading={false} missionId={null} blockLearningEnabled={false} send={async()=>({})}/></main>;
 }
 const longList=new URLSearchParams(location.search).has('long');
 const lessons=[['데일리 첫날',1],['데일리 둘째 날',2],['별도 학습 첫날',1],['별도 학습 둘째 날',2]].map(([title,day],index)=>({id:id(index+10),week_id:id(index<2?5:6),title,day_number:index<2?day:Number(day)+10,is_published:true,content_type:'text'}));
 if(longList) for(let n=15;n<=34;n++) lessons.push({id:id(n),week_id:id(5),title:`합성 학습 ${n}`,day_number:n,is_published:true,content_type:'text'});
 lessons.push({id:id(14),week_id:id(5),title:'기존 오리엔테이션',day_number:99,is_published:true,content_type:'text'});
 const data={enrollments:[{id:id(1),course_id:id(2),cohort_id:id(3),status:'active'}],courses:[{id:id(2),title:'학습 진행 시험 과정'}],cohorts,curriculum_weeks:[{id:id(5),course_id:id(2),week_number:1,title:'데일리',is_published:true},{id:id(6),course_id:id(2),week_number:2,title:'별도 학습',is_published:true}],curriculum_lessons:lessons,lesson_progress:[],lesson_contents:lessons.map(lesson=>({id:id(100+Number(String(lesson.day_number))),lesson_id:lesson.id,body_text:'숨겨야 할 기존 본문',vod_url:'https://example.test/private-video'}))};
 const lesson=location.pathname.startsWith('/learn/')?location.pathname.split('/')[3]:longList?id(34):id(10);
 return <main className="edu-front" style={{padding:16}}><Classroom path={['learn',id(1),lesson]} data={withExistingCohortVisibility(data)} pending={false} loading={false} missionId={null} blockLearningEnabled send={async()=>({})}/></main>;
}
