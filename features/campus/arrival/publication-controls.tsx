'use client';

import {useEffect, useState} from 'react';
import {ArrowUpRight, Eye, Globe, Save} from 'lucide-react';
import {AdminButton} from '@/features/admin-ui/components/admin-system';
import type {ArrivalPublicationStatus} from './publication';
import styles from './editor.module.css';

const endpoint = '/api/admin/campus/webinars/arrival-publication';
type PublicationState = {publication: ArrivalPublicationStatus | null} | {error: string} | null;
export type ArrivalPublicationControlsProps = {
  slug: string;
  savedRevision: string | null;
  dirty: boolean;
  onBusy: (busy: boolean) => void;
};

const publicationDate = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'long', timeStyle:'short'});

export function ArrivalPublicationControls({slug, savedRevision, dirty, onBusy, hasConfig, reviewed, onPreview, disabled}: ArrivalPublicationControlsProps & {
  hasConfig: boolean;
  reviewed: boolean;
  onPreview: (revision: string) => void;
  disabled: boolean;
}) {
  const [state, setState] = useState<PublicationState>(null);
  const [reload, setReload] = useState(0);
  const [feedback, setFeedback] = useState<{message: string; error?: boolean} | null>(null);

  function refresh() {
    setState(null);
    setReload(previous => previous + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch(endpoint, {cache:'no-store', signal:controller.signal});
        if (!response.ok) throw Error('공개 상태를 불러오지 못했어요.');
        const {publication} = await response.json() as {publication: ArrivalPublicationStatus | null};
        if (!controller.signal.aborted) setState({publication});
      } catch {
        if (!controller.signal.aborted) setState({error:'공개 상태를 불러오지 못했어요.'});
      }
    }
    void read();
    return () => controller.abort();
  }, [reload]);

  const publication = state && 'publication' in state ? state.publication : null;
  const sameEvent = publication?.slug === slug;
  const alreadyPublished = sameEvent && publication.sourceRevision === savedRevision;
  const canPreview = !disabled && hasConfig && !dirty && savedRevision !== null;
  const canPublish = canPreview && reviewed && !alreadyPublished && state !== null && 'publication' in state;

  async function publish() {
    if (!canPublish || !savedRevision) return;
    onBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({slug, sourceRevision:savedRevision, expectedPublicationRevision:publication?.revision ?? null}),
      });
      const result = await response.json().catch(() => null) as {publication?: ArrivalPublicationStatus; error?: string} | null;
      if (!response.ok || !result?.publication) {
        if (response.status === 409) refresh();
        throw Error(result?.error || '공개하지 못했어요. 다시 시도해 주세요.');
      }
      setState({publication:result.publication});
      setFeedback({message:'공개했습니다. 방문자용 체험 링크에 바로 반영됩니다.'});
    } catch (error) {
      setFeedback({message:error instanceof Error ? error.message : '공개하지 못했어요. 다시 시도해 주세요.', error:true});
    } finally {
      onBusy(false);
    }
  }

  const guidance = !hasConfig ? '모집 체험 설정을 추가하면 초안을 저장할 수 있어요.'
    : dirty || !savedRevision ? '설정을 저장한 뒤 저장된 내용을 미리 보세요.'
      : alreadyPublished ? '현재 저장된 내용을 방문자에게 보여주고 있어요.'
        : reviewed ? '공개를 누르면 확인한 내용이 방문자용 링크에 바로 반영돼요.'
          : '초안이 저장됐어요. 미리보기에서 확인한 뒤 공개할 수 있어요.';

  return <section className={styles.publication} aria-label="모집 체험 저장 및 공개">
    <div className={styles.publicationHeading}>
      <div><h3>모집 체험 저장 및 공개</h3><p aria-live="polite">{guidance}</p></div>
      <a href="/experience/moonshot" target="_blank" rel="noopener noreferrer">방문자용 체험 링크 <ArrowUpRight size={16} aria-hidden="true"/></a>
    </div>
    <div className={styles.publicationState}>
      <strong>방문자 화면</strong>
      {!state ? <span>공개 상태 확인 중…</span>
        : 'error' in state ? <><span role="status">{state.error}</span><button type="button" onClick={refresh}>다시 불러오기</button></>
          : !publication ? <span>기본 체험 표시 중</span>
            : <span>{sameEvent ? '이 행사 공개 중' : '다른 행사 공개 중'} · {publicationDate.format(Date.parse(publication.publishedAt))} 공개</span>}
    </div>
    <div className={styles.publicationActions}>
      <AdminButton type="submit" variant="outline" disabled={disabled || !hasConfig || !dirty}><Save size={16} aria-hidden="true"/> 설정 저장</AdminButton>
      <AdminButton type="button" variant="outline" disabled={!canPreview} onClick={() => {if (savedRevision) onPreview(savedRevision);}}><Eye size={16} aria-hidden="true"/> 저장된 체험 미리보기</AdminButton>
      <AdminButton type="button" variant="primary" disabled={!canPublish} onClick={() => void publish()}><Globe size={16} aria-hidden="true"/> 공개</AdminButton>
    </div>
    {feedback && (feedback.error || (!dirty && alreadyPublished)) && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? styles.error : styles.publicationSuccess}>{feedback.message}</p>}
  </section>;
}
