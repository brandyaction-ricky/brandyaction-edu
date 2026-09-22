'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CheckSquare, Eye, Plus, Trash2 } from 'lucide-react';
import { text as t, type Row } from '@/lib/platform';
import { readMissionForm, validateMissionForm, type MissionFormSchema } from '../domain/form';
import type { MissionData as Data, MissionSend as WorkflowSend } from '../api/contracts';
import { AdminButton, AdminCheckbox, AdminConfirmDialog, AdminDrawer, AdminInput, AdminSelect, AdminTextarea } from '@/app/ui/final/admin-system';
import { MissionQuestions } from './mission-questions';

export function MissionEditor({ row, data, pending, send, close }: { row?: Row; data: Data; pending: boolean; send: WorkflowSend; close: () => void }) {
  const initialLesson = (data.curriculum_lessons || []).find(l => l.id === row?.lesson_id);
  const initialWeek = (data.curriculum_weeks || []).find(w => w.id === initialLesson?.week_id);
  const [course, setCourse] = useState(t(initialWeek, 'course_id'));
  const [week, setWeek] = useState(t(initialWeek, 'id'));
  const [lesson, setLesson] = useState(t(row, 'lesson_id'));
  const [title, setTitle] = useState(t(row, 'title'));
  const [instructions, setInstructions] = useState(t(row, 'instructions'));
  const [type, setType] = useState(t(row, 'submission_type') || 'text');
  const [required, setRequired] = useState(row?.is_required !== false);
  const [published, setPublished] = useState(row?.is_published === true);
  const [schema, setSchema] = useState<MissionFormSchema>(() => readMissionForm(row?.form_schema));
  const [dirty, setDirty] = useState(false), [confirm, setConfirm] = useState(false), [preview, setPreview] = useState(false);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID()), inFlight = useRef(false);
  const busy = pending || saving;
  const weeks = (data.curriculum_weeks || []).filter(w => w.course_id === course).toSorted((a,b) => Number(a.week_number)-Number(b.week_number));
  const lessons = (data.curriculum_lessons || []).filter(l => l.week_id === week).toSorted((a,b) => Number(a.day_number)-Number(b.day_number));
  const occupied = new Set((data.curriculum_missions || []).filter(m => m.id !== row?.id).map(m => m.lesson_id));
  useEffect(() => { if (!dirty) return; const guard = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  function changeForm(next: MissionFormSchema) { setSchema(next); setDirty(true); }
  function move(index: number, direction: number) { const questions = [...schema.questions]; [questions[index], questions[index+direction]] = [questions[index+direction], questions[index]]; changeForm({ ...schema, questions }); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (inFlight.current || busy) return; setError('');
    try {
      const form = validateMissionForm(schema);
      if (!lessons.some(l => l.id === lesson) || occupied.has(lesson)) throw new Error('미션이 아직 없는 학습을 선택해 주세요.');
      if (type === 'quiz' && form.questions.length) throw new Error('직접 답변 질문을 제거하거나 제출 형식을 바꿔 주세요.');
      inFlight.current = true; setSaving(true);
      await send({ action: 'save', section: 'missions', id: row?.id, requestId: requestId.current, expectedUpdatedAt: row?.updated_at,
        values: { lesson_id: lesson, title: title.trim(), instructions: instructions.trim(), submission_type: type, is_required: required, is_published: published, form_schema: form } }, '미션을 저장했습니다.');
      setDirty(false); close();
    } catch (e) { setError((e as Error).message); } finally { inFlight.current = false; setSaving(false); }
  }
  return <><AdminDrawer title={row ? '미션 편집' : '새 미션 만들기'} size="large" onClose={() => { if (!busy) { if (dirty) setConfirm(true); else close(); } }} className="mission-editor">
    <form onSubmit={save} onChange={() => setDirty(true)}>
      <div className="admin-dialog-body">
        <div className="mission-editor-intro"><div><span className="eyebrow">MISSION BUILDER</span><p>배운 내용을 실행으로 연결하는 미션을 만들어 보세요.</p></div><AdminButton type="button" onClick={() => setPreview(!preview)} aria-pressed={preview}><Eye size={16}/>{preview ? '편집으로 돌아가기' : '회원 화면 미리보기'}</AdminButton></div>
        {error && <p className="notice red" role="alert">{error}</p>}
        <fieldset disabled={busy} className="workflow-fieldset" hidden={preview}>
          <section className="mission-editor-section"><h3><span>01</span> 기본 정보</h3>
            <div className="mission-editor-grid"><AdminSelect label="클래스" value={course} required disabled={Boolean(row)} onChange={e => { setCourse(e.target.value); setWeek(''); setLesson(''); }}><option value="">클래스 선택</option>{(data.courses || []).filter(c => !c.archived_at || c.id === course).map(c => <option key={c.id} value={c.id}>{t(c,'title')}</option>)}</AdminSelect>
              <AdminSelect label="주차" value={week} required disabled={Boolean(row)} onChange={e => { setWeek(e.target.value); setLesson(''); }}><option value="">주차 선택</option>{weeks.map(w => <option key={w.id} value={w.id}>{t(w,'week_number')}주차 · {t(w,'title')}</option>)}</AdminSelect>
            </div>
            <AdminSelect label="연결 학습" value={lesson} required disabled={Boolean(row)} onChange={e => setLesson(e.target.value)} helper={row ? '회원의 제출 이력을 보호하기 위해 등록 후 연결 학습은 변경하지 않습니다.' : '학습 하나에 미션 하나를 연결합니다. 학습의 공개 설정과 수강 권한이 함께 적용됩니다.'}><option value="">학습 선택</option>{lessons.map(l => <option key={l.id} value={l.id} disabled={occupied.has(l.id)}>DAY {t(l,'day_number')} · {t(l,'title')}{occupied.has(l.id) ? ' (미션 등록됨)' : ''}</option>)}</AdminSelect>
            {!lessons.length && <p className="notice">클래스와 주차를 선택해 주세요. 아직 학습이 없다면 학습 콘텐츠에서 먼저 등록할 수 있습니다.</p>}
            <AdminInput label="미션 제목" value={title} required maxLength={200} placeholder="예: 내 업무에 적용할 AI 활용 계획 세우기" onChange={e => setTitle(e.target.value)}/>
            <AdminTextarea label="미션 안내" value={instructions} rows={5} maxLength={20000} placeholder="미션의 목적, 진행 방법, 제출 예시를 안내해 주세요." onChange={e => setInstructions(e.target.value)}/>
          </section>
          <section className="mission-editor-section"><h3><span>02</span> 답변 구성</h3>
            <AdminSelect label="제출 형식" value={type} onChange={e => setType(e.target.value)}><option value="text">텍스트 답변</option><option value="link">결과물 링크</option><option value="mixed">답변 + 결과물 링크</option><option value="quiz">이해도 퀴즈</option></AdminSelect>
            {type === 'quiz' ? <p className="notice">퀴즈는 학습 콘텐츠에서 문항과 정답을 설정합니다. 새 미션은 비공개로 저장한 뒤 퀴즈를 연결해 주세요.</p> : <>
              <p className="meta">질문을 나누면 회원이 무엇을 작성해야 할지 명확해집니다. 질문이 없으면 기본 실행 기록 입력란을 사용합니다.</p>
              {schema.questions.map((q,i) => <div className="mission-block" key={q.id}><div className="mission-block-head"><b>질문 {i+1}</b><div className="row"><AdminButton type="button" aria-label={`질문 ${i+1} 위로`} disabled={i===0} onClick={() => move(i,-1)}><ArrowUp size={14}/></AdminButton><AdminButton type="button" aria-label={`질문 ${i+1} 아래로`} disabled={i===schema.questions.length-1} onClick={() => move(i,1)}><ArrowDown size={14}/></AdminButton><AdminButton type="button" aria-label={`질문 ${i+1} 삭제`} onClick={() => changeForm({...schema,questions:schema.questions.filter(x => x.id!==q.id)})}><Trash2 size={14}/></AdminButton></div></div>
                <AdminTextarea label={`질문 ${i+1} 내용`} value={q.prompt} required maxLength={500} rows={2} onChange={e => changeForm({...schema,questions:schema.questions.map(x => x.id===q.id ? {...x,prompt:e.target.value}:x)})}/>
                <div className="mission-editor-grid"><AdminSelect label={`질문 ${i+1} 답변 형식`} value={q.kind} onChange={e => changeForm({...schema,questions:schema.questions.map(x => x.id===q.id ? {...x,kind:e.target.value as 'text'|'link'}:x)})}><option value="text">긴 글</option><option value="link">링크</option></AdminSelect><AdminCheckbox label={`질문 ${i+1} 필수 답변`} checked={q.required} onChange={e => changeForm({...schema,questions:schema.questions.map(x => x.id===q.id ? {...x,required:e.target.checked}:x)})}/></div>
              </div>)}
              <AdminButton type="button" disabled={schema.questions.length>=12} onClick={() => changeForm({...schema,questions:[...schema.questions,{id:crypto.randomUUID(),prompt:'',kind:'text',required:true}]})}><Plus size={16}/>질문 추가</AdminButton>
            </>}
          </section>
          <section className="mission-editor-section"><h3><span>03</span> 제출 전 체크리스트</h3><p className="meta">필수 항목을 확인한 회원만 제출할 수 있습니다.</p>
            {schema.checklist.map((c,i) => <div className="mission-check-editor" key={c.id}><AdminInput label={`체크 항목 ${i+1}`} value={c.label} required maxLength={200} onChange={e => changeForm({...schema,checklist:schema.checklist.map(x => x.id===c.id ? {...x,label:e.target.value}:x)})}/><AdminCheckbox label={`체크 ${i+1} 필수`} checked={c.required} onChange={e => changeForm({...schema,checklist:schema.checklist.map(x => x.id===c.id ? {...x,required:e.target.checked}:x)})}/><AdminButton type="button" aria-label={`체크 항목 ${i+1} 삭제`} onClick={() => changeForm({...schema,checklist:schema.checklist.filter(x => x.id!==c.id)})}><Trash2 size={16}/></AdminButton></div>)}
            <AdminButton type="button" disabled={schema.checklist.length>=20} onClick={() => changeForm({...schema,checklist:[...schema.checklist,{id:crypto.randomUUID(),label:'',required:true}]})}><CheckSquare size={16}/>체크 항목 추가</AdminButton>
          </section>
          <section className="mission-editor-section"><h3><span>04</span> 공개 설정</h3><AdminCheckbox label="수료에 필요한 필수 미션" checked={required} onChange={e => setRequired(e.target.checked)}/><AdminCheckbox label="수강 회원에게 미션 공개" checked={published} onChange={e => setPublished(e.target.checked)} helper="선택하지 않으면 비공개 초안으로 저장됩니다."/></section>
        </fieldset>
        {preview && <section className="mission-member-preview"><span className="eyebrow">회원 미리보기 · 저장 전</span><h2>{title || '미션 제목'}</h2><p className="reading-copy">{instructions || '미션 안내가 여기에 표시됩니다.'}</p><fieldset disabled className="workflow-fieldset"><MissionQuestions schema={schema} values={{}} checked={[]} onAnswers={() => {}} onChecked={() => {}}/>{!schema.questions.length && ['text','mixed'].includes(type) && <label className="field">실행 기록<textarea rows={4}/></label>}{['mixed','link'].includes(type) && <label className="field">결과물 링크<input type="url"/></label>}</fieldset><p className="meta">실제 회원 화면에는 연결된 퀴즈와 제출·피드백 상태도 표시됩니다.</p></section>}
      </div>
      <footer className="admin-dialog-footer"><span className="mission-save-state">{dirty ? '저장하지 않은 변경사항' : row ? '저장된 미션' : '새 미션'}</span><AdminButton type="button" disabled={busy} onClick={() => dirty ? setConfirm(true) : close()}>취소</AdminButton>{preview ? <AdminButton type="button" onClick={() => setPreview(false)}>편집으로 돌아가기</AdminButton> : <AdminButton type="submit" tone="primary" disabled={busy}>{busy ? '저장 중…' : published ? '공개 상태로 저장' : '비공개로 저장'}</AdminButton>}</footer>
    </form>
  </AdminDrawer>{confirm && <AdminConfirmDialog title="편집을 종료할까요?" message="저장하지 않은 변경사항은 사라집니다." confirmLabel="편집 종료" cancelLabel="계속 편집" onConfirm={close} onCancel={() => setConfirm(false)}/>}</>;
}
