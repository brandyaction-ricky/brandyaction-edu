import Link from 'next/link';
import {createRoot} from 'react-dom/client';
import {CurriculumAiConversation} from '../../../app/ui/final/curriculum-ai-conversation';
import {FloatingLearningQuestion} from '../../../app/ui/final/floating-learning-question';
import {QuestionHub} from '../../../app/ui/final/question-hub';
import {QuestionEntry} from '../../../app/ui/final/question-entry';
import {AdminAiUsage} from '../../../app/ui/final/admin-ai-usage';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
const id='11111111-1111-4111-8111-111111111111';
const changed=(state:{dirty:boolean;locked:boolean})=>{document.documentElement.dataset.locked=String(state.locked);};
const lesson={enrollmentId:id,lessonId:id,label:'1일차 · 문샷 3기 · 고객 인터뷰',recent:true};
const query=new URLSearchParams(location.search);
const currentLesson=query.get('lesson')==='2'
 ? {...lesson,lessonId:'22222222-2222-4222-8222-222222222222',label:'2일차 · 문샷 3기 · 고객 문제'}
 : query.has('lesson') ? lesson : undefined;
createRoot(document.getElementById('root')!).render(<main className="edu-front" style={{maxWidth:780,margin:'auto',padding:20}}>{query.has('floating') ? <><p>문샷 3기</p><h1>나의 학습</h1><section className="panel"><h2>1일차 · 고객 인터뷰</h2><p>고객이 실제로 겪는 문제를 알아보는 수업입니다.</p></section><footer className="learning-footer" style={{textAlign:"right",marginTop:"100vh"}}><Link href="/">홈으로</Link></footer></> : <><p>가상 문서 검수 · 실제 API 호출·학생 데이터 저장 없음</p><h1>수업 AI 질문</h1></>}{query.has('floating')?<FloatingLearningQuestion member={id} current={currentLesson} resumeLessons={query.has('resume')?new Map([[id,'22222222-2222-4222-8222-222222222222']]):undefined}/>:query.has('hub')?<QuestionHub/>:query.has('entry')?<QuestionEntry onCreated={()=>{document.documentElement.dataset.questionCreated='true';}}/>:<CurriculumAiConversation context={lesson} initialQuestion={query.get('prefill') || undefined} onStateChange={changed} onCreated={()=>{document.documentElement.dataset.questionCreated='true';}}/>}{!query.has('floating') && <><hr/><AdminAiUsage/></>}</main>);
