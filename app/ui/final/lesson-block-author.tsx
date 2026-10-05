"use client";

import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { defaultBlockCompletion, gradeBlockQuiz, assessBlockCompletion, publicLessonBlocks, validateLessonBlocks, type BlockField, type LessonBlock, type LessonBlockDocument, type LessonBlockType } from '@/lib/lesson-blocks';
import { LessonDocumentWriter, type LessonDocumentWrite } from '@/lib/lesson-block-authoring';
import { isGuidedTool, newGuidedBlock } from '@/lib/lesson-guided-tools';
import { isCalculator, newCalculatorBlock } from '@/lib/lesson-calculators';
import { LessonLinkPreview } from './lesson-link-preview';
import { LessonBodyEditor } from './lesson-body-editor';
import { LessonText } from './lesson-text';
import { canRenderLessonBlocks, LessonBlockView } from './lesson-block-view';
import { LessonMediaUpload } from './lesson-media-upload';
import { lessonMediaSpec, type LessonMediaKind } from '@/lib/lesson-media';
import { uploadLessonMedia } from '@/lib/lesson-media-upload';
import { positionLessonImage, type LessonImagePosition } from '@/lib/lesson-image-position';
import { lessonDocumentForEditor, serializeLessonDocument } from '@/lib/lesson-body';
import { LessonImageLayout } from './lesson-image-layout';
import type { BlockEditorDraft } from '@/lib/learning-editor-draft';
import { applyLessonImport, type LessonCardSource, type TextImportResult } from '@/lib/lesson-editor-import';
import { TextLessonImport, LessonCardImport } from './lesson-editor-import';
import { moveOrderedItem, useReorderDrag } from './reorder-drag';
import './lesson-block-author.css';

export type BlockAuthorState = { active: boolean; dirty: boolean; blocked: boolean; blockedReason?: string; uploading?: boolean; draftReady?: boolean; changeKey?: string };
export type BlockAuthorHandle = { validate: () => boolean; showPreview: () => void; save: (lessonId: string) => Promise<void>; captureDraft: () => BlockEditorDraft; restoreDraft: (draft: BlockEditorDraft, fromServer?: boolean) => void; acknowledgeDraft: (revision: string, committed?: LessonBlockDocument | null) => void };
type Props = { autosave?: boolean; initialSnapshot?: Snapshot; lessonId: string; courseId?: string; sources?: LessonCardSource[]; legacyBlocks: LessonBlock[]; disabled: boolean; onState: (state: BlockAuthorState) => void };
type Snapshot = { revision: string | null; document: LessonBlockDocument | null; editable: boolean };
const DocumentCanvas = lazy(() => import('./lesson-document-canvas').then(module => ({ default: module.LessonDocumentCanvas })));
const empty = (): LessonBlockDocument => ({ schemaVersion: 1, blocks: [], checklist: [] });
const choices: { type: LessonBlockType; label: string }[] = [
  { type: 'heading', label: '큰 제목' }, { type: 'subheading', label: '작은 제목' }, { type: 'text', label: '본문' },
  { type: 'image', label: '이미지' }, { type: 'audio', label: '음성' }, { type: 'video', label: '영상' },
  { type: 'question', label: '중간 질문' }, { type: 'link', label: '외부 링크' }, { type: 'prompt', label: '복사할 프롬프트' },
  { type: 'prompt-generator', label: '프롬프트 생성기' }, { type: 'quiz', label: '확인 문제' }, { type: 'divider', label: '구분선' },
  { type: 'persona-generator', label: '페르소나 생성기' }, { type: 'landing-planner', label: '랜딩페이지 기획 문답' },
  { type: 'recipe-calculator', label: '레시피 실행 계산기' }, { type: 'margin-calculator', label: '마진 계산기' }, { type: 'marketing-funnel', label: '마케팅 퍼널' },
];
function newBlock(type: LessonBlockType): LessonBlock {
  if (isGuidedTool(type)) return newGuidedBlock(type, crypto.randomUUID());
  if (isCalculator(type)) return newCalculatorBlock(type, crypto.randomUUID());
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

const LoadedAuthor = forwardRef<BlockAuthorHandle, Props & { snapshot: Snapshot }>(function LoadedAuthor({ autosave = false, snapshot, legacyBlocks, disabled, onState, courseId, lessonId, sources = [] }, ref) {
  const [document, setDocument] = useState<LessonBlockDocument>(() => snapshot.document || empty());
  const [active, setActive] = useState(Boolean(snapshot.document)), [saved, setSaved] = useState(JSON.stringify(snapshot.document));
  const [type, setType] = useState<LessonBlockType>('text'), [preview, setPreview] = useState(false), [message, setMessage] = useState(''), [invalid, setInvalid] = useState(false), [conflict, setConflict] = useState(false);
  const [detailed, setDetailed] = useState(false), [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [canvasError, setCanvasError] = useState('');
  const [invalidItems, setInvalidItems] = useState<{ id: string; label: string }[]>([]);
  const [previewInteractive, setPreviewInteractive] = useState(false);
  const [previewMessage, setPreviewMessage] = useState('');
  const [previewValues, setPreviewValues] = useState({ blocks: {}, checklist: [] } as import('@/lib/lesson-blocks').LessonBlockAnswers);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'text' | 'cards' | null>(null);
  const [importUndo, setImportUndo] = useState<{ before: LessonBlockDocument; after: string } | null>(null);
  const [writer, setWriter] = useState(() => new LessonDocumentWriter(snapshot.revision, snapshot.document, saveDocument));
  const root = useRef<HTMLDivElement>(null);
  const uploads = useRef(new Set<string>()), [uploadIds, setUploadIds] = useState<string[]>([]);
  const uploading = uploadIds.length > 0;
  function uploadPending(id: string, pending: boolean) { if (pending) uploads.current.add(id); else uploads.current.delete(id); setUploadIds([...uploads.current]); }
  function attach(id: string, assetId: string) { setDocument(previous => ({ ...previous, blocks: previous.blocks.map(block => { if (block.id !== id) return block; const next = { ...block, assetId }; delete next.url; return next; }) })); }
  const [positionedIds, setPositionedIds] = useState<string[]>([]), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function positionImage(image: LessonBlock, position: LessonImagePosition) {
    try {
      const blocks = positionLessonImage(document.blocks, image, position, crypto.randomUUID());
      setDocument(previous => ({ ...previous, blocks })); setEditingTextId(null); setMessage(autosave ? '이미지 위치를 바꿨습니다. 자동저장합니다.' : '이미지 위치를 바꿨습니다. 아래 저장 버튼을 눌러 보관해 주세요.');
    } catch (error) { setMessage((error as Error).message); }
  }
  async function insertImage(files: File[], position: LessonImagePosition) {
    if (disabled || conflict) return;
    if (uploads.current.size) { setMessage('진행 중인 파일 업로드가 끝난 뒤 추가해 주세요.'); return; }
    if (!courseId) { setMessage('먼저 기본 정보에서 주차를 선택해 주세요.'); return; }
    if (files.length !== 1) { setMessage('이미지는 한 번에 한 장씩 넣어 주세요.'); return; }
    const file = files[0], image = newBlock('image');
    try {
      lessonMediaSpec(file.name, file.size, 'image');
      const blocks = positionLessonImage(document.blocks, image, position, crypto.randomUUID());
      // Reserve the stable block ID now; async completion never reads the caret
      // or an array index. Other text can be edited while the upload is pending.
      setPositionedIds(previous => [...previous, image.id]); uploadPending(image.id, true);
      setDocument(previous => ({ ...previous, blocks })); setEditingTextId(null); setMessage('선택한 위치에 이미지를 올리고 있습니다.');
    } catch (error) { setMessage((error as Error).message); return; }
    try {
      const assetId = await uploadLessonMedia(file, 'image', courseId, crypto.randomUUID());
      if (mounted.current) { attach(image.id, assetId); setMessage(autosave ? '선택한 위치에 이미지를 넣었습니다. 자동저장합니다.' : '선택한 위치에 이미지를 넣었습니다. 아래 저장 버튼을 눌러 보관해 주세요.'); }
    } catch (error) {
      if (mounted.current) {
        setDocument(previous => ({ ...previous, blocks: previous.blocks.filter(block => block.id !== image.id) }));
        setMessage(`이미지를 올리지 못했습니다. ${(error as Error).message} 작성한 글은 그대로 유지됩니다.`);
      }
    } finally { if (mounted.current) { setPositionedIds(previous => previous.filter(id => id !== image.id)); uploadPending(image.id, false); } }
  }
  const dirty = active && (uploading || JSON.stringify(document) !== saved);
  useEffect(() => { onState({ active, dirty, blocked: !snapshot.editable || conflict || uploading || Boolean(canvasError),
    blockedReason: !snapshot.editable ? '이 수업을 편집할 권한이 없습니다. 운영자에게 권한을 확인해 주세요.'
      : conflict ? '다른 화면에서 학습 구성을 저장했습니다. 편집 내용을 내려받아 보관한 뒤 저장된 내용과 비교해 주세요.'
      : uploading ? '파일을 올리고 있습니다. 업로드가 끝나면 저장할 수 있습니다.'
      : canvasError ? `본문 서식을 확인해야 합니다. ${canvasError} 현재 편집 화면을 닫지 말고 본문 안내를 확인해 주세요.` : undefined,
    uploading, draftReady: snapshot.editable && !canvasError, changeKey: JSON.stringify(document) }); }, [active, dirty, conflict, snapshot.editable, onState, uploading, canvasError, document]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) { if (dirty) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  function validate() {
    if (canvasError) { setMessage(canvasError); return false; }
    if (uploads.current.size) { setMessage('파일 업로드가 끝난 뒤 저장해 주세요.'); return false; }
    if (!active) return true;
    setInvalid(true); setPreview(false);
    const problems: { id: string; label: string }[] = [];
    for (const [index, block] of document.blocks.entries()) {
      try {
        if (['heading', 'subheading', 'prompt', 'prompt-generator'].includes(block.type) && !block.content?.trim()) throw new Error('내용을 입력해 주세요.');
        validateLessonBlocks({ schemaVersion: 1, blocks: [block], checklist: [] });
      } catch (error) {
        problems.push({ id: block.id, label: `${index + 1}번 ${choices.find(item => item.type === block.type)?.label || '항목'}: ${(error as Error).message}` });
      }
    }
    setInvalidItems(problems);
    if (problems.length) {
      setSelectedBlockId(problems[0].id); setMessage(`필수 항목 ${problems.length}개를 확인해 주세요.`);
      requestAnimationFrame(() => { const field = root.current?.querySelector<HTMLInputElement>('.ldc-inspector input:invalid,.ldc-inspector textarea:invalid'); field?.focus(); });
      return false;
    }
    const input = root.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:invalid,textarea:invalid,select:invalid');
    if (input) { root.current?.querySelectorAll('details').forEach(detail => { detail.open = true; }); requestAnimationFrame(() => { input.focus(); input.reportValidity(); }); setMessage('빨간색으로 표시된 필수 항목을 입력해 주세요.'); return false; }
    try {
      validateLessonBlocks(document);
      if (!document.blocks.length && !document.checklist.length) throw new Error('본문이나 질문을 한 개 이상 추가해 주세요.');
      if (!canRenderLessonBlocks(document)) throw new Error('아직 연결되지 않은 학습 도구가 있습니다. 지원 상태를 확인해 주세요.');
      setMessage(''); return true;
    } catch (error) { setMessage((error as Error).message); return false; }
  }
  useImperativeHandle(ref, () => ({ validate, showPreview: () => setPreview(true),
    acknowledgeDraft(revision, committed = active ? document : null) { setSaved(JSON.stringify(committed)); setWriter(new LessonDocumentWriter(revision, committed, saveDocument)); },
    captureDraft: () => structuredClone({ active, document, writer: writer.checkpoint() }),
    restoreDraft(draft, fromServer = false) {
      if (!snapshot.editable || (disabled && !fromServer) || uploads.current.size) throw new Error('학습을 편집할 수 있을 때 다시 불러와 주세요.');
      if (fromServer) { setWriter(new LessonDocumentWriter(draft.writer.revision, draft.writer.committed, saveDocument)); setSaved(JSON.stringify(draft.writer.committed)); }
      else writer.restore(draft.writer, lessonId);
      setDocument(structuredClone(draft.document)); setActive(draft.active); setPreview(false); setEditingTextId(null); setInvalid(false); setMessage('');
    },
    async save(lessonId) {
    if (!active) return;
    if (!validate()) throw new Error('학습 구성의 입력 항목을 확인해 주세요.');
    try { await writer.save(lessonId, document); setSaved(JSON.stringify(document)); setInvalid(false); setMessage('학습 구성을 저장했습니다.'); }
    catch (error) { if ((error as { status?: number }).status === 409) setConflict(true); setMessage((error as Error).message); throw error; }
  } }));
  function update(id: string, patch: Partial<LessonBlock>) { setDocument(previous => ({ ...previous, blocks: previous.blocks.map(block => block.id === id ? { ...block, ...patch } : block) })); }
  function move(index: number, offset: number) { moveTo(index, index + offset); }
  function moveTo(index: number, target: number) { setDocument(previous => ({ ...previous, blocks: moveOrderedItem(previous.blocks, index, target) })); }
  const blockDrag = useReorderDrag(document.blocks.map(block => block.id), moveTo, disabled || conflict || uploading);
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })); const a = window.document.createElement('a'); a.href = url; a.download = '학습-편집내용.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function importContent(content: Pick<TextImportResult, 'blocks' | 'checklist'>, mode: 'append' | 'replace' | number) {
    if (disabled || conflict || uploads.current.size) throw new Error('저장·업로드 상태를 확인한 뒤 가져와 주세요.');
    const next = applyLessonImport(document, content, mode);
    setImportUndo({ before: structuredClone(document), after: JSON.stringify(next) }); setDocument(next); setEditingTextId(null); setInvalid(false); setMessage(autosave ? '가져온 내용을 적용했습니다. 자동저장합니다.' : '가져온 내용을 편집 화면에 적용했습니다. 아래 저장 버튼을 눌러 보관해 주세요.');
  }
  function renderBlock(block: LessonBlock, index: number) { return <article className={`lba-block${blockDrag.overId === block.id ? ' reorder-item-over' : ''}`} key={block.id} data-author-block={block.id} data-block-type={block.type} {...blockDrag.row(block.id)}>
        <div className="lba-actions">{blockDrag.handle(block.id, `항목 ${index + 1}`)}<h3>{index + 1}. {choices.find(item => item.type === block.type)?.label || block.type}</h3><button type="button" className="btn small" aria-label={`항목 ${index + 1} 위로`} disabled={uploadIds.includes(block.id) || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="btn small" aria-label={`항목 ${index + 1} 아래로`} disabled={uploadIds.includes(block.id) || index === document.blocks.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="btn small" aria-label={`항목 ${index + 1} 삭제`} disabled={uploadIds.includes(block.id)} onClick={() => { if (window.confirm('이 항목을 편집 목록에서 삭제할까요? 저장한 뒤 반영되며 이전 학생 답변은 보관됩니다.')) setDocument(previous => ({ ...previous, blocks: previous.blocks.filter((_, i) => i !== index) })); }}>삭제</button></div>
        {block.type === 'text' ? editingTextId === block.id
          ? <LessonBodyEditor label={`항목 ${index + 1} 본문`} value={block.content || ''} disabled={disabled || conflict} onChange={content => update(block.id, { content })} />
          : <div><div className="lba-text-preview"><LessonText text={serializeLessonDocument(lessonDocumentForEditor(block.content || '본문을 입력해 주세요.'))} /></div><button type="button" className="btn small" onClick={() => setEditingTextId(block.id)} aria-label={`항목 ${index + 1} 본문 편집`}>본문 편집</button></div>
          : ['heading', 'subheading', 'prompt'].includes(block.type) ? <Field label="내용 *"><textarea required rows={block.type === 'prompt' ? 5 : 2} maxLength={200000} value={block.content || ''} onChange={event => update(block.id, { content: event.target.value })} /></Field> : null}
        {block.type === 'image' && <>
          {positionedIds.includes(block.id) ? <p className="lba-image-placeholder" role="status">이 위치에 이미지를 올리고 있습니다…</p> : <>
            <button type="button" className="btn small lba-image-handle" draggable={!disabled && !conflict && !uploading} disabled={uploading} data-image-move={block.id} aria-label={`항목 ${index + 1} 이미지 이동 손잡이`}>⠿ 이미지 이동</button>
            {(block.assetId || block.url) && <div className="lba-image-preview" draggable={!disabled && !conflict && !uploading} data-image-move={block.id}><LessonBlockView document={{ ...empty(), blocks: [block] }} values={{ blocks: {}, checklist: [] }} onChange={() => {}} readOnly /></div>}
          </>}
        </>}
        {['image', 'audio', 'video', 'link'].includes(block.type) && !positionedIds.includes(block.id) && <fieldset className="lba-media-fields" disabled={uploadIds.includes(block.id)}>
          {block.type !== 'link' && <LessonMediaUpload courseId={courseId} kind={block.type as LessonMediaKind} assetId={block.assetId} disabled={disabled || conflict || uploadIds.includes(block.id)} onReady={id => attach(block.id, id)} onPending={pending => uploadPending(block.id, pending)} />}
          {block.assetId ? <button type="button" className="btn small" onClick={() => { if (window.confirm('파일 연결을 지우고 외부 주소를 입력할까요? 기존 저장본의 파일은 보관됩니다.')) setDocument(previous => ({ ...previous, blocks: previous.blocks.map(item => { if (item.id !== block.id) return item; const next = { ...item, url: '' }; delete next.assetId; return next; }) })); }}>외부 주소로 바꾸기</button>
            : <Field label="주소 *" hint={block.type !== 'link' ? '파일을 올리거나 HTTPS 주소를 입력해 주세요.' : undefined}><input required type="url" pattern="https://.*" maxLength={4000} value={block.url || ''} placeholder="https://" onChange={event => update(block.id, { url: event.target.value })} /></Field>}<Field label={block.type === 'link' ? '링크에 표시할 문구' : '설명'}><input value={block.content || ''} maxLength={5000} onChange={event => update(block.id, { content: event.target.value })} /></Field>{block.type === 'image' && <Field label="이미지 대체 설명"><input maxLength={1000} value={block.alt || ''} onChange={event => update(block.id, { alt: event.target.value })} /></Field>}</fieldset>}
        {block.type === 'link' && <LessonLinkPreview key={block.id + ':' + (block.url || '')} url={block.url || ''} onApply={content => update(block.id, { content })}/>}
        {block.type === 'question' && <><Field label="질문 문구 *"><textarea required rows={3} maxLength={5000} value={block.question?.label || ''} onChange={event => update(block.id, { question: { ...block.question!, label: event.target.value } })} /></Field><label className="lb-choice"><input type="checkbox" checked={block.question?.required || false} onChange={event => update(block.id, { question: { ...block.question!, required: event.target.checked } })} />필수 답변</label><Field label="답변 유형"><select value={block.question?.kind || 'text'} onChange={event => update(block.id, { question: { ...block.question!, kind: event.target.value as 'text' | 'image' | 'file' } })}><option value="text">텍스트</option><option value="image">이미지 + 압축파일</option><option value="file">압축파일</option></select></Field></>}
        {block.type === 'prompt-generator' && <GeneratorFields block={block} update={patch => update(block.id, patch)} />}
        {isGuidedTool(block.type) && <div><p>{block.type === 'persona-generator' ? '15개 질문으로 핵심 고객을 정의하고 프롬프트를 만듭니다.' : '10개 질문과 전환 목적별 추가 질문으로 랜딩페이지 기획 프롬프트를 만듭니다.'}</p><details><summary>포함된 질문 보기</summary><ol>{block.fields?.map(field => <li key={field.id}>{field.label}</li>)}</ol></details></div>}
        {isCalculator(block.type) && <p>{block.type === 'recipe-calculator' ? '3일간의 플레이스 지표로 일 평균과 연습 목표 달성율을 계산합니다.' : block.type === 'margin-calculator' ? '가격·비용·수수료·부가세 조건을 입력해 예상 마진을 계산합니다.' : '단계를 편집하고 전환율을 확인하며 퍼널 이미지를 내려받을 수 있습니다.'} 학생 입력은 자동저장됩니다.</p>}
        {block.type === 'quiz' && <QuizFields block={block} update={patch => update(block.id, patch)} />}
        {!choices.some(choice => choice.type === block.type) && <p role="alert">이 도구의 편집 화면을 연결하고 있습니다. 원래 설정은 그대로 보관됩니다.</p>}
      </article>; }
  if (!snapshot.editable) return <p role="alert">이 학습을 편집할 권한이 없습니다.</p>;
  if (!active) return <div className="lba-intro"><p>본문 사이에 질문·영상·생성기를 넣을 수 있습니다. 기존 내용은 첫 항목으로 가져옵니다.</p><button type="button" className="btn" disabled={disabled} onClick={() => { setDocument({ ...empty(), blocks: structuredClone(legacyBlocks) }); setActive(true); }}>여러 항목으로 구성하기</button></div>;
  return <div ref={root} className={'lb-author' + (invalid ? ' was-validated' : '')}>
    <div className="lba-actions"><strong>수업 문서 편집</strong><button type="button" className="btn small" onClick={() => setPreview(value => !value)}>{preview ? '편집 화면으로' : '구성 미리보기'}</button><span>항목 {document.blocks.length}개</span><button type="button" className="btn small" onClick={() => setDetailed(value => !value)}>{detailed ? '문서로 편집' : '항목별 상세 설정'}</button></div>
    <p className="meta">{autosave ? "작성 내용은 자동저장됩니다. 이전 학생 답변도 유지됩니다." : "아래 저장 버튼을 누르면 기본 정보와 함께 저장됩니다. 이전 학생 답변은 해당 수업 버전과 함께 보관됩니다."}</p>
    {preview && <div className="lba-preview" aria-label="구성 미리보기"><button className="btn small" type="button" onClick={() => setPreviewInteractive(value => !value)}>{previewInteractive ? '전체 구성 보기' : '입력·제출 체험'}</button><LessonBlockView readOnly={!previewInteractive} document={publicLessonBlocks(document)} values={previewValues} onChange={values => { setPreviewValues(values); setPreviewMessage(''); }} grade={async id => { const block = document.blocks.find(item => item.id === id)!; return gradeBlockQuiz(block, typeof previewValues.blocks[id] === 'object' ? previewValues.blocks[id] as Record<string, string | number> : {}); }} /><p className="meta">미리보기 입력은 저장·제출·알림을 만들지 않습니다.</p><button type="button" className="btn" onClick={() => { const result = assessBlockCompletion(document, previewValues); setPreviewMessage(result.ready ? (document.completion?.mode === 'mentor' ? '제출 가능 · 실제 학습에서는 멘토 확인을 기다립니다.' : '학습 완료 조건을 충족했습니다.') : '필수 답변·체크리스트·시험 통과 조건을 확인해 주세요.'); }}>완료 조건 확인</button>{previewMessage && <p role="status">{previewMessage}</p>}</div>}
    <fieldset disabled={disabled || conflict} hidden={preview} className="lba-main-fields">
      <div className="lba-actions"><button type="button" className="btn" disabled={uploading} onClick={() => setImportMode('text')}>텍스트·파일 가져오기</button><button type="button" className="btn" disabled={uploading || !sources.length} onClick={() => setImportMode('cards')}>다른 학습 카드 가져오기</button>
        {importUndo && importUndo.after === JSON.stringify(document) && saved !== importUndo.after && <button type="button" className="btn" onClick={() => { setDocument(importUndo.before); setImportUndo(null); setMessage('가져오기 직전 내용으로 되돌렸습니다.'); }}>마지막 가져오기 되돌리기</button>}
      </div>
      <details className="ldc-settings" open={detailed || undefined}><summary>수업 설정 · 태그·완료 기준</summary>
      <section className="lba-block"><h3>학습 태그</h3>
        <Field label="학생에게 표시할 태그" hint="예: 기초, AI 활용. 비워두면 표시하지 않습니다."><input maxLength={100} value={document.presentation?.tagLabel || ''} onChange={event => setDocument(previous => ({ ...previous, presentation: { tag: previous.presentation?.tag || '', tagLabel: event.target.value } }))} /></Field>
        <details><summary>태그 관리용 이름</summary><Field label="태그 내부 키" hint="원본 학습의 태그 키를 보관합니다. 학생에게는 위의 표시 문구만 보여줍니다."><input maxLength={100} value={document.presentation?.tag || ''} onChange={event => setDocument(previous => ({ ...previous, presentation: { tagLabel: previous.presentation?.tagLabel || '', tag: event.target.value } }))} /></Field></details>
      </section>
      <section className="lba-block"><h3>학습 완료 기준</h3>
        <Field label="학습 개방 방식"><select value={document.progression?.track || ''} onChange={event => setDocument(previous => {
          const track = event.target.value;
          if (!track) { const next = { ...previous }; delete next.progression; return next; }
          return { ...previous, progression: { track: track as 'daily' | 'learning', dayNumber: previous.progression?.dayNumber || 1 },
            completion: { mode: track === 'daily' ? 'mentor' : 'self', requireAnswers: false, requireQuizPass: track === 'learning' },
            blocks: previous.blocks.map(block => track === 'learning' && block.quiz ? { ...block, quiz: { ...block.quiz, passPercent: 100 } } : block) };
        })}><option value="">순서 제한 없음</option><option value="daily">데일리 미션 — 승인 후 다음 일차</option><option value="learning">별도 학습 — 이전 학습 통과 후</option></select></Field>
        {document.progression && <><Field label="전체 과정에서 몇 일차인가요? *"><input type="number" required min={1} max={30} step={1} value={document.progression.dayNumber || ''} onChange={event => setDocument(previous => ({ ...previous, progression: { ...previous.progression!, dayNumber: Number(event.target.value) } }))} /></Field>
          <p className="meta">주차 안의 번호가 아니라 전체 과정의 1~30일차입니다. 데일리와 별도 학습은 각각 다른 순서로 진행합니다. 자동승인 주차는 기수·회차 관리에서 설정합니다.</p></>}
        <Field label="완료 방식"><select value={(document.completion || defaultBlockCompletion).mode} onChange={event => setDocument(previous => ({ ...previous, completion: { ...(previous.completion || defaultBlockCompletion), mode: event.target.value as 'self' | 'mentor' } }))}><option value="self">조건을 채우면 학습 완료</option><option value="mentor">제출 후 멘토 확인</option></select></Field>
        <label className="lb-choice"><input type="checkbox" checked={(document.completion || defaultBlockCompletion).requireAnswers} onChange={event => setDocument(previous => ({ ...previous, completion: { ...(previous.completion || defaultBlockCompletion), requireAnswers: event.target.checked } }))} />필수 질문·생성기 입력 완료 필요</label>
        <label className="lb-choice"><input type="checkbox" checked={(document.completion || defaultBlockCompletion).requireQuizPass} onChange={event => setDocument(previous => ({ ...previous, completion: { ...(previous.completion || defaultBlockCompletion), requireQuizPass: event.target.checked } }))} />시험 통과 필요</label>
        <p className="meta">필수 체크리스트는 항상 확인합니다. 연습용 시험은 통과 조건을 끌 수 있습니다. 멘토 확인 방식은 제출만으로 학습 완료가 되지 않습니다.</p>
      </section>
      </details>
      {!detailed && <div className={"ldc-layout" + (selectedBlockId ? " has-selection" : "")}><Suspense fallback={<p role="status">문서 편집기를 준비하고 있습니다.</p>}><DocumentCanvas blocks={document.blocks} disabled={disabled || conflict || uploading} choices={choices} create={newBlock} onChange={blocks => setDocument(previous => ({ ...previous, blocks }))} onError={setCanvasError} onSettings={setSelectedBlockId} onImage={(files, position) => { void insertImage(files, position); }} /></Suspense>
        {selectedBlockId && <aside className="ldc-inspector" aria-label="선택 항목 설정"><div className="ldc-inspector-title"><strong>항목 설정</strong><button type="button" className="btn small" onClick={() => setSelectedBlockId(null)}>설정 닫기</button></div>{document.blocks.filter(block => block.id === selectedBlockId).map(block => renderBlock(block, document.blocks.indexOf(block)))}</aside>}
      </div>}
      {detailed && <>
      <p className="meta">이미지를 원하는 문단 사이로 끌어 넣으세요. 파란 선 위치에 들어갑니다. 본문에 붙여 넣으면 현재 문단 다음에 들어갑니다. 등록된 이미지는 이동 손잡이나 ↑·↓ 버튼으로 옮길 수 있습니다.</p>
      <LessonImageLayout blocks={document.blocks} disabled={disabled || conflict} uploading={uploading} onMove={positionImage} onFiles={(files, position) => { void insertImage(files, position); }}>
      {document.blocks.map(renderBlock)}
      </LessonImageLayout>
      <div className="lba-actions"><label>추가할 항목 <select value={type} onChange={event => setType(event.target.value as LessonBlockType)}>{choices.map(choice => <option key={choice.type} value={choice.type}>{choice.label}</option>)}</select></label><button type="button" className="btn" disabled={document.blocks.length >= 1000} onClick={() => { const block = newBlock(type); setDocument(previous => ({ ...previous, blocks: [...previous.blocks, block] })); if (type === 'text') setEditingTextId(block.id); }}>항목 추가</button></div>
      </>}
      <details className="ldc-settings" open={detailed || undefined}><summary>완료 체크리스트</summary><section className="lba-block"><h3>체크리스트</h3>{document.checklist.map((item, index) => <div className="lba-check-edit" key={item.id}><input required maxLength={5000} aria-label={`체크 항목 ${index + 1}`} value={item.label} onChange={event => setDocument(previous => ({ ...previous, checklist: previous.checklist.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) }))} /><label><input type="checkbox" checked={item.required} onChange={event => setDocument(previous => ({ ...previous, checklist: previous.checklist.map((entry, i) => i === index ? { ...entry, required: event.target.checked } : entry) }))} />필수</label><button type="button" className="btn small" aria-label={`체크 항목 ${index + 1} 삭제`} onClick={() => setDocument(previous => ({ ...previous, checklist: previous.checklist.filter((_, i) => i !== index) }))}>삭제</button></div>)}<button type="button" className="btn small" disabled={document.checklist.length >= 1000} onClick={() => setDocument(previous => ({ ...previous, checklist: [...previous.checklist, { id: crypto.randomUUID(), label: '', required: true }] }))}>체크 항목 추가</button></section></details>
    </fieldset>
    {importMode === 'text' && <TextLessonImport onClose={() => setImportMode(null)} onApply={importContent} />}
    {importMode === 'cards' && <LessonCardImport currentId={lessonId} current={document} sources={sources} onClose={() => setImportMode(null)} onInsert={importContent} />}
    {invalid && invalidItems.length > 0 && <ul aria-label="확인할 필수 항목">{invalidItems.map(item => <li key={item.id}><button type="button" className="btn small" onClick={() => { setSelectedBlockId(item.id); requestAnimationFrame(() => root.current?.querySelector('.ldc-inspector')?.scrollIntoView({ block: 'center' })); }}>{item.label}</button></li>)}</ul>}
    {message && <p className="notice" role={invalid || conflict ? 'alert' : 'status'}>{message}</p>}
    {conflict && <button type="button" className="btn" onClick={download}>현재 편집 내용 내려받기</button>}
  </div>;
});

export const LessonBlockAuthor = forwardRef<BlockAuthorHandle, Props>(function LessonBlockAuthor(props, ref) {
  // New lesson: once assigned a server id, preserve this in-progress editor
  // instead of issuing a GET which could reset the just-created document.
  const [initialLessonId] = useState(props.lessonId);
  const [state, setState] = useState<{ snapshot?: Snapshot; error?: string }>(() => props.initialSnapshot ? { snapshot: props.initialSnapshot } : initialLessonId ? {} : { snapshot: { revision: null, document: null, editable: true } });
  const [attempt, setAttempt] = useState(0);
  const onState = props.onState;
  useEffect(() => {
    if (!initialLessonId || props.initialSnapshot) return;
    const abort = new AbortController();
    onState({ active: false, dirty: false, blocked: true, blockedReason: '학습 구성을 불러오고 있습니다. 잠시 기다려 주세요.' });
    void fetch(`/api/platform/lesson-blocks?lesson=${encodeURIComponent(initialLessonId)}`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '학습 구성을 불러오지 못했습니다.');
      if (data.document) data.document = validateLessonBlocks(data.document);
      if (!abort.signal.aborted) setState({ snapshot: data });
    }).catch(error => { if (!abort.signal.aborted) { setState({ error: (error as Error).message }); onState({ active: false, dirty: false, blocked: true, blockedReason: '학습 구성을 불러오지 못했습니다. ‘학습 구성 다시 불러오기’를 눌러 주세요.' }); } });
    return () => abort.abort();
  }, [initialLessonId, attempt, onState, props.initialSnapshot]);
  if (state.error) return <div role="alert"><p>{state.error}</p><button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>학습 구성 다시 불러오기</button></div>;
  if (!state.snapshot) return <p role="status">학습 구성을 불러오고 있습니다.</p>;
  return <LoadedAuthor {...props} snapshot={state.snapshot} ref={ref} />;
});
