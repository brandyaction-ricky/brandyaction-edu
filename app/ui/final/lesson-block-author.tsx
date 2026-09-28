"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { publicLessonBlocks, validateLessonBlocks, type BlockField, type LessonBlock, type LessonBlockDocument, type LessonBlockType } from '@/lib/lesson-blocks';
import { LessonDocumentWriter, type LessonDocumentWrite } from '@/lib/lesson-block-authoring';
import { isGuidedTool, newGuidedBlock } from '@/lib/lesson-guided-tools';
import { LessonBodyEditor } from './lesson-body-editor';
import { LessonText } from './lesson-text';
import { canRenderLessonBlocks, LessonBlockView } from './lesson-block-view';
import './lesson-block-author.css';

export type BlockAuthorState = { active: boolean; dirty: boolean; blocked: boolean };
export type BlockAuthorHandle = { validate: () => boolean; showPreview: () => void; save: (lessonId: string) => Promise<void> };
type Props = { lessonId: string; legacyBlocks: LessonBlock[]; disabled: boolean; onState: (state: BlockAuthorState) => void };
type Snapshot = { revision: string | null; document: LessonBlockDocument | null; editable: boolean };
const empty = (): LessonBlockDocument => ({ schemaVersion: 1, blocks: [], checklist: [] });
const choices: { type: LessonBlockType; label: string }[] = [
  { type: 'heading', label: '큰 제목' }, { type: 'subheading', label: '작은 제목' }, { type: 'text', label: '본문' },
  { type: 'image', label: '이미지' }, { type: 'audio', label: '음성' }, { type: 'video', label: '영상' },
  { type: 'question', label: '중간 질문' }, { type: 'link', label: '외부 링크' }, { type: 'prompt', label: '복사할 프롬프트' },
  { type: 'prompt-generator', label: '프롬프트 생성기' }, { type: 'quiz', label: '확인 문제' }, { type: 'divider', label: '구분선' },
  { type: 'persona-generator', label: '페르소나 생성기' }, { type: 'landing-planner', label: '랜딩페이지 기획 문답' },
];
function newBlock(type: LessonBlockType): LessonBlock {
  if (isGuidedTool(type)) return newGuidedBlock(type, crypto.randomUUID());
  const block: LessonBlock = { id: crypto.randomUUID(), type, content: '' };
  if (['image', 'audio', 'video', 'link'].includes(type)) block.url = '';
  if (type === 'question') block.question = { label: '', kind: 'text', required: true };
  if (type === 'prompt-generator') block.fields = [];
  if (type === 'quiz') block.quiz = { passPercent: 100, questions: [{ id: crypto.randomUUID(), prompt: '', options: ['', ''], correctIndex: 0 }] };
  return block;
}
async function saveDocument(body: LessonDocumentWrite) {
  const response = await fetch('/api/platform/lesson-blocks', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '학습을 저장하지 못했습니다.'), { status: response.status });
  return data as { revision: string };
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="lb-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function GeneratorFields({ block, update }: { block: LessonBlock; update: (patch: Partial<LessonBlock>) => void }) {
  const fields = block.fields || [];
  function patchField(index: number, patch: Partial<BlockField>) { update({ fields: fields.map((field, i) => i === index ? { ...field, ...patch } : field) }); }
  return <>
    <Field label="프롬프트 틀 *" hint="입력값을 넣을 자리에 {변수 이름}을 적어 주세요. 예: {브랜드}의 소개 문장을 써 줘."><textarea required rows={5} value={block.content || ''} onChange={event => update({ content: event.target.value })} /></Field>
    {fields.map((field, index) => <div className="lba-fields" key={field.id}>
      <h4>입력 항목 {index + 1}</h4>
      <Field label="질문 문구 *"><input required maxLength={1000} value={field.label} onChange={event => patchField(index, { label: event.target.value })} /></Field>
      <Field label="변수 이름 *" hint="프롬프트 틀의 중괄호 안 이름과 같게 입력합니다."><input required maxLength={100} value={field.variable} onChange={event => patchField(index, { variable: event.target.value })} /></Field>
      <Field label="입력 예시"><input maxLength={1000} value={field.placeholder} onChange={event => patchField(index, { placeholder: event.target.value })} /></Field>
      <Field label="선택지 (한 줄에 하나씩)" hint="비워 두면 직접 입력하는 항목이 됩니다."><textarea rows={3} value={(field.options || []).join('\n')} onChange={event => patchField(index, { options: event.target.value ? event.target.value.split('\n') : [] })} /></Field>
      <label className="lb-choice"><input type="checkbox" checked={field.required} onChange={event => patchField(index, { required: event.target.checked })} />필수 입력</label>
      <label className="lb-choice"><input type="checkbox" checked={field.sensitive} onChange={event => patchField(index, { sensitive: event.target.checked })} />학생 답변에 저장하지 않는 비공개 항목</label>
      <button type="button" className="btn small" onClick={() => update({ fields: fields.filter((_, i) => i !== index) })}>입력 항목 {index + 1} 삭제</button>
    </div>)}
    <button type="button" className="btn small" disabled={fields.length >= 100} onClick={() => update({ fields: [...fields, { id: crypto.randomUUID(), label: '', variable: '', placeholder: '', required: true, sensitive: false }] })}>입력 항목 추가</button>
  </>;
}
function QuizFields({ block, update }: { block: LessonBlock; update: (patch: Partial<LessonBlock>) => void }) {
  const quiz = block.quiz!;
  function patchQuestion(index: number, patch: Partial<typeof quiz.questions[number]>) { update({ quiz: { ...quiz, questions: quiz.questions.map((q, i) => i === index ? { ...q, ...patch } : q) } }); }
  return <>
    <Field label="문제 묶음 제목"><input value={block.content || ''} onChange={event => update({ content: event.target.value })} /></Field>
    <Field label="통과 기준 (%) *"><input required type="number" min={1} max={100} value={quiz.passPercent} onChange={event => update({ quiz: { ...quiz, passPercent: Number(event.target.value) } })} /></Field>
    {quiz.questions.map((question, index) => <div className="lba-fields" key={question.id}><h4>문제 {index + 1}</h4>
      <Field label={`문제 ${index + 1} 내용 *`}><textarea rows={2} required maxLength={10000} value={question.prompt} onChange={event => patchQuestion(index, { prompt: event.target.value })} /></Field>
      {question.options.map((option, n) => <div className="lba-choice-edit" key={n}>
        <label><input required type="radio" name={`author-${block.id}-${question.id}`} checked={question.correctIndex === n} onChange={() => patchQuestion(index, { correctIndex: n })} aria-label={`문제 ${index + 1} 정답 ${n + 1}`} /></label>
        <input required maxLength={5000} aria-label={`문제 ${index + 1} 선택지 ${n + 1}`} value={option} onChange={event => patchQuestion(index, { options: question.options.map((old, i) => i === n ? event.target.value : old) })} />
        <button type="button" className="btn small" disabled={question.options.length <= 2} aria-label={`문제 ${index + 1} 선택지 ${n + 1} 삭제`} onClick={() => patchQuestion(index, { options: question.options.filter((_, i) => i !== n), correctIndex: question.correctIndex === n ? -1 : question.correctIndex > n ? question.correctIndex - 1 : question.correctIndex })}>삭제</button>
      </div>)}
      <div className="lba-actions"><button className="btn small" type="button" disabled={question.options.length >= 20} onClick={() => patchQuestion(index, { options: [...question.options, ''] })}>문제 {index + 1} 선택지 추가</button><button className="btn small" type="button" disabled={quiz.questions.length === 1} onClick={() => update({ quiz: { ...quiz, questions: quiz.questions.filter((_, i) => i !== index) } })}>문제 {index + 1} 삭제</button></div>
    </div>)}
    <button className="btn small" type="button" disabled={quiz.questions.length >= 100} onClick={() => update({ quiz: { ...quiz, questions: [...quiz.questions, { id: crypto.randomUUID(), prompt: '', options: ['', ''], correctIndex: 0 }] } })}>문제 추가</button>
  </>;
}

const LoadedAuthor = forwardRef<BlockAuthorHandle, Props & { snapshot: Snapshot }>(function LoadedAuthor({ snapshot, legacyBlocks, disabled, onState }, ref) {
  const [document, setDocument] = useState<LessonBlockDocument>(() => snapshot.document || empty());
  const [active, setActive] = useState(Boolean(snapshot.document)), [saved, setSaved] = useState(JSON.stringify(snapshot.document));
  const [type, setType] = useState<LessonBlockType>('text'), [preview, setPreview] = useState(false), [message, setMessage] = useState(''), [invalid, setInvalid] = useState(false), [conflict, setConflict] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [writer] = useState(() => new LessonDocumentWriter(snapshot.revision, snapshot.document, saveDocument));
  const root = useRef<HTMLDivElement>(null);
  const dirty = active && JSON.stringify(document) !== saved;
  useEffect(() => { onState({ active, dirty, blocked: !snapshot.editable || conflict }); }, [active, dirty, conflict, snapshot.editable, onState]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) { if (dirty) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  function validate() {
    if (!active) return true;
    setInvalid(true); setPreview(false);
    const input = root.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:invalid,textarea:invalid,select:invalid');
    if (input) { requestAnimationFrame(() => { input.focus(); input.reportValidity(); }); setMessage('빨간색으로 표시된 필수 항목을 입력해 주세요.'); return false; }
    try {
      validateLessonBlocks(document);
      if (!document.blocks.length && !document.checklist.length) throw new Error('본문이나 질문을 한 개 이상 추가해 주세요.');
      if (!canRenderLessonBlocks(document)) throw new Error('아직 연결되지 않은 학습 도구가 있습니다. 지원 상태를 확인해 주세요.');
      setMessage(''); return true;
    } catch (error) { setMessage((error as Error).message); return false; }
  }
  useImperativeHandle(ref, () => ({ validate, showPreview: () => setPreview(true), async save(lessonId) {
    if (!active) return;
    if (!validate()) throw new Error('학습 구성의 입력 항목을 확인해 주세요.');
    try { await writer.save(lessonId, document); setSaved(JSON.stringify(document)); setInvalid(false); setMessage('학습 구성을 저장했습니다.'); }
    catch (error) { if ((error as { status?: number }).status === 409) setConflict(true); setMessage((error as Error).message); throw error; }
  } }));
  function update(index: number, patch: Partial<LessonBlock>) { setDocument(previous => ({ ...previous, blocks: previous.blocks.map((block, i) => i === index ? { ...block, ...patch } : block) })); }
  function move(index: number, offset: number) { setDocument(previous => { const blocks = [...previous.blocks]; [blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]]; return { ...previous, blocks }; }); }
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })); const a = window.document.createElement('a'); a.href = url; a.download = '학습-편집내용.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  if (!snapshot.editable) return <p role="alert">이 학습을 편집할 권한이 없습니다.</p>;
  if (!active) return <div className="lba-intro"><p>본문 사이에 질문·영상·생성기를 넣을 수 있습니다. 기존 내용은 첫 항목으로 가져옵니다.</p><button type="button" className="btn" disabled={disabled} onClick={() => { setDocument({ ...empty(), blocks: structuredClone(legacyBlocks) }); setActive(true); }}>여러 항목으로 구성하기</button></div>;
  return <div ref={root} className={'lb-author' + (invalid ? ' was-validated' : '')}>
    <div className="lba-actions"><strong>학습 순서 편집</strong><button type="button" className="btn small" onClick={() => setPreview(value => !value)}>{preview ? '편집 화면으로' : '구성 미리보기'}</button><span>항목 {document.blocks.length}개</span></div>
    <p className="meta">아래 ‘학습 저장’을 누르면 기본 정보와 함께 저장됩니다. 이전 학생 답변은 해당 수업 버전과 함께 보관됩니다.</p>
    {preview && <div className="lba-preview" aria-label="구성 미리보기"><LessonBlockView document={publicLessonBlocks(document)} values={{ blocks: {}, checklist: [] }} onChange={() => {}} readOnly /></div>}
    <fieldset disabled={disabled || conflict} hidden={preview} className="lba-main-fields">
      {document.blocks.map((block, index) => <article className="lba-block" key={block.id} data-author-block={block.id}>
        <div className="lba-actions"><h3>{index + 1}. {choices.find(item => item.type === block.type)?.label || block.type}</h3><button type="button" className="btn small" aria-label={`항목 ${index + 1} 위로`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="btn small" aria-label={`항목 ${index + 1} 아래로`} disabled={index === document.blocks.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="btn small" aria-label={`항목 ${index + 1} 삭제`} onClick={() => { if (window.confirm('이 항목을 편집 목록에서 삭제할까요? 저장한 뒤 반영되며 이전 학생 답변은 보관됩니다.')) setDocument(previous => ({ ...previous, blocks: previous.blocks.filter((_, i) => i !== index) })); }}>삭제</button></div>
        {block.type === 'text' ? editingTextId === block.id
          ? <LessonBodyEditor label={`항목 ${index + 1} 본문`} value={block.content || ''} disabled={disabled || conflict} onChange={content => update(index, { content })} />
          : <div><div className="lba-text-preview"><LessonText text={block.content || '본문을 입력해 주세요.'} /></div><button type="button" className="btn small" onClick={() => setEditingTextId(block.id)} aria-label={`항목 ${index + 1} 본문 편집`}>본문 편집</button></div>
          : ['heading', 'subheading', 'prompt'].includes(block.type) ? <Field label="내용 *"><textarea required rows={block.type === 'prompt' ? 5 : 2} maxLength={200000} value={block.content || ''} onChange={event => update(index, { content: event.target.value })} /></Field> : null}
        {['image', 'audio', 'video', 'link'].includes(block.type) && <><Field label="주소 *"><input required type="url" pattern="https://.*" maxLength={4000} value={block.url || ''} placeholder="https://" onChange={event => update(index, { url: event.target.value })} /></Field><Field label={block.type === 'link' ? '링크에 표시할 문구' : '설명'}><input value={block.content || ''} maxLength={5000} onChange={event => update(index, { content: event.target.value })} /></Field>{block.type === 'image' && <Field label="이미지 대체 설명"><input maxLength={1000} value={block.alt || ''} onChange={event => update(index, { alt: event.target.value })} /></Field>}</>}
        {block.type === 'question' && <><Field label="질문 문구 *"><textarea required rows={3} maxLength={5000} value={block.question?.label || ''} onChange={event => update(index, { question: { ...block.question!, label: event.target.value } })} /></Field><label className="lb-choice"><input type="checkbox" checked={block.question?.required || false} onChange={event => update(index, { question: { ...block.question!, required: event.target.checked } })} />필수 답변</label>{block.question?.kind !== 'text' && <p role="alert">첨부 답변은 업로드 연결 후 사용할 수 있습니다.</p>}</>}
        {block.type === 'prompt-generator' && <GeneratorFields block={block} update={patch => update(index, patch)} />}
        {isGuidedTool(block.type) && <div><p>{block.type === 'persona-generator' ? '15개 질문으로 핵심 고객을 정의하고 프롬프트를 만듭니다.' : '10개 질문과 전환 목적별 추가 질문으로 랜딩페이지 기획 프롬프트를 만듭니다.'}</p><details><summary>포함된 질문 보기</summary><ol>{block.fields?.map(field => <li key={field.id}>{field.label}</li>)}</ol></details></div>}
        {block.type === 'quiz' && <QuizFields block={block} update={patch => update(index, patch)} />}
        {!choices.some(choice => choice.type === block.type) && <p role="alert">이 도구의 편집 화면을 연결하고 있습니다. 원래 설정은 그대로 보관됩니다.</p>}
      </article>)}
      <div className="lba-actions"><label>추가할 항목 <select value={type} onChange={event => setType(event.target.value as LessonBlockType)}>{choices.map(choice => <option key={choice.type} value={choice.type}>{choice.label}</option>)}</select></label><button type="button" className="btn" disabled={document.blocks.length >= 1000} onClick={() => { const block = newBlock(type); setDocument(previous => ({ ...previous, blocks: [...previous.blocks, block] })); if (type === 'text') setEditingTextId(block.id); }}>항목 추가</button></div>
      <section className="lba-block"><h3>체크리스트</h3>{document.checklist.map((item, index) => <div className="lba-check-edit" key={item.id}><input required maxLength={5000} aria-label={`체크 항목 ${index + 1}`} value={item.label} onChange={event => setDocument(previous => ({ ...previous, checklist: previous.checklist.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) }))} /><label><input type="checkbox" checked={item.required} onChange={event => setDocument(previous => ({ ...previous, checklist: previous.checklist.map((entry, i) => i === index ? { ...entry, required: event.target.checked } : entry) }))} />필수</label><button type="button" className="btn small" aria-label={`체크 항목 ${index + 1} 삭제`} onClick={() => setDocument(previous => ({ ...previous, checklist: previous.checklist.filter((_, i) => i !== index) }))}>삭제</button></div>)}<button type="button" className="btn small" disabled={document.checklist.length >= 1000} onClick={() => setDocument(previous => ({ ...previous, checklist: [...previous.checklist, { id: crypto.randomUUID(), label: '', required: true }] }))}>체크 항목 추가</button></section>
    </fieldset>
    {message && <p className="notice" role={invalid || conflict ? 'alert' : 'status'}>{message}</p>}
    {conflict && <button type="button" className="btn" onClick={download}>현재 편집 내용 내려받기</button>}
  </div>;
});

export const LessonBlockAuthor = forwardRef<BlockAuthorHandle, Props>(function LessonBlockAuthor(props, ref) {
  // New lesson: once assigned a server id, preserve this in-progress editor
  // instead of issuing a GET which could reset the just-created document.
  const [initialLessonId] = useState(props.lessonId);
  const [state, setState] = useState<{ snapshot?: Snapshot; error?: string }>(() => initialLessonId ? {} : { snapshot: { revision: null, document: null, editable: true } });
  const [attempt, setAttempt] = useState(0);
  const onState = props.onState;
  useEffect(() => {
    if (!initialLessonId) return;
    const abort = new AbortController();
    onState({ active: false, dirty: false, blocked: true });
    void fetch(`/api/platform/lesson-blocks?lesson=${encodeURIComponent(initialLessonId)}`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '학습 구성을 불러오지 못했습니다.');
      if (data.document) data.document = validateLessonBlocks(data.document);
      if (!abort.signal.aborted) setState({ snapshot: data });
    }).catch(error => { if (!abort.signal.aborted) setState({ error: (error as Error).message }); });
    return () => abort.abort();
  }, [initialLessonId, attempt, onState]);
  if (state.error) return <div role="alert"><p>{state.error}</p><button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>학습 구성 다시 불러오기</button></div>;
  if (!state.snapshot) return <p role="status">학습 구성을 불러오고 있습니다.</p>;
  return <LoadedAuthor {...props} snapshot={state.snapshot} ref={ref} />;
});
