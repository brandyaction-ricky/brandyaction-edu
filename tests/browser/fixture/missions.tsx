import { useState } from 'react';
import { sections, type Row } from '../../../lib/platform';
import { MissionEditor } from '../../../app/ui/final/mission-editor';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { Missions } from '../../../app/ui/final/member-views';
import { MissionForm, type Data, type WorkflowSend } from '../../../app/ui/learning-workflows';
import { SubmissionReview } from '../../../app/ui/final/submission-review';
import { MissionDiscussion } from '../../../features/mission/ui';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/admin.css';
import '../../../app/ui/final/integration.css';
import '../../../app/ui/final/mission-workspace.css';

const course='11111111-1111-4111-8111-111111111111', week='22222222-2222-4222-8222-222222222222', lesson='33333333-3333-4333-8333-333333333333', mission='44444444-4444-4444-8444-444444444444', enrollment='55555555-5555-4555-8555-555555555555', user='66666666-6666-4666-8666-666666666666';
const schema={version:1,questions:[{id:'q1',prompt:'반복되는 업무 중 AI로 개선하고 싶은 것은 무엇인가요?',kind:'text',required:true},{id:'q2',prompt:'실행 과정과 발견한 점을 기록해 주세요.',kind:'text',required:true},{id:'q3',prompt:'공유할 결과물이 있다면 링크를 남겨 주세요.',kind:'link',required:false}],checklist:[{id:'c1',label:'실제로 실행한 내용을 바탕으로 작성했어요.',required:true},{id:'c2',label:'링크의 열람 권한과 개인정보를 확인했어요.',required:false}]};
const initial: Data={courses:[{id:course,title:'일을 바꾸는 AI 실전 클래스',status:'published'}],cohorts:[{id:'cohort',name:'실행 1기'}],curriculum_weeks:[{id:week,course_id:course,week_number:1,title:'내 업무를 새롭게 바라보기',is_published:true}],curriculum_lessons:[{id:lesson,week_id:week,day_number:1,title:'AI 업무 개선 계획',is_published:true},{id:'77777777-7777-4777-8777-777777777777',week_id:week,day_number:2,title:'첫 결과물 만들기',is_published:true}],curriculum_missions:[{id:mission,lesson_id:lesson,title:'나의 첫 AI 업무 개선 실험',instructions:'매일 반복하는 업무 하나를 골라 AI와 함께 실행해 보세요.\n작은 시도도 괜찮아요. 결과보다 과정에서 발견한 점을 구체적으로 기록해 주세요.',submission_type:'text',is_required:true,is_published:true,form_schema:schema,updated_at:'2026-09-21T10:00:00Z'}],enrollments:[{id:enrollment,user_id:user,course_id:course,cohort_id:'cohort',status:'active',access_starts_at:'2020-01-01'}],profiles:[{id:user,full_name:'체험 회원',email:'synthetic@example.test'}],mission_submissions:[],edu_mission_drafts:[]};
const key='edu-mission-synthetic-preview-v1';
// Local-only state adapter: no real accounts, backend writes or payments.
export function MissionFixture() {
  const [data,setData]=useState<Data>(()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')||initial;}catch{return initial;}});
  const [mode,setMode]=useState('admin'),[editing,setEditing]=useState<Row|null|undefined>(undefined),[selection,setSelection]=useState<string[]>([]),[selected,setSelected]=useState(mission),[generation,setGeneration]=useState(0),[fail,setFail]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  function store(next:Data){setData(next);sessionStorage.setItem(key,JSON.stringify(next));}
  const send: WorkflowSend=async body=>{
    setPending(true);try{
      await new Promise(resolve=>setTimeout(resolve,100));
      if(fail){setFail(false);throw new Error('테스트 저장 실패: 입력 내용은 유지됩니다. 다시 시도해 주세요.');}
      if(body.action==='save') {
        const row={...(body.values as Row),id:String(body.id||body.requestId),updated_at:new Date().toISOString()};
        store({...data,curriculum_missions:[...data.curriculum_missions.filter(m=>m.id!==row.id),row]});setMessage('미션을 저장했습니다.');
      } else if(body.action==='mission') {
        const target=data.curriculum_missions.find(m=>m.id===body.missionId)!;
        const response={text:body.content,url:body.url,form_answers:body.formAnswers,checklist:body.checklist,form_snapshot:target.form_schema,mission_snapshot:{title:target.title,instructions:target.instructions,submission_type:target.submission_type}};
        if(body.draft){const current=data.edu_mission_drafts.find(d=>d.mission_id===target.id);if((current?.revision || null)!==body.draftRevision)throw new Error('다른 화면에서 초안을 변경했습니다. 작성 내용을 복사한 뒤 다시 열어 주세요.');const draft={id:'synthetic-draft',enrollment_id:enrollment,mission_id:target.id,content:body.content,url:body.url,response,revision:crypto.randomUUID(),updated_at:new Date().toISOString()};store({...data,edu_mission_drafts:[...data.edu_mission_drafts.filter(d=>d.mission_id!==target.id),draft]});return {ok:true,draftRevision:draft.revision};}
        else {const row={id:crypto.randomUUID(),enrollment_id:enrollment,mission_id:target.id,response,status:'submitted',attempt_number:data.mission_submissions.filter(s=>s.mission_id===target.id).length+1,submitted_at:new Date().toISOString()};store({...data,mission_submissions:[...data.mission_submissions,row],edu_mission_drafts:data.edu_mission_drafts.filter(d=>d.mission_id!==target.id)});}
      } else if(body.action==='review') store({...data,mission_submissions:data.mission_submissions.map(s=>(body.ids as string[]).includes(s.id)?{...s,status:body.decision,reviewer_feedback:body.feedback,reviewed_at:new Date().toISOString()}:s)});
      return {ok:true,passed:true};
    }finally{setPending(false);}
  };
  const target=data.curriculum_missions.find(m=>m.id===selected)!;
  const submission=data.mission_submissions.filter(s=>s.mission_id===selected).toSorted((a,b)=>Number(b.attempt_number)-Number(a.attempt_number))[0];
  return <div className={['member','perform'].includes(mode)?'edu-front':'edu-admin'} style={{maxWidth:1208,margin:'0 auto',padding:24,minHeight:'100vh'}}>
    <p className="notice">로컬 체험 · 합성 데이터 · 실제 회원/DB와 연결되지 않습니다.</p>
    <nav className="mission-workspace-nav" aria-label="체험 화면 전환">{[['admin','관리자 · 미션 관리'],['member','회원 · 내 미션'],['review','운영자 · 제출물 검토']].map(([id,label])=><button className={'btn '+(mode===id?'primary':'')} key={id} onClick={()=>setMode(id)}>{label}</button>)}</nav>
    <details className="mb24"><summary>테스트 도구</summary><button className="btn" onClick={()=>setFail(true)} disabled={fail}>다음 저장 실패시키기</button><button className="btn" onClick={()=>{store(initial);setSelected(mission);setGeneration(x=>x+1);setMode('admin');}}>합성 데이터 초기화</button></details>
    {message && <p role="status">{message}</p>}
    {mode==='admin'&&<><div className="section-head"><div><span className="eyebrow">LEARNING OPERATIONS</span><h1>미션 관리</h1><p>회원이 배운 것을 실행할 수 있도록 질문과 완료 기준을 설계하세요.</p></div><button className="btn primary" onClick={()=>setEditing(null)}>새 미션 만들기</button></div><AdminCatalog section={sections.find(s=>s.key==='missions')!} data={data} selection={selection} setSelection={setSelection} edit={(_,row)=>setEditing(row||null)} archive={()=>{}} pending={pending} loading={false} pagination={null} setPage={()=>{}} exportCsv={()=>{}}/></>}
    {mode==='member'&&<main className="account-main" onClick={event=>{const link=(event.target as Element).closest('a');if(link?.getAttribute('href')?.startsWith('/learn/')){event.preventDefault();setSelected(new URL(link.href).searchParams.get('mission')||mission);setMode('perform');}}}><Missions data={{...data,curriculum_missions:data.curriculum_missions.filter(m=>m.is_published)}} active={data.enrollments}/></main>}
    {mode==='perform'&&<><button className="btn" onClick={()=>setMode('member')}>내 미션으로 돌아가기</button><MissionForm key={selected+generation+(submission?.id||'')} mission={target} enrollment={data.enrollments[0]} submission={submission} draft={data.edu_mission_drafts.find(d=>d.mission_id===selected)} pending={pending} send={send}/><MissionDiscussion key={selected} missionId={selected} enrollmentId={enrollment}/></>}
    {mode==='review'&&<><h1>제출물 검토</h1><SubmissionReview data={data} send={send} pending={pending} remote={new URLSearchParams(location.search).has('remote')}/></>}
    {editing!==undefined&&<MissionEditor row={editing||undefined} data={data} pending={pending} send={send} close={()=>setEditing(undefined)}/>}
  </div>;
}
