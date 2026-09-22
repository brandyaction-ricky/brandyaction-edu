'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ExternalLink } from 'lucide-react';
import { achievement } from '@/lib/edu-workflows';
import { text as t, object, safeUrl, labels, type Row } from '@/lib/platform';
import type { PublicQuiz } from '@/lib/mission-quiz';
import { readMissionForm, missionFormResponse } from '@/lib/mission-workspace';
import { MissionQuestions, MissionResponse } from './final/mission-questions';
export type WorkflowSend = (body: Record<string, unknown>, success?: string) => Promise<Record<string, unknown>>;
export type Data = Record<string, Row[]>;
export const timeLabel = (value: unknown) => value ? new Date(String(value)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '일정 미정';

export function LiveSchedule({ data, cohortId }: { data: Data; cohortId: string }) {
  const sessions = (data.cohort_sessions || []).filter(s => s.cohort_id === cohortId && s.is_public).sort((a,b) => Number(a.session_number) - Number(b.session_number));
  if (!sessions.length) return null;
  function calendar(s: Row) {
    const escape = (v: unknown) => String(v || '').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\r', '');
    const stamp = (v: unknown) => new Date(String(v)).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BrandyAction//EDU//KO','BEGIN:VEVENT',`UID:${s.id}@brandyaction-edu.com`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(s.scheduled_at)}`,`SUMMARY:${escape(s.title)}`,`DESCRIPTION:${escape(s.description)}`,'END:VEVENT','END:VCALENDAR'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], {type:'text/calendar;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download='brandyaction-class.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel pad mt24"><h3><CalendarDays size={20}/> 라이브 일정</h3><p className="meta">한국 시간 기준</p>{sessions.map(s => {const access = (data.cohort_session_contents || []).find(c => c.session_id === s.id); return <div className="workflow-session" key={s.id}><div><b>{t(s,'session_number')}회 · {t(s,'title')}</b><p>{timeLabel(s.scheduled_at)}</p><p className="muted">{t(s,'description')}</p></div><div className="flex gap8 wrap-flex">{Boolean(s.scheduled_at) && <button type="button" className="btn small" onClick={() => calendar(s)}>캘린더에 추가</button>}{safeUrl(access?.live_url) && <a className="btn primary small" target="_blank" rel="noreferrer" href={safeUrl(access?.live_url)}>라이브 입장 <ExternalLink size={14}/></a>}{safeUrl(access?.replay_url) && <a className="btn small" target="_blank" rel="noreferrer" href={safeUrl(access?.replay_url)}>다시보기</a>}</div></div>;})}</section>;
}
export function AchievementCards({ data, enrollments }: { data: Data; enrollments: Row[] }) {
  return <div className="grid2 mb24">{enrollments.map(e => {
    const weeks = new Set((data.curriculum_weeks || []).filter(w => w.course_id === e.course_id && w.is_published).map(w => w.id));
    const lessons = new Set((data.curriculum_lessons || []).filter(l => weeks.has(String(l.week_id)) && l.is_published).map(l => l.id));
    const missions = (data.curriculum_missions || []).filter(m => lessons.has(String(m.lesson_id)));
    const result = achievement(e.id, missions, data.mission_submissions || []);
    return <section className="panel pad" key={e.id}><span className="eyebrow">MY ACHIEVEMENT</span><h3>{t((data.courses || []).find(c => c.id === e.course_id),'title')}</h3><div className="between mt16"><b>{result.level === null ? '필수 미션 준비 중' : `LEVEL ${result.level}`}</b><span>{result.approved} / {result.total} 승인</span></div><progress className="workflow-progress" max={100} value={result.percent || 0} aria-label="필수 미션 성취도"/><p className="meta">승인된 필수 미션 기준 {result.percent === null ? '—' : result.percent + '%'}</p><Link href={'/learn/' + e.id} className="link mt16">미션 이어하기</Link></section>;
  })}</div>;
}
export function MissionForm({ mission, enrollment, submission, draft, pending, send }: { mission: Row; enrollment: Row; submission?: Row; draft?: Row; pending: boolean; send: WorkflowSend }) {
  const response = object(submission, 'response');
  const savedDraft = object(draft, 'response');
  const form = readMissionForm(mission.form_schema);
  const locked = ['submitted','approved'].includes(t(submission,'status'));
  const [content, setContent] = useState(String(draft?.content ?? response.text ?? ''));
  const [url, setUrl] = useState(String(draft?.url ?? response.url ?? ''));
  const [formAnswers, setFormAnswers] = useState<Record<string,string>>((savedDraft.form_answers || response.form_answers || {}) as Record<string,string>);
  const [checked, setChecked] = useState<string[]>((savedDraft.checklist || response.checklist || []) as string[]);
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,setError] = useState('');
  const [result,setResult] = useState('');
  const [loadError,setLoadError] = useState('');
  const [retry,setRetry] = useState(0);
  const [answers,setAnswers] = useState<Record<string,number>>({});
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [submitted, setSubmitted] = useState(false);
  // Keep the version that these inputs were based on, not a newer background refresh.
  const [draftRevision, setDraftRevision] = useState<string | null>(draft?.revision ? String(draft.revision) : null);
  const inFlight = useRef(false);
  const busy = pending || saving, readOnly = locked || submitted;
  const current = useRef('');
  useEffect(() => { current.current = JSON.stringify([content,url,formAnswers,checked,answers]); }, [content,url,formAnswers,checked,answers]);
  const savedQuiz = useRef({revision:savedDraft.quiz_revision, answers:savedDraft.quiz_answers});
  const priorResponse = draft ? savedDraft : response;
  const changedForm = Boolean(priorResponse.form_snapshot) && JSON.stringify(readMissionForm(priorResponse.form_snapshot)) !== JSON.stringify(form);
  useEffect(() => {
    if (locked) return;
    const controller = new AbortController();
    fetch('/api/platform/workflows?kind=quiz&mission=' + mission.id + '&enrollment=' + enrollment.id, {signal:controller.signal}).then(async r => { const value=await r.json(); if(!r.ok) throw new Error(value.error || '미션을 불러오지 못했습니다.'); if(controller.signal.aborted) return; setQuiz(value.quiz); if (savedQuiz.current.revision === value.quiz?.revision) setAnswers((savedQuiz.current.answers || {}) as Record<string,number>); setLoading(false); setLoadError(''); }).catch(e => { if(e.name !== 'AbortError') {setLoadError(e.message); setLoading(false);} });
    return () => controller.abort();
  },[mission.id,enrollment.id,locked,retry]);
  useEffect(() => { if (!dirty || readOnly) return; const guard = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty,readOnly]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || busy || readOnly) return; setResult(''); setError('');
    const isDraft = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value === 'draft';
    try {
      missionFormResponse(form, formAnswers, checked, isDraft);
      if (!isDraft && (loading || loadError)) throw new Error('미션을 다시 불러온 뒤 제출해 주세요.');
      if (!isDraft && !form.questions.length && ['text','mixed'].includes(t(mission,'submission_type')) && !content.trim()) throw new Error('실행 기록을 작성해 주세요.');
      if (!isDraft && ['link','mixed'].includes(t(mission,'submission_type')) && !url.trim()) throw new Error('결과물 링크를 입력해 주세요.');
      inFlight.current = true; setSaving(true); const snapshot = current.current;
      const r=await send({action:'mission',enrollmentId:enrollment.id,lessonId:mission.lesson_id,missionId:mission.id,missionVersion:mission.updated_at,content,url,draft:isDraft,draftRevision,formAnswers,checklist:checked,answers,revision:quiz?.revision},isDraft?'임시저장했습니다.':'미션을 제출했습니다.');
      if (r.passed === false) { setError(String(r.message)); return; }
      if (isDraft && typeof r.draftRevision === 'string') setDraftRevision(r.draftRevision);
      if (snapshot === current.current) setDirty(false);
      if (!isDraft) setSubmitted(true);
      setResult(isDraft ? '임시저장했습니다. 다음에 이어서 작성할 수 있어요.' : '제출했습니다. 운영자의 검토를 기다려 주세요.');
    } catch(e){setError((e as Error).message);} finally { inFlight.current=false; setSaving(false); }
  }
  const snapshot = response.mission_snapshot as Record<string,unknown> | undefined;
  return <section className="panel mission-perform"><header className="mission-perform-head"><span className="eyebrow">LEARN → APPLY</span><div className="between"><h2>{String(locked && snapshot?.title || mission.title)}</h2><span className="badge">{submitted ? '검토 대기' : submission ? labels[t(submission,'status')] : draft ? '작성 중' : '시작 전'}</span></div><p className="reading-copy mt16">{String(locked && snapshot ? snapshot.instructions || '' : mission.instructions || '')}</p></header>
    {Boolean(submission?.reviewer_feedback) && <aside className="mission-feedback"><b>운영자 피드백</b><p className="reading-copy">{t(submission,'reviewer_feedback')}</p>{!locked && <small>피드백을 반영해 수정한 뒤 다시 제출해 주세요.</small>}</aside>}
    {locked ? <div className="mission-perform-body"><MissionResponse response={response}/>{Boolean(response.text) && <section className="answer-block"><h3>실행 기록</h3><p className="answer-copy reading-copy">{String(response.text)}</p></section>}{safeUrl(response.url) && <a className="btn" href={safeUrl(response.url)} target="_blank" rel="noreferrer">제출한 결과물 열기 <ExternalLink size={16}/></a>}<p className="notice mt24"><Check size={16}/> {t(submission,'status')==='approved' ? '승인된 미션입니다. 수고하셨어요!' : '제출을 마쳤어요. 검토 결과를 이곳에서 확인할 수 있습니다.'}</p></div> : <form onSubmit={submit} onChange={() => { setDirty(true); setResult(''); setError(''); }}>
      {changedForm && <details className="mission-feedback"><summary>미션 구성이 변경되었습니다. 이전 작성 내용 확인</summary><p>유지된 질문의 답변은 이어집니다. 아래 이전 내용을 확인하고 새 질문에 맞게 보완해 주세요.</p><MissionResponse response={priorResponse}/></details>}
      <fieldset disabled={busy || readOnly} className="workflow-fieldset mission-perform-body"><MissionQuestions schema={form} values={formAnswers} checked={checked} onAnswers={setFormAnswers} onChecked={setChecked}/>
        {!form.questions.length && !['quiz','link'].includes(t(mission,'submission_type')) && <label className="field">실행 기록<textarea rows={8} name="content" maxLength={20000} value={content} onChange={e => setContent(e.target.value)} placeholder="무엇을 실행했고, 어떤 결과를 얻었는지 기록해 주세요."/></label>}
        {['link','mixed'].includes(t(mission,'submission_type')) && <label className="field">결과물 링크<input type="url" name="url" value={url} maxLength={2000} onChange={e => setUrl(e.target.value)} placeholder="https://"/></label>}
        {quiz && <div className="quiz-workspace"><div className="between"><h3>이해도 퀴즈</h3><span className="meta">통과 기준 {quiz.passPercent}%</span></div>{quiz.questions.map((q,index) => <fieldset key={q.id} className="quiz-question"><legend>{index+1}. {q.prompt}</legend>{q.options.map((option,i) => <label key={i} className="quiz-option"><input type="radio" name={'quiz-'+mission.id+'-'+q.id} checked={answers[q.id] === i} onChange={() => setAnswers({...answers,[q.id]:i})}/><span>{option}</span></label>)}</fieldset>)}</div>}
      </fieldset>
      {loading && <p className="notice" role="status">미션을 불러오는 중입니다.</p>}{loadError && <p className="notice" role="alert">{loadError} <button type="button" className="btn small" onClick={() => { setLoading(true); setLoadError(''); setRetry(v=>v+1); }}>다시 불러오기</button></p>}
      {error && <p className="notice red" role="alert">{error}</p>}{result && <p className="notice" role="status">{result}</p>}
      <footer className="mission-submit-bar"><span role="status">{dirty ? '저장하지 않은 내용이 있어요' : draft ? '저장된 내용에서 이어 작성할 수 있어요' : '작성 중에도 임시저장할 수 있어요'}</span><div className="row"><button className="btn" value="draft" formNoValidate disabled={busy || readOnly}>임시저장</button><button className="btn primary" value="submit" disabled={busy || readOnly || loading || Boolean(loadError)}>{busy ? '저장 중…' : submitted ? '제출 완료' : submission ? '보완 후 다시 제출' : '미션 제출'}</button></div></footer>
    </form>}
  </section>;
}
