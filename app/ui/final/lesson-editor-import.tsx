"use client";

import { useEffect, useRef, useState } from 'react';
import { AdminModal } from '@/features/admin-ui';
import { validateLessonBlocks, type LessonBlockDocument } from '@/lib/lesson-blocks';
import { curriculumTextLimit, importBlockLabels, parseCurriculumText, summarizeImportBlock, type LessonCardSource, type TextImportResult } from '@/lib/lesson-editor-import';
import './lesson-editor-import.css';

type ImportContent = Pick<TextImportResult, 'blocks' | 'checklist'>;
export function TextLessonImport({ onClose, onApply }: { onClose: () => void; onApply: (value: ImportContent, mode: 'append' | 'replace') => void }) {
  const [text, setText] = useState(''), [parsed, setParsed] = useState<TextImportResult | null>(null), [error, setError] = useState(''), [reading, setReading] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function file(file?: File) {
    if (!file) return;
    const ticket = ++request.current; setError(''); setReading(true);
    try {
      if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') throw new Error('UTF-8 텍스트(.txt) 파일을 선택해 주세요.');
      if (file.size > curriculumTextLimit) throw new Error('텍스트는 1MB 이하로 나누어 가져와 주세요.');
      const value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (ticket === request.current) { setText(value); setParsed(null); }
    } catch (cause) { if (ticket === request.current) setError(cause instanceof TypeError ? 'UTF-8 텍스트 파일로 저장한 뒤 다시 가져와 주세요.' : (cause as Error).message); }
    finally { if (ticket === request.current) setReading(false); }
  }
  function apply(mode: 'append' | 'replace') {
    if (!parsed) return;
    if (mode === 'replace' && !window.confirm('현재 편집 중인 카드 전체를 교체할까요? 가져온 체크리스트가 있으면 체크리스트도 교체합니다. 학습 저장 전까지 되돌릴 수 있습니다.')) return;
    try { onApply(parsed, mode); onClose(); } catch (cause) { setError((cause as Error).message); }
  }
  return <AdminModal title="텍스트로 학습 가져오기" onClose={onClose} className="lei-modal">
    <div className="admin-dialog-body">
      {!parsed ? <>
        <p>텍스트 파일을 선택하거나 본문을 붙여넣으세요. 미리 확인한 뒤 편집 화면에 추가합니다.</p>
        <div className="lei-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void file(event.dataTransfer.files[0]); }}>
          <label>텍스트 파일 선택<input type="file" accept=".txt,text/plain" disabled={reading} onChange={event => { void file(event.target.files?.[0]); event.target.value = ''; }} /></label><small>여기에 파일을 놓아도 됩니다. UTF-8 · 최대 1MB</small>
        </div>
        <label className="lb-field"><span>가져올 텍스트</span><textarea rows={12} value={text} disabled={reading} onChange={event => { request.current++; setText(event.target.value); setError(''); }} placeholder={'Day 1\n오늘의 학습\n\nQ\n어떤 고객을 돕고 싶나요?'} /></label>
        <details><summary>텍스트 작성 형식 보기</summary><ul>
          <li>Day N 다음 줄: 큰 제목 / N. 제목: 섹션 제목 / ---: 구분선</li>
          <li>Prompt → 복사하기 → ```로 감싼 본문: 복사할 프롬프트</li>
          <li>Q 다음 문단: 질문 / ‘이미지 업로드’ 문구: 이미지 답변</li>
          <li>쪽지시험 → 문항 N → 질문 → 선택지 4개 → 정답 : N</li>
          <li>맞춤형 프롬프트 생성기 → 질문·예시) 쌍 → Prompt와 틀</li>
          <li>미션 체크리스트 다음 줄들: 체크 항목, 끝의 *는 필수</li>
          <li>favicon → 이름 → HTTPS 주소: 링크 / [이미지 삽입 : 설명]: 이미지 자리</li>
        </ul><p>구조가 맞지 않으면 해당 줄을 알려드립니다. 일반 문장은 본문으로 유지합니다.</p></details>
      </> : <>
        <p role="status">카드 {parsed.blocks.length}개 · 체크리스트 {parsed.checklist.length}개</p>
        <ol className="lei-preview">{parsed.blocks.map(block => <li key={block.id}><strong>{importBlockLabels[block.type]}</strong><span>{summarizeImportBlock(block)}</span></li>)}</ol>
        {parsed.checklist.length > 0 && <ul>{parsed.checklist.map(item => <li key={item.id}>{item.required ? '[필수] ' : ''}{item.label}</li>)}</ul>}
        {parsed.warnings.map((warning, i) => <p className="notice" key={i}>{warning}</p>)}
        <p>‘전체 교체’는 카드 전체를 바꿉니다. 가져온 체크리스트가 있을 때만 기존 체크리스트도 바꿉니다. 완료 방식과 일차 설정은 유지됩니다.</p>
      </>}
      {reading && <p role="status">파일을 읽고 있습니다.</p>}{error && <p role="alert" className="notice">{error}</p>}
    </div>
    <footer className="admin-dialog-footer">
      <button type="button" className="btn" onClick={onClose}>취소</button>
      {parsed ? <><button type="button" className="btn" onClick={() => { setParsed(null); setError(''); }}>다시 입력</button><button type="button" className="btn" disabled={!parsed.blocks.length && !parsed.checklist.length} onClick={() => apply('replace')}>전체 교체</button><button type="button" className="btn primary" disabled={!parsed.blocks.length && !parsed.checklist.length} onClick={() => apply('append')}>뒤에 추가</button></>
        : <button type="button" className="btn primary" disabled={reading || !text.trim()} onClick={() => { try { setParsed(parseCurriculumText(text)); setError(''); } catch (cause) { setError((cause as Error).message); } }}>가져올 내용 확인</button>}
    </footer>
  </AdminModal>;
}

function CardPicker({ sourceId, currentId, current, onInsert }: { sourceId: string; currentId: string; current: LessonBlockDocument; onInsert: (content: ImportContent, position: number) => void }) {
  const [loaded, setLoaded] = useState<{ document?: LessonBlockDocument; error?: string }>({});
  const [attempt, setAttempt] = useState(0), [selected, setSelected] = useState<string[]>([]), [dragged, setDragged] = useState<string[]>([]), [message, setMessage] = useState('');
  const local = sourceId === currentId;
  useEffect(() => {
    if (local || !sourceId) return;
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(new Error('학습 조회 시간이 초과됐습니다.')), 10000);
    let disposed = false;
    void fetch(`/api/platform/lesson-blocks?lesson=${encodeURIComponent(sourceId)}`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '학습을 불러오지 못했습니다.');
      if (result.editable !== true) throw new Error('편집 권한이 있는 학습에서만 가져올 수 있습니다.');
      const document = result.document ? validateLessonBlocks(result.document) : { schemaVersion: 1 as const, blocks: [], checklist: [] };
      if (!disposed) setLoaded({ document });
    }).catch(cause => { if (!disposed) setLoaded({ error: abort.signal.aborted ? '학습 조회 시간이 초과됐습니다. 다시 시도해 주세요.' : (cause as Error).message }); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); abort.abort(); };
  }, [local, sourceId, attempt]);
  const source = local ? current : loaded.document;
  const blocks = source?.blocks || [];
  function insert(position: number, ids = selected) {
    try {
      const copies = blocks.filter(block => ids.includes(block.id));
      if (!copies.length) return;
      onInsert({ blocks: copies, checklist: [] }, position); setMessage(`${copies.length}개 카드를 편집 화면에 추가했습니다. ‘학습 저장’을 눌러 반영해 주세요.`); setSelected([]); setDragged([]);
    } catch (cause) { setMessage((cause as Error).message); }
  }
  if (!sourceId) return <p>같은 상품의 주차와 학습을 선택해 주세요.</p>;
  if (!local && loaded.error) return <div role="alert"><p>{loaded.error}</p><button className="btn" type="button" onClick={() => { setLoaded({}); setAttempt(n => n + 1); }}>학습 다시 불러오기</button></div>;
  if (!source) return <p role="status">학습 카드를 불러오고 있습니다.</p>;
  const all = blocks.length > 0 && blocks.every(b => selected.includes(b.id));
  return <>
    <div className="lei-columns">
      <section aria-label="가져올 카드"><h3>1. 필요한 카드 선택</h3>
        <button type="button" className="btn small" disabled={!blocks.length} onClick={() => setSelected(all ? [] : blocks.map(b => b.id))}>{all ? '전체 해제' : '전체 선택'}</button>
        {!blocks.length && <p>저장된 학습 카드가 없습니다. 원본 학습에서 ‘여러 항목으로 구성하기’로 저장한 뒤 가져와 주세요.</p>}
        {blocks.map((block, i) => <label className="lei-card" key={block.id} draggable onDragStart={event => { const ids = selected.includes(block.id) ? selected : [block.id]; setDragged(ids); event.dataTransfer.setData('text/plain', 'lesson-cards'); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDragged([])}>
          <input type="checkbox" checked={selected.includes(block.id)} onChange={event => setSelected(value => event.target.checked ? [...value, block.id] : value.filter(id => id !== block.id))} aria-label={`원본 카드 ${i + 1}: ${importBlockLabels[block.type]}`} />
          <span><strong>{i + 1}. {importBlockLabels[block.type]}</strong><span>{summarizeImportBlock(block)}</span></span>
        </label>)}
      </section>
      <section aria-label="붙여넣을 위치"><h3>2. 붙여넣을 위치 선택</h3><p>카드를 선택하고 위치를 누르거나, 카드를 끌어 놓으세요.</p>
        {Array.from({ length: current.blocks.length + 1 }, (_, i) => <div key={i}>
          <button type="button" className="lei-position" disabled={!selected.length && !dragged.length} onClick={() => insert(i)} onDragOver={event => { if (dragged.length) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => { event.preventDefault(); insert(i, dragged); }}>
            {i === 0 ? '맨 앞에 붙여넣기' : i === current.blocks.length ? '맨 뒤에 붙여넣기' : `${i}번 카드 뒤에 붙여넣기`}
          </button>
          {current.blocks[i] && <div className="lei-target">{i + 1}. {summarizeImportBlock(current.blocks[i])}</div>}
        </div>)}
      </section>
    </div>
    {message && <p role="status" className="notice">{message}</p>}
  </>;
}

export function LessonCardImport({ currentId, current, sources, onClose, onInsert }: { currentId: string; current: LessonBlockDocument; sources: LessonCardSource[]; onClose: () => void; onInsert: (content: ImportContent, position: number) => void }) {
  const [selectedId, setSelectedId] = useState(sources.find(s => s.id !== currentId)?.id || currentId);
  const sourceId = sources.some(s => s.id === selectedId) ? selectedId : '';
  return <AdminModal title="다른 학습 카드 가져오기" onClose={onClose} className="lei-modal lei-wide">
    <div className="admin-dialog-body"><p>같은 상품의 학습에서 카드를 복사합니다. 원본 내용과 학생 답변은 바뀌지 않습니다.</p>
      <label className="lb-field"><span>가져올 학습</span><select value={sourceId} onChange={event => setSelectedId(event.target.value)}><option value="">학습 선택</option>{sources.map(source => <option key={source.id} value={source.id}>{source.label}{source.id === currentId ? ' (현재 편집 중)' : ''}</option>)}</select></label>
      <CardPicker key={sourceId} sourceId={sourceId} currentId={currentId} current={current} onInsert={onInsert} />
    </div>
    <footer className="admin-dialog-footer"><button type="button" className="btn" onClick={onClose}>닫기</button></footer>
  </AdminModal>;
}
