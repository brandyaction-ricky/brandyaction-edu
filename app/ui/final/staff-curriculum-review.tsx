'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Play, ChevronDown } from 'lucide-react';
import { type CurriculumReview, type ReviewContent, reviewUrl } from '@/lib/staff-curriculum-review';
import { safeUrl } from '@/lib/platform';
import { LessonBlockView, canRenderLessonBlocks } from './lesson-block-view';
import { LessonText } from './lesson-text';
import { Video } from './primitives';
import './classroom-surface.css';
import './staff-curriculum-review.css';

function useReviewRead<T>(url: string) {
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const key = `${url}:${attempt}`;
  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    void fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '검수 화면을 불러오지 못했습니다.');
      if (!abort.signal.aborted) setResult({ key, data });
    }).catch(error => { if (!abort.signal.aborted) setResult({ key, error: error.message }); });
    return () => abort.abort();
  }, [url, key]);
  return { ...(result?.key === key ? result : {}), retry: () => retry(n => n + 1) };
}
export function StaffCurriculumReview({ enrollmentId = '', initialCohort = '', initialLesson = '', partner = false, campusHref }: { enrollmentId?: string; initialCohort?: string; initialLesson?: string; partner?: boolean; campusHref?: string }) {
  const [cohort, setCohort] = useState(initialCohort);
  const [selectedLesson, setLesson] = useState(initialLesson);
  const [student, setStudent] = useState(false), [navOpen, setNavOpen] = useState(false);
  const query = partner ? new URLSearchParams({ partner: '1', ...(cohort ? { access: cohort } : {}) })
    : new URLSearchParams(cohort ? { cohort } : enrollmentId ? { enrollment: enrollmentId } : {});
  const snapshot = useReviewRead<CurriculumReview>('/api/platform/curriculum-review?' + query);
  const data = snapshot.data;
  const campusBack = partner && data?.cohortId === initialCohort ? campusHref : undefined;
  const lesson = data?.lessons.find(l => l.id === selectedLesson) || (selectedLesson ? undefined : data?.lessons[0]);
  const canOpen = Boolean(lesson && (!student || !data?.studentStateError && lesson.studentUnlocked));
  const url = data && lesson && canOpen ? reviewUrl(data.cohortId, lesson.id, student, partner) : '';
  const content = useReviewRead<ReviewContent>(url);
  return <div className="learning-bg staff-curriculum-review"><div className="wrap">
    <section className="staff-review-controls" aria-label={partner ? "협력자 커리큘럼" : "커리큘럼 검수 설정"}>
      <div className="between"><h1>{partner ? "협력자 커리큘럼" : "커리큘럼 검수"}</h1><Link className="btn small" href="/my">마이페이지로</Link></div>
      <p>{partner ? '공개된 수업을 원하는 순서로 볼 수 있습니다.' : '관리자·직원 공통 검수 모드입니다. 공개 수업을 열어 보며, 답변·완료 기록은 저장하지 않습니다.'}</p>
      {partner && data?.cohortId && <Link className="btn" href={campusBack || `/campus/workspace?enrollmentId=${data.cohortId}&section=space`}>{campusBack ? "캠퍼스로 돌아가기" : "캠퍼스 입장"}</Link>}
      {data && <label className="field">{partner ? "열람할 과정·기수" : "검수할 과정·기수"}<select value={data.cohortId} onChange={e => { setCohort(e.target.value); setLesson(''); setNavOpen(false); }}>{data.cohorts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      {!partner && <div className="staff-review-modes" role="group" aria-label="열람 방식">
        <button className="btn" aria-pressed={!student} onClick={() => setStudent(false)}>전체 수업 열람</button>
        <button className="btn" aria-pressed={student} onClick={() => setStudent(true)}>학생 기준 잠금 보기</button>
      </div>}
      {student && <p role="status">내 계정의 수강권·진도를 기준으로 표시합니다. 다른 수강생의 기록을 조회하지 않습니다.{data && !data.enrollmentId && ' 이 기수의 유효한 수강권이 없어 학생 기준으로는 모든 수업이 잠깁니다.'}</p>}
      {data?.studentStateError && <p role="alert">학생 기준 진도를 확인하지 못했습니다. <button className="btn small" onClick={snapshot.retry}>진도 다시 확인</button></p>}
    </section>
    {snapshot.error ? <div role="alert">{snapshot.error}<button className="btn" onClick={snapshot.retry}>{partner ? "권한 다시 확인" : "검수 화면 다시 확인"}</button></div> : !data ? <p role="status">커리큘럼을 불러오고 있습니다.</p> : <>
      <div className="learning-top"><h2>{data.cohorts.find(c => c.id === data.cohortId)?.title}</h2><p className="meta">{partner ? `${data.lessons.length}개 공개 수업 · 읽기 전용` : <>{data.studentStateError ? '완료 기록 확인 필요' : `${data.lessons.filter(l => l.completed).length}개 학습 완료`} · 검수 열람은 진도에 반영되지 않습니다.</>}</p></div>
      <button className="btn learning-mobile-toggle" aria-expanded={navOpen} aria-controls="review-lesson-list" onClick={() => setNavOpen(!navOpen)}>학습 목록<ChevronDown/></button>
      <div className="learning-layout">
        <aside id="review-lesson-list" className={'learning-nav ' + (navOpen ? 'open' : '')} aria-label="학습 목록">
          {[...new Set(data.lessons.map(l => l.week))].map(week => <section className="lesson-week" key={week}><div className="lesson-week-title">WEEK {week} · {data.lessons.find(l => l.week === week)?.weekTitle}</div>
            {data.lessons.filter(l => l.week === week).map(l => {
              const locked = student && (data.studentStateError || !l.studentUnlocked);
              return <button key={l.id} className={'lesson-nav ' + (l.id === lesson?.id ? 'active' : '')} aria-current={l.id === lesson?.id ? 'page' : undefined} aria-disabled={locked} onClick={() => { if (!locked) { setLesson(l.id); setNavOpen(false); } }}>{l.completed ? <Check/> : <Play/>}<span><span className="meta">DAY {l.day}{locked ? ' · 잠김' : ''}</span><b>{l.title}</b></span></button>;
            })}</section>)}
        </aside>
        <div className="learning-content">
          {!lesson ? <p>{selectedLesson ? '공개된 수업 목록에서 확인할 수 없는 수업입니다. 목록에서 다시 선택해 주세요.' : '이 기수에 공개된 수업이 없습니다.'}</p> : !canOpen ? <p role="status">학생 기준으로 잠긴 수업입니다. ‘전체 수업 열람’으로 전환하면 검수할 수 있습니다.</p> : <>
            <header className="lesson-header"><span>DAY {lesson.day}{!partner && (lesson.completed ? ' · 학습 완료' : ' · 미완료')} · 읽기 전용</span><h1>{lesson.title}</h1><p>{lesson.description}</p></header>
            {content.error ? <div role="alert">{content.error}<button className="btn" onClick={content.retry}>수업 다시 확인</button></div> : !content.data ? <p role="status">수업을 불러오고 있습니다.</p> : <ReviewBody key={url + ':' + content.data.revision} content={content.data} cohort={data.cohortId} lesson={lesson.id} student={student} partner={partner}/>}
          </>}
        </div>
      </div>
    </>}
  </div></div>;
}
function ReviewBody({ content, cohort, lesson, student, partner }: { content: ReviewContent; cohort: string; lesson: string; student: boolean; partner: boolean }) {
  return <>
    {content.document ? canRenderLessonBlocks(content.document) ? <LessonBlockView
      document={content.document}
      values={{ blocks: {}, checklist: [] }}
      onChange={() => {}}
      readOnly
      reviewPrompts
      filesReadOnly
      showOutline
      fileContext={{ lessonId: lesson, enrollmentId: '', revision: content.revision || '', reviewCohortId: cohort, reviewStudent: student, reviewPartner: partner }}
    /> : <p role="alert">이 수업의 학습 도구를 표시하지 못했습니다.</p> : <>
      {safeUrl(content.video) && <Video url={safeUrl(content.video)}/>}
      {safeUrl(content.external) && <a className="btn" target="_blank" rel="noopener noreferrer" href={safeUrl(content.external)}>외부 학습 열기</a>}
      <section className="reading"><LessonText text={content.body || '학습 콘텐츠를 준비하고 있습니다.'}/></section>
    </>}
    {content.resourceName && <a className="btn" href={reviewUrl(cohort, lesson, student, partner) + '&resource=1'}>{content.resourceName} 내려받기</a>}
  </>;
}
