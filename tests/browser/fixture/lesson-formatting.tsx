import { useState } from 'react';
import { LearningEditor } from '../../../app/ui/final/learning-editor';
import { LessonText } from '../../../app/ui/final/lesson-text';
import type { Row } from '../../../lib/platform';
import '../../../app/ui/final/learning-editor.css';

const original = '[01. 학습 목적 이해하기]\n\n내 사업에서 일할 AI팀을 만드는 과정입니다.\n1. [클로드 다운로드 페이지](https://claude.com/download)를 엽니다.\n2. 앱을 설치합니다.';
export function LessonFormattingFixture() {
  const [saved, setSaved] = useState(() => sessionStorage.getItem('lesson-formatting-fixture') || original), [revision, setRevision] = useState(0), [saves, setSaves] = useState(0), [busy, setBusy] = useState(false);
  const lesson = { id:'format-lesson', week_id:'format-week', day_number:1, title:'학습 목적 이해하기', content_type:'text', is_published:true };
  return <>
    <div className="edu-admin" style={{padding:24}}>
      <button type="button" onClick={()=>setRevision(value=>value+1)}>저장한 학습 다시 열기</button>
      <button type="button" onClick={()=>setBusy(value=>!value)}>저장 중 상태 전환</button>
      <output aria-label="본문 저장 횟수">{saves}</output>
      <output aria-label="저장된 본문" style={{display:'none'}}>{saved}</output>
      <LearningEditor key={revision} row={lesson} pending={busy} back={()=>{}} data={{courses:[{id:'format-course',title:'서식 편집 테스트'}],curriculum_weeks:[{id:'format-week',course_id:'format-course',week_number:0,title:'온보딩'}],curriculum_lessons:[lesson],lesson_contents:[{id:lesson.id,lesson_id:lesson.id,body_text:saved}]}} send={async body=>{
        if(body.section==='contents'){const text = String((body.values as Row).body_text); sessionStorage.setItem('lesson-formatting-fixture', text); setSaved(text);setSaves(value=>value+1);}
        return {row:lesson};
      }}/>
    </div>
    <section className="edu-front" aria-label="저장된 학습자 화면" style={{padding:24}}><h1>저장된 학습자 화면</h1><div className="reading-copy"><LessonText text={saved}/></div></section>
  </>;
}
