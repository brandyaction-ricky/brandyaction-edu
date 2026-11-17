'use client';

import {lazy, Suspense, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight, Eye, Plus, X} from 'lucide-react';
import {AdminButton, AdminInput, AdminTextarea, useAdminDialog} from '@/features/admin-ui/components/admin-system';
import {EditorDisclosure} from '../content/disclosure';
import {audiences, type Audience} from './content';
import {ARRIVAL_CONFIG_LIMITS as limits, DEFAULT_ARRIVAL, validateArrivalConfig, type ArrivalConfig} from './config';
import styles from './editor.module.css';

const Experience = lazy(() => import('./experience').then(module => ({default: module.ArrivalExperience})));
const audienceNames: Record<Audience, string> = {business: '사업 중인 사람', preparing: '창업 준비 중인 사람', exploring: '아직 아이템이 없는 사람'};

function koreanDateTime(value: string | null): string {
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : '';
}
function fromKoreanDateTime(value: string): string {
  const date = value ? Date.parse(value + ':00+09:00') : NaN;
  return Number.isFinite(date) ? new Date(date).toISOString() : '';
}

function ArrivalDraftPreview({config, onClose}: {config: ArrivalConfig; onClose: () => void}) {
  const dialog = useAdminDialog(), titleId = useId();
  return createPortal(<dialog ref={dialog} className={styles.previewDialog} aria-labelledby={titleId}
    onCancel={event => {event.preventDefault(); event.stopPropagation(); onClose();}}
    onSubmit={event => event.stopPropagation()}>
    <header className={styles.previewHeader}>
      <div><h2 id={titleId} data-admin-dialog-title tabIndex={-1}>현재 편집 내용 미리보기</h2><p>저장 전 내용입니다. 미리보기 입력은 저장하지 않습니다.</p></div>
      <button type="button" onClick={onClose}><X size={18} aria-hidden="true"/> 미리보기 닫기</button>
    </header>
    <div className={styles.previewBody}>
      <Suspense fallback={<p className={styles.previewLoading} role="status">체험 미리보기를 준비하고 있어요…</p>}>
        <Experience config={config} persistenceKey={null} preview/>
      </Suspense>
    </div>
  </dialog>, document.body);
}

/** The parent webinar form owns persistence and its existing revision check. */
export function ArrivalEditor({value, onChange, disabled = false, savedSlug}: {
  value?: ArrivalConfig;
  onChange: (value: ArrivalConfig) => void;
  disabled?: boolean;
  savedSlug?: string;
}) {
  const [preview, setPreview] = useState<ArrivalConfig | null>(null);
  const [error, setError] = useState('');
  const errorBox = useRef<HTMLParagraphElement>(null);
  function patch<K extends keyof ArrivalConfig>(key: K, next: ArrivalConfig[K]) {
    if (!value) return;
    setError('');
    onChange({...value, [key]: next});
  }
  function updateAudience(id: Audience, next: Partial<ArrivalConfig['audiences'][Audience]>) {
    if (!value) return;
    patch('audiences', {...value.audiences, [id]: {...value.audiences[id], ...next}});
  }
  function openPreview() {
    try {
      const checked = validateArrivalConfig(value);
      setError('');
      setPreview(checked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '미리볼 내용을 확인해 주세요.');
      requestAnimationFrame(() => errorBox.current?.focus());
    }
  }

  if (!value) return <section className={styles.editor} aria-label="모집 무료 체험 설정">
    <div className={styles.intro}><h3>카톡방 방문자가 만날 무료 체험</h3><p>환영 문구, 대상별 질문과 결과 예시, 라이브 일정을 이곳에서 편집합니다. 구매자 공지·기초 지식과는 별도로 관리합니다.</p></div>
    <AdminButton type="button" variant="primary" disabled={disabled} onClick={() => onChange(structuredClone(DEFAULT_ARRIVAL))}><Plus size={17} aria-hidden="true"/> 모집 체험 설정 추가</AdminButton>
    <p className={styles.scope}>설정을 추가해도 공개되지 않습니다. 현재는 검수용 미리보기만 제공합니다.</p>
  </section>;

  return <section className={styles.editor} aria-label="모집 무료 체험 설정">
    <div className={styles.intro}><h3>카톡방 방문자가 만날 무료 체험</h3><p>처음 보는 사람에게 보여줄 안내와 체험을 편집하세요. 구매자용 웰컴 콘텐츠는 기존 항목에서 관리합니다.</p></div>
    <div className={styles.previewActions}>
      <AdminButton type="button" variant="primary" disabled={disabled} onClick={openPreview}><Eye size={17} aria-hidden="true"/> 현재 편집 내용 미리보기</AdminButton>
      {savedSlug && <a href={'/experience/moonshot?event=' + encodeURIComponent(savedSlug)} target="_blank" rel="noopener noreferrer">저장된 체험 미리보기 <ArrowUpRight size={16} aria-hidden="true"/></a>}
    </div>
    <p className={styles.scope}>편집 후 하단 ‘설정 저장’을 눌러야 보관됩니다. 저장해도 모집 체험이 자동 공개되지 않습니다.</p>
    {error && <p ref={errorBox} tabIndex={-1} className={styles.error} role="alert">{error}</p>}

    <EditorDisclosure title="1. 첫 화면 · 강사 소개" initialOpen>
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="첫 화면 제목" required maxLength={limits.title} rows={2} value={value.title} onChange={event => patch('title', event.target.value)}/>
        <AdminTextarea label="첫 화면 안내" required maxLength={limits.description} rows={3} value={value.description} onChange={event => patch('description', event.target.value)}/>
        <AdminInput label="강사 이름" required maxLength={limits.instructorName} value={value.instructorName} onChange={event => patch('instructorName', event.target.value)}/>
        <AdminTextarea label="강사·팀 소개" required maxLength={limits.instructorIntro} rows={3} value={value.instructorIntro} onChange={event => patch('instructorIntro', event.target.value)}/>
        <AdminInput label="소개 영상 주소 · 선택" type="url" maxLength={limits.url} placeholder="https://www.youtube.com/watch?v=…" helper="영상이 없으면 비워두세요. 방문자가 직접 눌러서 시청합니다." value={value.videoUrl} onChange={event => patch('videoUrl', event.target.value)}/>
      </fieldset>
    </EditorDisclosure>

    {audiences.map((id, index) => {
      const item = value.audiences[id];
      return <EditorDisclosure key={id} title={`${index + 2}. ${audienceNames[id]} · 체험 내용`}>
        <fieldset disabled={disabled} className={styles.fields}>
          <div className={styles.grid}>
            <AdminInput label="선택 버튼 문구" required maxLength={limits.label} value={item.label} onChange={event => updateAudience(id, {label: event.target.value})}/>
            <AdminInput label="체험 후 얻는 결과" required maxLength={limits.goal} value={item.goal} onChange={event => updateAudience(id, {goal: event.target.value})}/>
          </div>
          <div className={styles.grid}>
            <AdminTextarea label="첫 번째 질문" required maxLength={limits.question} rows={2} value={item.q1} onChange={event => updateAudience(id, {q1: event.target.value})}/>
            <AdminTextarea label="두 번째 질문" required maxLength={limits.question} rows={2} value={item.q2} onChange={event => updateAudience(id, {q2: event.target.value})}/>
            <AdminTextarea label="첫 번째 질문의 입력 힌트" maxLength={limits.hint} rows={2} value={item.hint1} onChange={event => updateAudience(id, {hint1: event.target.value})}/>
            <AdminTextarea label="두 번째 질문의 입력 힌트" maxLength={limits.hint} rows={2} value={item.hint2} onChange={event => updateAudience(id, {hint2: event.target.value})}/>
          </div>
          <div className={styles.groupHeading}><h4>방문자에게 보여줄 결과 예시</h4><p>실제 실행 결과로 표시하지 않고 ‘체험용 예시’로 보여줍니다.</p></div>
          <div className={styles.grid}>
            <AdminTextarea label="예시에서 사용할 첫 번째 답변" required maxLength={limits.exampleAnswer} rows={3} value={item.example.a} onChange={event => updateAudience(id, {example: {...item.example, a: event.target.value}})}/>
            <AdminTextarea label="예시에서 사용할 두 번째 답변" required maxLength={limits.exampleAnswer} rows={3} value={item.example.b} onChange={event => updateAudience(id, {example: {...item.example, b: event.target.value}})}/>
            <AdminTextarea label="첫 결과 예시" required maxLength={limits.exampleResult} rows={5} value={item.example.before} onChange={event => updateAudience(id, {example: {...item.example, before: event.target.value}})}/>
            <AdminTextarea label="수정 요청 후 결과 예시" required maxLength={limits.exampleResult} rows={5} value={item.example.after} onChange={event => updateAudience(id, {example: {...item.example, after: event.target.value}})}/>
          </div>
          <AdminTextarea label="예시를 더 다듬는 요청" required maxLength={limits.exampleRevision} rows={3} value={item.example.revision} onChange={event => updateAudience(id, {example: {...item.example, revision: event.target.value}})}/>
          <AdminTextarea label="내 AI에게 보낼 요청문 틀" required maxLength={limits.requestTemplate} rows={8} helper="{{answer1}}에는 첫 번째 답변, {{answer2}}에는 두 번째 답변이 들어갑니다. 두 표시를 모두 남겨주세요." value={item.requestTemplate} onChange={event => updateAudience(id, {requestTemplate: event.target.value})}/>
        </fieldset>
      </EditorDisclosure>;
    })}

    <EditorDisclosure title="5. 라이브 안내 · 일정 저장">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminInput label="라이브 제목" required maxLength={limits.liveTitle} value={value.liveTitle} onChange={event => patch('liveTitle', event.target.value)}/>
        <div className={styles.grid}>
          <AdminInput label="시작 일시 · 한국시간" type="datetime-local" required value={koreanDateTime(value.startsAt)} onChange={event => patch('startsAt', fromKoreanDateTime(event.target.value))}/>
          <AdminInput label="종료 일시 · 한국시간 · 선택" type="datetime-local" helper="미정이면 비워두세요. 임의 종료 시각을 일정에 넣지 않습니다." value={koreanDateTime(value.endsAt)} onChange={event => patch('endsAt', event.target.value ? fromKoreanDateTime(event.target.value) : null)}/>
        </div>
        <AdminInput label="유튜브 라이브 주소 · 선택" type="url" maxLength={limits.url} helper="아직 없으면 비워두세요. 화면에는 링크 안내 예정으로 표시합니다." placeholder="https://www.youtube.com/watch?v=…" value={value.liveUrl} onChange={event => patch('liveUrl', event.target.value)}/>
        <p className={styles.scope}>무료 체험의 일정 안내에 사용합니다. 기존 행사 설정의 시작·종료 시간은 자동으로 바뀌지 않습니다.</p>
      </fieldset>
    </EditorDisclosure>
    {preview && <ArrivalDraftPreview config={preview} onClose={() => setPreview(null)}/>}
  </section>;
}
