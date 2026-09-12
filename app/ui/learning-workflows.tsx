'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ExternalLink } from 'lucide-react';
import { achievement } from '@/lib/edu-workflows';
import { text as t, object, safeUrl, labels, type Row } from '@/lib/platform';
import type { PublicQuiz } from '@/lib/mission-quiz';
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
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,setError] = useState('');
  const [result,setResult] = useState('');
  const [answers,setAnswers] = useState<Record<string,number>>({});
  const locked = ['submitted','approved'].includes(t(submission,'status'));
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/platform/workflows?kind=quiz&mission=' + mission.id + '&enrollment=' + enrollment.id, {signal:controller.signal}).then(async r => { const value=await r.json(); if(!r.ok) throw new Error(value.error); setQuiz(value.quiz); setLoading(false); }).catch(e => { if(e.name !== 'AbortError') {setError(e.message); setLoading(false);} });
    return () => controller.abort();
  },[mission.id,enrollment.id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult('');
    const form = new FormData(event.currentTarget);
    const isDraft = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value === 'draft';
    try { const r=await send({action:'mission',enrollmentId:enrollment.id,lessonId:mission.lesson_id,missionId:mission.id,content:form.get('content') || '',url:form.get('url') || '',draft:isDraft,answers,revision:quiz?.revision},isDraft?'임시저장했습니다.':'미션을 제출했습니다.'); setResult(r.passed === false ? String(r.message) : isDraft ? '임시저장했습니다.' : '제출했습니다. 운영자의 검토를 기다려 주세요.'); } catch(e){setResult((e as Error).message);}
  }
  return <section className="panel pad mt32"><div className="between"><h2>{t(mission,'title')}</h2><span className="badge">{submission ? labels[t(submission,'status')] : '작성 전'}</span></div><p className="reading-copy mt16">{t(mission,'instructions')}</p>{Boolean(submission?.reviewer_feedback) && <div className="notice mt16"><b>운영자 피드백</b><p>{t(submission,'reviewer_feedback')}</p></div>}<form className="mt24" onSubmit={submit}><fieldset disabled={pending || locked || loading || Boolean(error)} className="workflow-fieldset">{mission.submission_type !== 'quiz' && mission.submission_type !== 'link' && <label className="field">실행 기록<textarea rows={6} name="content" maxLength={20000} defaultValue={String(draft?.content || object(submission,'response').text || '')}/></label>}{['link','mixed'].includes(t(mission,'submission_type')) && <label className="field">결과물 링크<input type="url" name="url" defaultValue={String(draft?.url || object(submission,'response').url || '')}/></label>}{quiz && <div className="quiz-workspace"><div className="between"><h3>이해도 퀴즈</h3><span className="meta">통과 기준 {quiz.passPercent}%</span></div>{quiz.questions.map((q,index) => <fieldset key={q.id} className="quiz-question"><legend>{index+1}. {q.prompt}</legend>{q.options.map((option,i) => <label key={i} className="quiz-option"><input type="radio" name={'quiz-'+q.id} checked={answers[q.id] === i} onChange={() => setAnswers({...answers,[q.id]:i})}/><span>{option}</span></label>)}</fieldset>)}</div>}<div className="flex gap8 mt24">{mission.submission_type !== 'quiz' && <button className="btn" value="draft">임시저장</button>}<button className="btn primary" value="submit">{locked ? <><Check size={16}/> {labels[t(submission,'status')]}</> : '미션 제출'}</button></div></fieldset>{loading && <p role="status">미션을 불러오는 중입니다.</p>}{(result || error) && <p className="notice mt16" role="status">{result || error}</p>}</form></section>;
}
