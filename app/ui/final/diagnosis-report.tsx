'use client';
import { PushSettings } from './push-settings';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, Download, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import type { DiagnosisReportStatus } from '@/lib/diagnosis-report';
import { DiagnosisReportReader } from './diagnosis-report-reader';
import './diagnosis-report.css';

const endpoint = '/api/platform/diagnosis/report';
const statusCopy = {
  queued: { title: '검사가 완료됐어요.', description: ['답변이 안전하게 접수됐어요.', '지금은 분석 순서를 기다리고 있습니다.', '화면을 닫아도 괜찮아요. 나중에 이곳에서 결과를 확인해 주세요.'] },
  processing: { title: '정밀 보고서를 만들고 있어요.', description: ['제출한 답변을 분석하고 보고서 내용을 확인하고 있습니다.', '완성되면 이곳에서 보고서를 읽고', 'HTML·MD 파일로 받을 수 있습니다.'] },
  ready: { title: '정밀 보고서가 준비됐어요.', description: ['보고서를 읽고 나의 욕구와 행동 경향을 확인해 보세요.', '다음 학습에 사용할 MD 파일도 함께 받을 수 있습니다.'] },
  needs_review: { title: '보고서 발급 전 확인이 필요해요.', description: ['답변은 안전하게 접수됐어요.', '확인할 항목이 있어 보고서 발급이 보류됐어요.', '운영팀에 현재 화면을 알려 주세요.'] },
  access_denied: { title: '이용 정보를 확인해 주세요.', description: ['현재 이 검사 결과를 열 수 없어요.', '구매·수강 상태를 확인해 주세요.'] },
};

function ReportProgress({ state }: { state: DiagnosisReportStatus['state'] }) {
  if (state === 'access_denied') return null;
  const ready = state === 'ready', review = state === 'needs_review';
  return <ol className="diagnosis-report-steps" aria-label="검사 진행 단계">
    {['검사 완료', review ? '확인 필요' : '결과 분석 중', '분석 완료'].map((label, index) => {
      const complete = ready || index === 0, current = index === (ready ? 2 : 1);
      return <li key={label} className={complete ? 'is-complete' : current && review ? 'is-review' : undefined} aria-current={current ? 'step' : undefined}>
        <span className="diagnosis-step-marker" aria-hidden="true">{complete ? <Check size={18}/> : current ? state === 'processing' ? <LoaderCircle size={18} className="diagnosis-spin"/> : <Clock3 size={18}/> : index + 1}</span>
        <span>{label}</span>
        {current && !ready && <small>{review ? '보고서 발급 보류' : state === 'queued' ? '분석 대기' : '보고서 작성 중'}</small>}
      </li>;
    })}
  </ol>;
}

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

export function DiagnosisReportView({ userId, readyPushEnabled = false, onExit, exitLabel = '학습으로 돌아가기' }: { userId?: string; readyPushEnabled?: boolean; onExit: () => void; exitLabel?: string }) {
  const [status, setStatus] = useState<DiagnosisReportStatus | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [paused, setPaused] = useState(false);
  const [reload, setReload] = useState(0), [preview, setPreview] = useState<string | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false), [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'html' | 'markdown' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), fileRequest = useRef<AbortController | null>(null);
  const openReport = useRef<HTMLButtonElement>(null), readerWasOpen = useRef(false);
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
        if (data.state === 'queued' || data.state === 'processing' || data.state === 'needs_review') {
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
  useEffect(() => {
    if (preview === null && readerWasOpen.current && document.visibilityState === 'visible') openReport.current?.focus({ preventScroll: true });
    readerWasOpen.current = preview !== null;
  }, [preview]);

  function refresh() {
    setStatus(null); setPreview(null); setDownloadFormat(null); setError(''); setLoading(true); setPaused(false); setReload(n => n + 1);
  }
  async function getFile(mode: 'read' | 'html' | 'markdown') {
    const download = mode !== 'read';
    const version = ++fileVersion.current;
    fileRequest.current?.abort(); fileRequest.current = new AbortController();
    setError(''); setDownloadFormat(null); if (download) setDownloading(true); else setFetchingPreview(true);
    try {
      const response = await fetch(`${endpoint}?${mode === 'markdown' ? 'download' : 'html'}=1`, { cache: 'no-store',
        signal: AbortSignal.any([fileRequest.current.signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok) await readResponse(response);
      if (download) {
        const type = mode === 'markdown' ? 'text/markdown' : 'text/html';
        if (!response.headers.get('content-type')?.startsWith(type) || !(await response.text()).trim())
          throw Error('보고서 파일을 확인하지 못했습니다. 다시 확인해 주세요.');
        if (version !== fileVersion.current) return;
        // Validate the private file first; let the browser handle the server attachment.
        // Some embedded browsers silently ignore generated blob downloads.
        const link = document.createElement('a');
        link.href = `${endpoint}?${mode === 'markdown' ? 'download' : 'html'}=1`;
        link.download = mode === 'markdown' ? 'N6-검사결과.md' : 'N6-정밀보고서.html';
        document.body.appendChild(link); link.click(); link.remove();
        setDownloadFormat(mode === 'markdown' ? 'markdown' : 'html');
      } else {
        if (!response.headers.get('content-type')?.startsWith('text/html')) throw Error('보고서 파일을 확인하지 못했습니다. 다시 확인해 주세요.');
        const html = await response.text();
        if (version !== fileVersion.current) return;
        if (!html.trim()) throw Error('보고서 파일을 확인하지 못했습니다. 다시 확인해 주세요.');
        setPreview(html);
      }
    } catch (reason) {
      if (version !== fileVersion.current) return;
      setPreview(null); setStatus(null); setError(reason instanceof Error ? reason.message : '결과 파일을 확인하지 못했어요. 다시 확인해 주세요.');
    } finally { if (version === fileVersion.current) { setDownloading(false); setFetchingPreview(false); } }
  }
  const copy = status ? statusCopy[status.state] : null;
  return <section className={`diagnosis-report${status ? ` is-${status.state}` : ''}`} aria-label="N6 검사 결과">
    {loading ? <div role="status" className="diagnosis-report-loading"><LoaderCircle className="diagnosis-spin"/><p>검사 결과를 확인하고 있어요.</p></div> : <>
      {status && <ReportProgress state={status.state}/>}
      {copy && <div className="diagnosis-report-summary">
        <span className={`diagnosis-report-icon${status?.state === 'ready' ? ' is-ready' : ''}`} aria-hidden="true">{status?.state === 'ready' ? <CheckCircle2 size={30}/> : <FileText size={30}/>}</span>
        <span className="diagnosis-eyebrow">나의 N6 검사</span><h1 ref={heading} tabIndex={-1}>{copy.title}</h1><p className="diagnosis-report-description">{copy.description.map((line, index) => <span key={line}>{index === 0 ? <strong>{line}</strong> : line}</span>)}</p>
        {status?.state === 'needs_review' && <button className="diagnosis-primary diagnosis-review-return" onClick={onExit}>{exitLabel}<ArrowRight size={16}/></button>}
      </div>}
      {status?.state === 'needs_review' && <details className="diagnosis-report-details" open>
        <summary><span>자세한 안내</span><ChevronDown size={20} aria-hidden="true"/></summary>
        <div className="diagnosis-report-details-body">
          <div><h2>얼마나 기다리면 되나요?</h2><p>운영팀의 확인이 필요한 상태예요.<br/>지금은 완료 시간을 안내하기 어렵습니다.</p></div>
          <div><h2>화면을 닫아도 되나요?</h2><p>네. 제출한 답변은 그대로 보관돼요.<br/>추가 결제 없이 운영팀 안내를 확인해 주세요.</p></div>
        </div>
      </details>}
      {status && ['queued', 'processing'].includes(status.state) && <div className="diagnosis-report-timing">
        <Clock3 size={20} aria-hidden="true"/><div><p>보고서 준비 예상 시간 <strong>약 30분~3시간</strong></p>
          <p>검사 제출 후부터 예상한 시간입니다.<br/>신청이 몰리거나 추가 확인이 필요하면 더 걸릴 수 있어요.</p>
          {!paused && <span>화면을 닫아도 보고서는 계속 준비됩니다.</span>}
        </div>
      </div>}
      {userId && readyPushEnabled && status && ['queued', 'processing', 'needs_review'].includes(status.state) && <div className="diagnosis-report-notifications"><PushSettings key={userId} userId={userId} diagnosis/></div>}
      {status?.state === 'ready' && <>
        <div className="diagnosis-report-actions"><button ref={openReport} className="diagnosis-primary" onClick={() => void getFile('read')} disabled={fetchingPreview || downloading}>{fetchingPreview ? <LoaderCircle className="diagnosis-spin" size={18}/> : <FileText size={18}/>}보고서 열기</button>
          <button className="diagnosis-secondary" onClick={() => void getFile('html')} disabled={fetchingPreview || downloading}><Download size={18}/>HTML 파일 받기</button>
          <button className="diagnosis-secondary" onClick={() => void getFile('markdown')} disabled={fetchingPreview || downloading}>{downloading ? <LoaderCircle className="diagnosis-spin" size={18}/> : <Download size={18}/>}MD 파일 받기</button></div>
        {downloadFormat && <p className="diagnosis-report-help" role="status">파일 저장 창을 확인해 주세요. 창이 안 뜨면 <a href={`${endpoint}?${downloadFormat === 'markdown' ? 'download' : 'html'}=1`} download={downloadFormat === 'markdown' ? 'N6-검사결과.md' : 'N6-정밀보고서.html'}>저장 창 다시 열기</a>를 눌러 주세요. 계속 안 되면 Safari·Chrome에서 이 화면을 열어 받아 주세요.</p>}
        <p className="diagnosis-report-help">HTML은 지금 보는 디자인 그대로 보관하는 파일입니다. MD는 다음 날 커리큘럼에서 내 사업에 맞게 정리할 때 사용합니다. 두 파일 모두 다시 받을 수 있습니다.</p>
      </>}
      {preview !== null && <DiagnosisReportReader html={preview} error={error} onClose={() => setPreview(null)} onError={setError}/>}
      {paused && <p className="diagnosis-report-help">자동 확인을 잠시 멈췄어요. 아래 버튼을 누르면 최신 상태를 확인할 수 있어요.</p>}
      {preview === null && error && <p className="diagnosis-error" role="alert">{error}</p>}
      {preview === null && <div className="diagnosis-report-footer">{(error || paused) && <button className="diagnosis-secondary" onClick={refresh} disabled={downloading || fetchingPreview}><RefreshCw size={16}/>{error ? '다시 연결하기' : '최신 상태 확인'}</button>}{status?.state !== 'needs_review' && <button className="diagnosis-secondary" onClick={onExit}>{exitLabel}<ArrowRight size={16}/></button>}</div>}
    </>}
  </section>;
}
