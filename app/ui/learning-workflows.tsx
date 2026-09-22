'use client';
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { achievement } from '@/lib/edu-workflows';
import { text as t, safeUrl, type Row } from '@/lib/platform';
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
export { MissionForm } from '@/features/mission/ui';
