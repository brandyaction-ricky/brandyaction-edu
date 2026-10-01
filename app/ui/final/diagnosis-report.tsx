'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import type { DiagnosisReportStatus } from '@/lib/diagnosis-report';
import { DiagnosisReportDocument } from './diagnosis-report-document';
import './diagnosis-report.css';

const endpoint = '/api/platform/diagnosis/report';
const statusCopy = {
  queued: { title: '답변을 받았어요.', description: '순서대로 검사 결과를 준비하고 있어요. 화면을 닫아도 계속 진행됩니다.' },
  processing: { title: '나를 이해하는 결과를 만들고 있어요.', description: '제출한 답변을 바탕으로 결과를 정리하고 있어요. 나중에 이곳에서 다시 확인해 주세요.' },
  ready: { title: '검사 결과가 준비됐어요.', description: '결과를 읽고, 파일로 저장해 나만의 옵시디언 볼트에 넣어 보세요.' },
  needs_review: { title: '결과를 만들기 전 확인 중이에요.', description: '답변은 안전하게 접수됐어요. 확인이 끝나면 진행됩니다. 다시 검사하거나 추가 결제할 필요는 없어요.' },
  access_denied: { title: '이용 정보를 확인해 주세요.', description: '현재 이 검사 결과를 열 수 없어요. 구매·수강 상태를 확인해 주세요.' },
};

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.error || '검사 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.');
  return data;
}
function isStatus(value: unknown): value is DiagnosisReportStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as DiagnosisReportStatus;
  return Object.hasOwn(statusCopy, v.state) && typeof v.updatedAt === 'string' && v.canRetry === false
    && v.downloadAvailable === (v.state === 'ready');
}

export function DiagnosisReportView({ onExit }: { onExit: () => void }) {
  const [status, setStatus] = useState<DiagnosisReportStatus | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [paused, setPaused] = useState(false);
  const [reload, setReload] = useState(0), [preview, setPreview] = useState<string | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false), [downloading, setDownloading] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), fileRequest = useRef<AbortController | null>(null);
  const fileVersion = useRef(0);

  useEffect(() => {
    let active = true, pending = false, failed = false, polls = 0, requestVersion = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    async function check() {
      if (!active || pending || failed || document.visibilityState === 'hidden') return;
      pending = true; const version = ++requestVersion; controller = new AbortController();
      try {
        const data = await readResponse(await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }));
        if (!active || version !== requestVersion) return;
        if (!isStatus(data)) throw Error('검사 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.');
        setStatus(data); setLoading(false); setError(''); polls++;
        if (data.state !== 'ready') setPreview(null);
        if (data.state === 'queued' || data.state === 'processing') {
          if (polls < 60) timer = setTimeout(() => void check(), 10_000);
          else setPaused(true);
        }
      } catch (reason) {
        if (!active || version !== requestVersion) return;
        failed = true; setStatus(null); setPreview(null); setLoading(false);
        setError(reason instanceof Error ? reason.message : '연결을 확인한 뒤 다시 확인해 주세요.');
      } finally { if (version === requestVersion) pending = false; }
    }
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'hidden') {
        requestVersion++; controller?.abort(); pending = false; setPreview(null);
        fileVersion.current++; fileRequest.current?.abort(); setFetchingPreview(false); setDownloading(false);
      } else if (polls < 60) void check();
    };
    void check(); document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false; requestVersion++; clearTimeout(timer); controller?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter invalidates any file request still running at cleanup.
      fileVersion.current++; fileRequest.current?.abort(); document.removeEventListener('visibilitychange', visibility);
    };
  }, [reload]);
  useEffect(() => { heading.current?.focus(); }, [status?.state]);

  function refresh() {
    setStatus(null); setPreview(null); setError(''); setLoading(true); setPaused(false); setReload(n => n + 1);
  }
  async function getFile(download: boolean) {
    const version = ++fileVersion.current;
    fileRequest.current?.abort(); fileRequest.current = new AbortController();
    setError(''); if (download) setDownloading(true); else setFetchingPreview(true);
    try {
      const response = await fetch(`${endpoint}?${download ? 'download' : 'preview'}=1`, { cache: 'no-store',
        signal: AbortSignal.any([fileRequest.current.signal, AbortSignal.timeout(15_000)]) });
      if (download) {
        if (!response.ok) await readResponse(response);
        const blob = await response.blob(); if (version !== fileVersion.current) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'N6-검사결과.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const data = await readResponse(response), markdown: unknown = data?.markdown;
        if (version !== fileVersion.current) return;
        if (!isStatus(data) || data.state !== 'ready' || typeof markdown !== 'string') throw Error('결과 파일을 확인하지 못했어요. 다시 확인해 주세요.');
        setPreview(markdown);
      }
    } catch (reason) {
      if (version !== fileVersion.current) return;
      setPreview(null); setStatus(null); setError(reason instanceof Error ? reason.message : '결과 파일을 확인하지 못했어요. 다시 확인해 주세요.');
    } finally { if (version === fileVersion.current) { setDownloading(false); setFetchingPreview(false); } }
  }
  const copy = status ? statusCopy[status.state] : null;
  return <section className="diagnosis-report" aria-label="N6 검사 결과">
    {loading ? <div role="status" className="diagnosis-report-loading"><LoaderCircle className="diagnosis-spin"/><p>검사 결과를 확인하고 있어요.</p></div> : <>
      {copy && <div className="diagnosis-report-summary">
        <span className={`diagnosis-report-icon${status?.state === 'ready' ? ' is-ready' : ''}`} aria-hidden="true">{status?.state === 'ready' ? <CheckCircle2 size={30}/> : <FileText size={30}/>}</span>
        <span className="diagnosis-eyebrow">나의 N6 검사</span><h1 ref={heading} tabIndex={-1}>{copy.title}</h1><p>{copy.description}</p>
        {(status?.state === 'queued' || status?.state === 'processing') && <ol className="diagnosis-report-steps" aria-label="검사 진행 단계"><li className="is-complete">답변 접수</li><li aria-current="step">결과 준비</li><li>결과 확인</li></ol>}
      </div>}
      {status?.state === 'ready' && <>
        <div className="diagnosis-report-actions"><button className="diagnosis-primary" onClick={() => void getFile(false)} disabled={fetchingPreview || downloading}>{fetchingPreview ? <LoaderCircle className="diagnosis-spin" size={18}/> : <FileText size={18}/>}결과 보기</button>
          <button className="diagnosis-secondary" onClick={() => void getFile(true)} disabled={fetchingPreview || downloading}>{downloading ? <LoaderCircle className="diagnosis-spin" size={18}/> : <Download size={18}/>}MD 파일 받기</button></div>
        <p className="diagnosis-report-help">받은 파일을 옵시디언의 내 볼트 폴더에 넣으면 언제든 다시 읽을 수 있어요. 파일은 다시 받아도 괜찮아요.</p>
      </>}
      {preview !== null && <section className="diagnosis-report-preview" aria-label="검사 결과 미리보기"><div><h2>나의 검사 결과</h2><button className="diagnosis-secondary" onClick={() => setPreview(null)}>미리보기 닫기</button></div>
        <DiagnosisReportDocument markdown={preview}/></section>}
      {paused && <p className="diagnosis-report-help">자동 확인을 잠시 멈췄어요. 아래 버튼을 누르면 최신 상태를 확인할 수 있어요.</p>}
      {error && <p className="diagnosis-error" role="alert">{error}</p>}
      <div className="diagnosis-report-footer"><button className="diagnosis-secondary" onClick={refresh} disabled={downloading || fetchingPreview}><RefreshCw size={16}/>진행 상태 다시 확인</button><button className="diagnosis-secondary" onClick={onExit}>학습으로 돌아가기<ArrowRight size={16}/></button></div>
    </>}
  </section>;
}
