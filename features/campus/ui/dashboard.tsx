'use client';
import theme from './theme.module.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Orbit, RefreshCw, Check, Flag, MessageCircle, Download, X, Clock3, CircleHelp } from 'lucide-react';
import type { CampusSnapshot } from '../contracts';
import type { CampusAdminSnapshot } from '../admin-metrics';
import { learnerMetrics } from '../learner-metrics';
import { downloadProgressCard } from './progress-card';
import styles from './dashboard.module.css';

export function CampusFrame({ children, demo = false, admin = false, immersive = false }: { children: React.ReactNode; demo?: boolean; admin?: boolean; immersive?: boolean }) {
  const [navigationNotice,setNavigationNotice]=useState('');useEffect(()=>{const blocked=()=>setNavigationNotice('저장 또는 답변이 끝난 후 이동해 주세요.');window.addEventListener('campus:navigation-blocked',blocked);return()=>window.removeEventListener('campus:navigation-blocked',blocked);},[]);
  return <div className={`${theme.surface} ${styles.root} ${immersive?styles.immersive:''}`}><header className={styles.header}><Link href={demo ? '/' : '/my/classes'} className={styles.brand}><Orbit size={27} /> MOONSHOT <span>CAMPUS</span></Link><span className={styles.private}>{!demo&&<Link href={admin?"/admin/campus/operations":"/campus/workspace"}>전체 기능 열기 · </Link>}{!demo&&!admin&&<Link href="/campus/archive">개인 보관함 · </Link>}{admin ? '운영 학습 공간' : '나의 성장 학습 공간'}</span></header>
    {demo && <div className={styles.demo}>화면 검수용 · 모든 이름과 수치는 가상 예시입니다. 실제 회원 기록·발송·결제와 연결되지 않습니다.</div>}
    {navigationNotice&&<p role="status" className={styles.demo}>{navigationNotice}</p>}<main className={styles.main}>{children}</main><footer className={styles.footer}>BRANDYACTION EDU <span>배운 것을, 내 일의 성과로.</span></footer></div>;
}
export function LearnerDashboard({ snapshot, onOpen, onRefresh, onSelect, demo = false }: {
  snapshot: CampusSnapshot; onOpen: (lessonId: string, missionId?: string) => void;
  onRefresh: () => void; onSelect: (id: string) => void; demo?: boolean;
}) {
  const metrics = learnerMetrics(snapshot);
  const [filter, setFilter] = useState('all');
  const [report, setReport] = useState(false);
  useEffect(() => {
    if(!report)return;
    const dialog=document.querySelector<HTMLElement>('[aria-labelledby="progress-card-title"]');
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setReport(false);return;}
      if(event.key==='Tab'&&dialog){const nodes=Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href],input'));const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',close);
    return()=>{document.removeEventListener('keydown',close);document.querySelector<HTMLElement>('[data-progress-trigger]')?.focus();};
  },[report]);
  const steps = metrics.steps.filter(s => filter === 'all' || (filter === 'revision' ? s.status === 'revision' : s.status === 'complete'));
  return <>
    <div className={styles.heading}><div><span className={styles.eyebrow}>나의 문샷</span><h1>{snapshot.viewer.displayName}님의 다음 도약</h1><p>어디까지 왔는지 확인하고, 다음 수업을 이어가세요.</p></div><div className={styles.tools}>
      <label className={styles.srOnly} htmlFor="campus-scope">내 수강 기수</label><select id="campus-scope" value={snapshot.selectedEnrollmentId || ''} onChange={e => onSelect(e.target.value)}><option value="" disabled>기수 선택</option>{snapshot.scopes.map(s => <option key={s.enrollmentId} value={s.enrollmentId}>{s.courseTitle} · {s.cohortName}</option>)}</select>
      <button onClick={onRefresh} aria-label="학습 기록 새로고침"><RefreshCw size={17}/></button>{snapshot.scopes.length>0&&<button data-progress-trigger onClick={() => setReport(true)}>내 성장 카드 보기 <ArrowUpRight size={16}/></button>}</div></div>
    {!snapshot.scopes.length ? <div className={styles.empty}><h2>이용 가능한 수업을 확인해 주세요</h2><p>수강권이 연결되면 이곳에서 나의 미션과 실행 기록을 확인할 수 있어요.</p><Link href="/my/classes">내 클래스 보기</Link></div> : <>
        <div className={styles.stats} style={{gridTemplateColumns:'1fr'}}><Stat label="완료한 수업" value={`${metrics.completedLessons} / ${metrics.totalLessons}`} note="수업 완료 표시 기준" icon={<Check/>}/></div>

    <section className={styles.panel}><div className={styles.sectionHead}><div><span className={styles.eyebrow}>21일 지도</span><h2>나의 미션 지도</h2><p>일차를 눌러 수업을 이어가세요. 먼저 끝난 날도 자유롭게 다시 볼 수 있어요.</p></div><div className={styles.tabs} role="group" aria-label="미션 상태 필터">{[['all','전체'],['complete','완료']].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className={styles.lessonGrid}>{steps.map(step => <button className={styles.lesson} key={step.lessonId} onClick={() => onOpen(step.lessonId)}><div className={styles.lessonTop}><b>DAY {String(step.day).padStart(2,'0')}</b><span className={styles[step.status] || styles.pill}>{({revision:'수정 필요',waiting:'검토 대기',ready:'실행 준비',complete:'완료',not_started:'시작 전',in_progress:'진행 중',unknown:'확인 필요'})[step.status]}</span></div><h3>{step.title}</h3><span className={styles.lessonLink}>수업 열기 <ArrowUpRight size={15}/></span></button>)}</div>{!steps.length && <p className={styles.empty}>이 상태의 수업이 없습니다.</p>}</section>
    <details className={styles.definitions}><summary><CircleHelp size={16}/> 지표는 어떻게 계산하나요?</summary><p>수업 완료는 학습 화면의 완료 표시 기준입니다. 공개된 수업이 바뀌면 전체 개수도 달라집니다.</p><p>집계 시점: {new Date(snapshot.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</p></details>
    </>}
    {report && <div className={styles.scrim} onClick={() => setReport(false)}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="progress-card-title" onClick={e => e.stopPropagation()}><button className={styles.close} autoFocus aria-label="성장 카드 닫기" onClick={() => setReport(false)}><X/></button><span className={styles.eyebrow}>MY PROGRESS, MY PROOF</span><h2 id="progress-card-title">나의 실행 기록</h2><p>개인 보관용 성장 카드예요. 공개 게시 없이 파일로 저장합니다.</p><pre>{demo ? '[가상 예시 · 검수용]\n' : ''}{metrics.reportText}</pre><button className={styles.primary} onClick={() => downloadProgressCard(snapshot, demo)}><Download size={17}/> 성장 카드 이미지 저장</button><p className={styles.small}>수료증이나 사업 성과 인증서가 아닙니다.</p></section></div>}
  </>;
}
function Stat({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}) {return <div className={styles.stat}><div className={styles.statLabel}>{label}{icon}</div><strong>{value}</strong><p>{note}</p></div>;}

export function AdminDashboard({ snapshot, onRefresh }: { snapshot: CampusAdminSnapshot; onRefresh: () => void }) {
  const [filter,setFilter] = useState('submitted');
  const m = snapshot.metrics;
  const queue = snapshot.queue.filter(q => filter === 'all' || (filter === 'revision' ? q.status !== 'submitted' : q.status === 'submitted'));
  return <>
    <div className={styles.heading}><div><span className={styles.eyebrow}>과제 관리</span><h1>실행이 멈추지 않도록.</h1><p>{snapshot.cohort.courseTitle} · {snapshot.cohort.name}의 과제 진행과 지원 현황입니다.</p></div><button className={styles.secondary} onClick={onRefresh}><RefreshCw size={16}/> 새로고침</button></div>
    <section className={styles.adminHero}><div><span className={styles.badge}>기수 현황</span><h2>{m.pendingOver2Days > 0 ? `${m.pendingOver2Days}건의 제출물이 이틀 이상 기다리고 있어요.` : '오늘의 의견 흐름을 확인하세요.'}</h2><p>지원이 필요한 순간을 먼저 보고, 기다림을 줄여 주세요.</p></div><div className={styles.adminBig}><strong>{m.pendingReviews}</strong><span>검토 대기 과제</span></div></section>
    <div className={styles.stats}><Stat label="현재 수강 가능" value={`${m.activeLearners}명`} note="활성 회원·유효 수강권 기준" icon={<Orbit/>}/><Stat label="필수 과제 제출 경험" value={`${m.participatingLearners}명`} note={`${m.activeLearners}명 중 · 제출 건수와 다름`} icon={<Flag/>}/><Stat label="필수 과제 전체 승인" value={`${m.allApprovedLearners}명`} note={`${m.requiredMissions}개 필수 과제 기준`} icon={<Check/>}/><Stat label="수정 요청 대상" value={`${m.revisionLearners}명`} note="최신 과제에 수정·재제출 필요" icon={<MessageCircle/>}/></div>
    <section className={styles.panel}><div className={styles.sectionHead}><div><span className={styles.eyebrow}>수업별 현황</span><h2>어느 일차에서 실행이 느려질까요?</h2><p>각 수업의 필수 과제 기준 · 막대는 현재 수강 가능한 인원 대비 전체 승인 인원</p></div></div><div className={styles.tableWrap}><table><caption className={styles.srOnly}>일차별 과제 진행 현황</caption><thead><tr><th>수업</th><th>제출 경험</th><th>전체 승인</th><th>검토 대기</th><th>수정 필요</th><th>제출 전</th></tr></thead><tbody>{snapshot.lessons.map(l => <tr key={l.id}><th><span className={styles.small}>DAY {l.day} · 필수 {l.requiredMissions}개</span><strong>{l.title}</strong><div className={styles.track}><span style={{width:`${m.activeLearners ? l.approvedLearners/m.activeLearners*100 : 0}%`}}/></div></th><td>{l.submittedLearners}명</td><td>{l.approvedLearners}명</td><td>{l.waitingLearners}명</td><td>{l.revisionLearners}명</td><td>{l.notStartedLearners}명</td></tr>)}</tbody></table></div><p className={styles.small}>한 사람이 여러 과제 상태에 포함될 수 있어 열별 인원을 합산하지 않습니다. 제출 전을 이탈로 단정하지 않습니다.</p></section>
    <section className={styles.panel}><div className={styles.sectionHead}><div><span className={styles.eyebrow}>도움이 필요한 수강생</span><h2>먼저 챙길 의견</h2><p>오래 기다린 제출물부터 확인하세요. 알림이나 답변은 자동 발송하지 않습니다.</p></div><div className={styles.tabs} role="group" aria-label="지원 목록 필터">{[['submitted','검토 대기'],['revision','수정 요청'],['all','전체']].map(([v,l]) => <button aria-pressed={filter === v} key={v} onClick={() => setFilter(v)}>{l}</button>)}</div></div>
      <div className={styles.queue}>{queue.map(q => <div key={q.enrollmentId+q.missionId} className={styles.queueItem}><span className={styles.avatar}>{q.displayName.slice(0,1)}</span><div><strong>{q.displayName}</strong><p>{q.lessonTitle} · {q.missionTitle}</p></div><span className={styles.pill}><Clock3 size={13}/>{q.status === 'submitted' ? q.waitingDays === null ? '대기 시간 미확인' : `${q.waitingDays}일 대기` : '수정 요청'}</span><Link href="/admin/reviews">검토 화면 <ArrowUpRight size={15}/></Link></div>)}</div>{!queue.length && <p className={styles.empty}>{snapshot.queueTotal > snapshot.queue.length ? '현재 표시된 목록에는 이 상태의 항목이 없습니다. 전체 항목은 검토 화면에서 확인해 주세요.' : '이 상태의 지원 항목이 없습니다.'}</p>}<p className={styles.small}>전체 지원 항목 {snapshot.queueTotal}건 · 표시 {snapshot.queue.length}건 (현재 필터 {queue.length}건)</p></section>
    <details className={styles.definitions}><summary><CircleHelp size={16}/> 집계 범위와 해석</summary>{snapshot.definitions.map(d => <p key={d}>{d}</p>)}<p>집계 시점 {new Date(snapshot.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST. 매출·고객 확보·시간 절감은 이 화면에서 측정하지 않습니다.</p></details>
  </>;
}
export { styles as campusStyles };
