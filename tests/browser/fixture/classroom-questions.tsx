import { Classroom } from '../../../app/ui/final/classroom';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
export function ClassroomQuestionsFixture(){
 const lessonId=new URLSearchParams(location.search).get('lesson') || id(4);
 return <div className="edu-front"><Classroom path={['learn',id(1),lessonId]} pending={false} loading={false} missionId={null} send={async()=>({})} data={{
  enrollments:[{id:id(1),course_id:id(2),cohort_id:id(3),status:'active'}],courses:[{id:id(2),title:'합성 문샷 과정'}],cohorts:[{id:id(3),name:'합성 4기'}],
  curriculum_weeks:[{id:id(5),course_id:id(2),week_number:1,title:'질문 연습',is_published:true}],
  curriculum_lessons:[{id:id(4),week_id:id(5),day_number:1,title:'첫 학습',is_published:true},{id:id(6),week_id:id(5),day_number:2,title:'다음 학습',is_published:true}],
  lesson_contents:[{id:id(7),lesson_id:id(4),body_text:'학습하면서 바로 질문합니다.'}],lesson_progress:[],
 }}/></div>
}
