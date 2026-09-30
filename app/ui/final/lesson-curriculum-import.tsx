"use client";
import { ongoingLabels } from '@/lib/ongoing-lessons';
import { useRef, useState } from 'react';
import { lessonImportLimit, validateLessonImportBatch, type LessonImportBatch, type LessonImportReceipt } from '@/lib/lesson-curriculum-import';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';

export function LessonCurriculumImport({ courseId, disabled = false, onImported }: { courseId: string; disabled?: boolean; onImported: () => void }) {
  const [input, setInput] = useState<{ requestId: string; batch: LessonImportBatch } | null>(null);
  const [preview, setPreview] = useState<LessonImportReceipt | null>(null);
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const flight = useRef(false);
  useUnsavedLearningChanges(busy || uncertain);
  async function select(file?: File) {
    if (!file || flight.current || uncertain || disabled) return;
    flight.current = true; setBusy(true); setInput(null); setPreview(null); setAcknowledged(false); setError('');
    try {
      if (file.size > lessonImportLimit + 1000) throw new Error('파일은 4MB까지 지원합니다.');
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw.requestId) || Object.keys(raw).some(key => !['requestId', 'batch'].includes(key))) throw new Error('준비된 가져오기 파일을 선택해 주세요.');
      const batch = validateLessonImportBatch(raw.batch);
      if (batch.courseId !== courseId) throw new Error('다른 상품용 파일입니다. 현재 상품의 가져오기 파일을 선택해 주세요.');
      setInput({ requestId: raw.requestId, batch });
    } catch (cause) { setError(cause instanceof SyntaxError ? 'JSON 파일 형식을 확인해 주세요.' : (cause as Error).message); }
    finally { flight.current = false; setBusy(false); }
  }
  async function send(apply: boolean) {
    if (!input || input.batch.courseId !== courseId || flight.current || disabled || (apply && (!acknowledged || !preview || preview.applied))) return;
    flight.current = true; setBusy(true); setError('');
    let status = 0;
    try {
      const response = await fetch('/api/admin/lesson-curriculum-import', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, action: apply ? 'apply' : 'preview', acknowledgeSource: acknowledged }) });
      status = response.status; const data = await response.json();
      if (!response.ok) throw new Error(data.error || '가져오기를 확인하지 못했습니다.');
      if (data.requestId !== input.requestId || typeof data.applied !== 'boolean' || !Array.isArray(data.lessons)) { status = 0; throw new Error('서버 응답을 확인하지 못했습니다. 같은 파일로 다시 확인해 주세요.'); }
      setPreview(data); setUncertain(false);
      if (data.applied) onImported();
    } catch (cause) {
      // Keep the file and request ID after an uncertain write. A reload can
      // safely select the same file because its immutable request ID is in it.
      if (apply && !(status >= 400 && status < 500)) setUncertain(true);
      if (status >= 400 && status < 500) { setUncertain(false); setPreview(null); }
      setError((cause as Error).message || '결과를 확인하지 못했습니다. 같은 파일로 다시 확인해 주세요.');
    } finally { flight.current = false; setBusy(false); }
  }
  const finished = preview?.applied === true, locked = disabled || busy;
  const externalChecks = input?.batch.lessons.reduce((count, lesson) => count + (Array.isArray((lesson.provenance.review as { externalMedia?: unknown[] } | undefined)?.externalMedia) ? (lesson.provenance.review as { externalMedia: unknown[] }).externalMedia.length : 0), 0) || 0;
  return <section className="product-curriculum-guide" aria-label="외부 커리큘럼 가져오기">
    <h3>외부 커리큘럼 가져오기</h3>
    <p>준비된 파일의 내용을 확인한 뒤 비공개 수업으로 추가합니다. 기존 수업과 학생 기록은 유지됩니다.</p>
    <label>가져오기 JSON 파일<input type="file" accept=".json,application/json" disabled={locked || uncertain || finished} onChange={event => void select(event.target.files?.[0])} /></label>
    {input && <>
      {externalChecks > 0 && <p className="notice warning">원본 외부 영상 {externalChecks}개는 주소를 그대로 가져옵니다. 수업을 공개하기 전에 재생 여부를 확인해 주세요.</p>}
      <p>원본 내보낸 시각: <time dateTime={input.batch.sourceCapturedAt}>{new Date(input.batch.sourceCapturedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)</time></p>
      <p>데일리 미션 {input.batch.lessons.filter(l => l.document.progression?.track === 'daily').length}개 · 별도 학습 {input.batch.lessons.filter(l => l.document.progression?.track === 'learning').length}개 · 지속 챌린지 {input.batch.lessons.filter(l => l.ongoing).length}개</p>
      <details><summary>가져올 주차·학습 목록 확인</summary>{input.batch.weeks.map(w => <div key={w.id}><h4>{w.number}주차 · {w.title} ({w.existing ? '기존 주차에 추가' : '새 비공개 주차'})</h4><ol>{input.batch.lessons.filter(l => l.weekId === w.id).map(l => <li key={l.id}>{l.ongoing ? `${ongoingLabels[l.ongoing]} 지속 챌린지` : `${l.document.progression?.track === 'daily' ? '데일리 미션' : '별도 학습'} ${l.document.progression?.dayNumber}일차`} · {l.title}</li>)}</ol></div>)}</details>
      {!finished && <button className="btn" type="button" disabled={locked} onClick={() => void send(false)}>{uncertain ? '같은 파일로 저장 결과 확인' : '주차·파일 연결 확인'}</button>}
      {preview && !finished && <div className="notice"><p>배치와 파일 연결을 확인했습니다. 새 주차 {preview.weeksCreated}개·학습 {preview.lessonsCreated}개를 비공개로 추가합니다.</p>
        <label><input type="checkbox" checked={acknowledged} disabled={locked || uncertain} onChange={event => setAcknowledged(event.target.checked)} />원본 날짜와 가져올 학습 목록을 확인했습니다.</label>
        <button className="btn primary" type="button" disabled={locked || uncertain || !acknowledged} onClick={() => void send(true)}>비공개 수업으로 가져오기</button>
      </div>}
      {finished && <p role="status">비공개 학습 {preview.lessonsCreated}개를 저장했습니다. 내용과 파일을 검수한 뒤 필요한 주차·학습을 공개해 주세요.</p>}
    </>}
    {busy && <p role="status">커리큘럼을 확인하고 있습니다…</p>}
    {uncertain && <p role="status">저장 응답이 끊겼습니다. 파일을 바꾸지 말고 ‘같은 파일로 저장 결과 확인’을 눌러 주세요. 화면을 닫았다면 같은 JSON 파일을 다시 선택하면 됩니다.</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
  </section>;
}
