import { Classroom } from '../../../app/ui/final/classroom';
import { LessonProgressionSettings } from '../../../app/ui/final/lesson-progression-settings';
const id=(n:number)=>`aaaaaaac-1111-4111-8111-${String(n).padStart(12,'0')}`;
export function LessonProgressionFixture(){
 const cohorts=[{id:id(3),course_id:id(2),name:'진행 시험 4기'},{id:id(30),course_id:id(2),name:'진행 시험 5기'}];
 if(new URLSearchParams(location.search).has('settings'))return <main className="edu-admin" style={{padding:16}}><LessonProgressionSettings cohorts={cohorts}/></main>;
 const lessons=[['데일리 첫날',1],['데일리 둘째 날',2],['별도 학습 첫날',1],['별도 학습 둘째 날',2]].map(([title,day],index)=>({id:id(index+10),week_id:id(index<2?5:6),title,day_number:index<2?day:Number(day)+10,is_published:true,content_type:'text'}));
 lessons.push({id:id(14),week_id:id(5),title:'기존 오리엔테이션',day_number:99,is_published:true,content_type:'text'});
 const data={enrollments:[{id:id(1),course_id:id(2),cohort_id:id(3),status:'active'}],courses:[{id:id(2),title:'학습 진행 시험 과정'}],cohorts,curriculum_weeks:[{id:id(5),course_id:id(2),week_number:1,title:'데일리',is_published:true},{id:id(6),course_id:id(2),week_number:2,title:'별도 학습',is_published:true}],curriculum_lessons:lessons,lesson_progress:[],lesson_contents:lessons.map(lesson=>({id:id(100+Number(String(lesson.day_number))),lesson_id:lesson.id,body_text:'숨겨야 할 기존 본문',vod_url:'https://example.test/private-video'}))};
 const lesson=location.pathname.startsWith('/learn/')?location.pathname.split('/')[3]:id(10);
 return <main className="edu-front" style={{padding:16}}><Classroom path={['learn',id(1),lesson]} data={data} pending={false} loading={false} missionId={null} blockLearningEnabled send={async()=>({})}/></main>;
}
