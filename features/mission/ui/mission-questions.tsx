'use client';
import { useId } from 'react';
import { type MissionFormSchema, readMissionForm, missionLink } from '../domain/form';

export function MissionQuestions({ schema, values, checked, onAnswers, onChecked }: { schema: MissionFormSchema; values: Record<string,string>; checked: string[]; onAnswers: (value: Record<string,string>) => void; onChecked: (value: string[]) => void }) {
  const prefix = useId();
  return <div className="mission-question-list">{schema.questions.map((q,i) => <label className="mission-answer-field" key={q.id} htmlFor={`${prefix}-${q.id}`}><span><b>Q{String(i+1).padStart(2,'0')}</b>{q.prompt || '질문 내용'}<small>{q.required ? '필수' : '선택'}</small></span>{q.kind === 'link' ? <input id={`${prefix}-${q.id}`} type="url" value={values[q.id] || ''} maxLength={5000} placeholder="https://" onChange={e => onAnswers({...values,[q.id]:e.target.value})}/> : <textarea id={`${prefix}-${q.id}`} rows={5} maxLength={5000} placeholder="내 경험과 실행 결과를 자유롭게 작성해 주세요." value={values[q.id] || ''} onChange={e => onAnswers({...values,[q.id]:e.target.value})}/>}<small>{(values[q.id] || '').length.toLocaleString()} / 5,000</small></label>)}
    {!!schema.checklist.length && <section className="mission-checklist"><h3>제출 전 확인</h3>{schema.checklist.map(c => <label key={c.id}><input type="checkbox" checked={checked.includes(c.id)} onChange={e => onChecked(e.target.checked ? [...checked,c.id] : checked.filter(id => id!==c.id))}/><span>{c.label || '체크 항목'}<small>{c.required ? '필수' : '선택'}</small></span></label>)}</section>}
  </div>;
}

export function MissionResponse({ response }: { response: Record<string,unknown> }) {
  const schema = readMissionForm(response.form_snapshot);
  const answers = (response.form_answers || {}) as Record<string,string>;
  const checked = Array.isArray(response.checklist) ? response.checklist : [];
  return <div className="mission-response">{schema.questions.map((q,i) => <section className="answer-block" key={q.id}><h4>Q{i+1}. {q.prompt}</h4><div className="answer-copy reading-copy">{q.kind==='link' && missionLink(answers[q.id] || '') ? <a href={answers[q.id]} target="_blank" rel="noreferrer">{answers[q.id]}</a> : answers[q.id] || '작성하지 않음'}</div></section>)}{!!schema.checklist.length && <section className="mission-checklist"><h4>제출 당시 체크리스트</h4>{schema.checklist.map(c => <p key={c.id}>{checked.includes(c.id) ? '✓' : '—'} {c.label} {c.required ? '(필수)' : '(선택)'}</p>)}</section>}</div>;
}
