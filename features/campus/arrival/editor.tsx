'use client';

import {lazy, Suspense, useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight, Eye, Plus, X} from 'lucide-react';
import {AdminButton, AdminInput, AdminTextarea, useAdminDialog} from '@/features/admin-ui/components/admin-system';
import {EditorDisclosure} from '../content/disclosure';
import {audiences, type Audience} from './content';
import {ARRIVAL_CONFIG_LIMITS as limits, arrivalEntryAudienceLabel, DEFAULT_ARRIVAL, validateArrivalConfig, type ArrivalConfig} from './config';
import {DEFAULT_WORK_TRIAL} from './work-trial';
import {WorkTrialEditor} from './work-trial-editor';
import {DEFAULT_OFFICE_DEMO} from './office-demo';
import {OfficeDemoEditor} from './office-demo-editor';
import {ArrivalPublicationControls, type ArrivalPublicationControlsProps} from './publication-controls';
import styles from './editor.module.css';

const Experience = lazy(() => import('./experience').then(module => ({default: module.ArrivalExperience})));
const audienceNames: Record<Audience, string> = {work: '회사 업무에 활용할 사람', business: '사업 중인 사람', preparing: '창업 준비 중인 사람', exploring: '아직 아이템이 없는 사람'};

function koreanDateTime(value: string | null): string {
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : '';
}
function fromKoreanDateTime(value: string): string {
  const date = value ? Date.parse(value + ':00+09:00') : NaN;
  return Number.isFinite(date) ? new Date(date).toISOString() : '';
}

function PreviewReady({onReady}: {onReady: (ready: boolean) => void}) {
  useEffect(() => onReady(true), [onReady]);
  return null;
}

function ArrivalDraftPreview({config, onClose, onReview}: {config: ArrivalConfig; onClose: () => void; onReview?: () => void}) {
  const dialog = useAdminDialog(), titleId = useId();
  const [ready, setReady] = useState(false);
  return createPortal(<dialog ref={dialog} className={styles.previewDialog} aria-labelledby={titleId}
    onCancel={event => {event.preventDefault(); event.stopPropagation(); onClose();}}
    onSubmit={event => event.stopPropagation()}>
    <header className={styles.previewHeader}>
      <div><h2 id={titleId} data-admin-dialog-title tabIndex={-1}>{onReview ? '저장된 체험 미리보기' : '현재 편집 내용 미리보기'}</h2><p>{onReview ? '저장한 초안을 미리 보는 중입니다.' : '저장 전 내용입니다. 미리보기 입력은 저장하지 않습니다.'}</p></div>
      <div className={styles.previewHeaderActions}>
        <button type="button" onClick={onClose}><X size={18} aria-hidden="true"/> 미리보기 닫기</button>
        {onReview && <button type="button" className={styles.reviewButton} disabled={!ready} onClick={onReview}>미리보기 확인</button>}
      </div>
    </header>
    <div className={styles.previewBody}>
      <Suspense fallback={<p className={styles.previewLoading} role="status">체험 미리보기를 준비하고 있어요…</p>}>
        <Experience config={config} persistenceKey={null} preview embedded/>
        {onReview && <PreviewReady onReady={setReady}/>}
      </Suspense>
    </div>
  </dialog>, document.body);
}

/** The parent webinar form owns persistence and its existing revision check. */
export function ArrivalEditor({value: storedValue, onChange, disabled = false, savedSlug, draftOnly = false, publication}: {
  value?: ArrivalConfig;
  onChange: (value: ArrivalConfig) => void;
  disabled?: boolean;
  savedSlug?: string;
  draftOnly?: boolean;
  publication?: ArrivalPublicationControlsProps;
}) {
  // Old browser-only demo drafts may bypass the server's validation boundary.
  // Add only missing fields; keep every existing editorial value intact.
  const value = storedValue ? {...storedValue,
    welcomeBenefits: storedValue.welcomeBenefits ?? DEFAULT_ARRIVAL.welcomeBenefits,
    audiences: {...DEFAULT_ARRIVAL.audiences, ...storedValue.audiences},
    workTrial: storedValue.workTrial ?? DEFAULT_WORK_TRIAL,
    officeDemo: Object.hasOwn(storedValue, 'officeDemo') ? storedValue.officeDemo : DEFAULT_OFFICE_DEMO,
  } : undefined;
  const [preview, setPreview] = useState<{config: ArrivalConfig; revision?: string} | null>(null);
  const [reviewedRevision, setReviewedRevision] = useState<string | null>(null);
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
  function openPreview(revision?: string) {
    try {
      const checked = validateArrivalConfig(value);
      setError('');
      setPreview({config:checked, revision});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '미리볼 내용을 확인해 주세요.');
      requestAnimationFrame(() => errorBox.current?.focus());
    }
  }

  const publicationControls = publication && <ArrivalPublicationControls {...publication}
    hasConfig={!!value} disabled={disabled} reviewed={reviewedRevision === publication.savedRevision}
    onPreview={openPreview}/>;

  if (!value) return <section className={styles.editor} aria-label="라이브 사전 체험 설정">
    <div className={styles.intro}><h2>라이브 사전 체험</h2><p>카톡방 방문자가 ‘문샷 AI 직원 체험’에서 보는 안내와 라이브 일정을 관리합니다.</p></div>
    <AdminButton type="button" variant="primary" disabled={disabled} onClick={() => onChange(structuredClone(DEFAULT_ARRIVAL))}><Plus size={17} aria-hidden="true"/> 모집 체험 설정 추가</AdminButton>
    {publicationControls || <p className={styles.scope}>설정을 추가해도 공개되지 않습니다. 현재는 검수용 미리보기만 제공합니다.</p>}
  </section>;

  return <section className={styles.editor} aria-label="라이브 사전 체험 설정">
    <div className={styles.intro}><h2>라이브 사전 체험</h2><p>카톡방 방문자가 ‘문샷 AI 직원 체험’에서 보는 내용을 편집하세요.</p></div>
    {!publication && <><div className={styles.previewActions}>
      <AdminButton type="button" variant="primary" disabled={disabled} onClick={() => openPreview()}><Eye size={17} aria-hidden="true"/> 현재 편집 내용 미리보기</AdminButton>
      {savedSlug && <a href={'/experience/moonshot?event=' + encodeURIComponent(savedSlug)} target="_blank" rel="noopener noreferrer">저장된 체험 미리보기 <ArrowUpRight size={16} aria-hidden="true"/></a>}
    </div>
    <p className={styles.scope}>{draftOnly
      ? '이 브랜치에서는 편집한 내용을 미리 볼 수 있어요. 설정 저장은 고정 DEV 통합 후 사용할 수 있습니다.'
      : '편집 후 하단 ‘설정 저장’을 누르면 보관됩니다. 저장해도 모집 체험은 자동으로 공개되지 않습니다.'}</p></>}
    {error && <p ref={errorBox} tabIndex={-1} className={styles.error} role="alert">{error}</p>}

    <EditorDisclosure title="사무실 직원 체험 · 회사 기준" initialOpen>
      <OfficeDemoEditor disabled={disabled} value={value.officeDemo} onChange={next => patch('officeDemo', next)}/>
    </EditorDisclosure>

    <EditorDisclosure title="체험 소개 · 강사와 팀 소개">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="체험 소개 제목" helper="첫 화면 메뉴에서 ‘체험 소개’를 열면 표시됩니다." required maxLength={limits.title} rows={2} value={value.title} onChange={event => patch('title', event.target.value)}/>
        <AdminTextarea label="체험 소개 본문" required maxLength={limits.description} rows={3} value={value.description} onChange={event => patch('description', event.target.value)}/>
        {value.welcomeBenefits.map((benefit, index) => <AdminInput key={index} label={`체험 소개 · 해볼 수 있는 일 ${index + 1}`} required maxLength={limits.welcomeBenefit} value={benefit} onChange={event => patch('welcomeBenefits', value.welcomeBenefits.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/>)}
        <AdminInput label="강사 이름" required maxLength={limits.instructorName} value={value.instructorName} onChange={event => patch('instructorName', event.target.value)}/>
        <AdminTextarea label="강사 소개" required maxLength={limits.instructorIntro} rows={3} value={value.instructorIntro} onChange={event => patch('instructorIntro', event.target.value)}/>
        <AdminTextarea label="브랜디액션 팀 소개" helper="빈 줄로 문단을 나누면 방문자 화면에서도 그대로 나뉩니다." maxLength={limits.teamIntro} rows={10} value={value.teamIntro ?? ''} onChange={event => patch('teamIntro', event.target.value)}/>
        <AdminInput label="소개 영상 주소 · 선택" type="url" maxLength={limits.url} placeholder="https://www.youtube.com/watch?v=…" helper="영상이 없으면 비워두세요. 방문자가 직접 눌러서 시청합니다." value={value.videoUrl} onChange={event => patch('videoUrl', event.target.value)}/>
      </fieldset>
    </EditorDisclosure>

    {audiences.map(id => {
      const item = value.audiences[id];
      const entryLabel = arrivalEntryAudienceLabel(id, item.label);
      const labelHelp = entryLabel === item.label ? '방문자가 자신의 상황을 바로 고를 수 있게 적어주세요.' : `이 기본 문구는 첫 화면에서 ‘${entryLabel}’로 표시됩니다.`;
      return <EditorDisclosure key={id} title={`${audienceNames[id]} · 체험 내용`}>
        <fieldset disabled={disabled} className={styles.fields}>
          <div className={styles.grid}>
            <AdminInput label="대상 안내 · 버튼의 큰 제목" helper={labelHelp} required maxLength={limits.label} value={item.label} onChange={event => updateAudience(id, {label: event.target.value})}/>
            <AdminInput label="체험 후 얻는 결과" required maxLength={limits.goal} value={item.goal} onChange={event => updateAudience(id, {goal: event.target.value})}/>
          </div>
          {id === 'work' ? <WorkTrialEditor value={value.workTrial} onChange={next => patch('workTrial', next)} disabled={disabled}/> : <>
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
            <AdminTextarea label="첫 결과 예시" helper="문단을 빈 줄로 나누세요. [고객이 선택할 이유]처럼 대괄호 제목 뒤에 줄을 바꾸면 제목과 본문으로 구분됩니다." required maxLength={limits.exampleResult} rows={5} value={item.example.before} onChange={event => updateAudience(id, {example: {...item.example, before: event.target.value}})}/>
            <AdminTextarea label="수정 요청 후 결과 예시" required maxLength={limits.exampleResult} rows={5} value={item.example.after} onChange={event => updateAudience(id, {example: {...item.example, after: event.target.value}})}/>
          </div>
          <AdminTextarea label="예시를 더 다듬는 요청" required maxLength={limits.exampleRevision} rows={3} value={item.example.revision} onChange={event => updateAudience(id, {example: {...item.example, revision: event.target.value}})}/>
          <AdminTextarea label="내 AI에게 보낼 요청문 틀" required maxLength={limits.requestTemplate} rows={8} helper="{{answer1}}에는 첫 번째 답변, {{answer2}}에는 두 번째 답변이 들어갑니다. 두 표시를 모두 남겨주세요." value={item.requestTemplate} onChange={event => updateAudience(id, {requestTemplate: event.target.value})}/>
          </>}
        </fieldset>
      </EditorDisclosure>;
    })}

    <EditorDisclosure title="라이브 안내 · 일정 저장">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminInput label="라이브 제목" required maxLength={limits.liveTitle} value={value.liveTitle} onChange={event => patch('liveTitle', event.target.value)}/>
        <div className={styles.grid}>
          <AdminInput label="시작 일시 · 한국시간" type="datetime-local" required value={koreanDateTime(value.startsAt)} onChange={event => patch('startsAt', fromKoreanDateTime(event.target.value))}/>
          <AdminInput label="종료 일시 · 한국시간 · 선택" type="datetime-local" helper="미정이면 비워두세요. 임의 종료 시각을 일정에 넣지 않습니다." value={koreanDateTime(value.endsAt)} onChange={event => patch('endsAt', event.target.value ? fromKoreanDateTime(event.target.value) : null)}/>
        </div>
        <div className={styles.grid}>
          <AdminInput label="추가 무료 자료 이름 · 선택" maxLength={limits.label} value={value.handoutLabel ?? ''} onChange={event => patch('handoutLabel', event.target.value)}/>
          <AdminInput label="추가 무료 자료 공개 링크 · 선택" type="url" maxLength={limits.url} value={value.handoutUrl ?? ''} onChange={event => patch('handoutUrl', event.target.value)} helper="이름과 링크를 함께 입력하면 웰컴 라운지 자료 안내 봇의 무료자료에 표시돼요. 누구나 열 수 있는 HTTPS 주소를 넣어주세요."/>
        </div>
        <AdminTextarea label="강의 후 공개 특전 · 공개할 미리보기 문구" maxLength={500} rows={2} value={value.bonusPreview ?? ''} onChange={event => patch('bonusPreview', event.target.value)}/>
        <AdminInput label="유튜브 라이브 주소 · 선택" type="url" maxLength={limits.url} helper="아직 없으면 비워두세요. 화면에는 링크 안내 예정으로 표시합니다." placeholder="https://www.youtube.com/watch?v=…" value={value.liveUrl} onChange={event => patch('liveUrl', event.target.value)}/>
        <p className={styles.scope}>무료 체험의 일정 안내에 사용합니다. 기존 행사 설정의 시작·종료 시간은 자동으로 바뀌지 않습니다.</p>
      </fieldset>
    </EditorDisclosure>
    {publicationControls}
    {preview && <ArrivalDraftPreview config={preview.config} onClose={() => setPreview(null)}
      onReview={preview.revision ? () => {setReviewedRevision(preview.revision ?? null); setPreview(null);} : undefined}/>}
  </section>;
}
