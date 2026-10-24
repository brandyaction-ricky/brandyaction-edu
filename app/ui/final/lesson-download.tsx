"use client";

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { lessonMediaUrl, type LessonMediaContext } from '@/lib/lesson-media';

type Metadata = { name: string; size: number; kind: string };
export function LessonDownload({ assetId, caption, context, submissionId }: { assetId: string; caption?: string; context?: LessonMediaContext; submissionId?: string }) {
  const url = lessonMediaUrl(assetId, context, submissionId);
  const [state, setState] = useState<{ url: string; data?: Metadata; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(url + '&metadata=1', { credentials: 'same-origin', cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '첨부 파일을 확인하지 못했습니다.');
      if (data.kind !== 'file' || typeof data.name !== 'string' || !Number.isSafeInteger(data.size) || data.size < 1) throw new Error('첨부 파일 정보를 확인해 주세요.');
      if (!abort.signal.aborted) setState({ url, data });
    }).catch(error => { if (!abort.signal.aborted) setState({ url, error: (error as Error).message }); });
    return () => abort.abort();
  }, [url, attempt]);
  const current = state?.url === url ? state : null;
  const file = current?.data;
  return <div className="lb-download" aria-label="학습 첨부 파일">
    <FileText size={24} aria-hidden="true" />
    <div className="lb-download-info"><strong>{file?.name || '첨부 파일'}</strong>
      {file && <small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))}KB` : `${(file.size / (1024 * 1024)).toFixed(1)}MB`}</small>}
      {caption && <p>{caption}</p>}
      {current?.error ? <><p role="alert">{current.error}</p><button type="button" className="btn small" onClick={() => { setState(null); setAttempt(value => value + 1); }}>첨부 파일 다시 확인</button></> : !file && <span role="status">파일을 확인하고 있습니다…</span>}
    </div>
    {file && <a className="btn small" href={url + '&download=1'} target="_blank" rel="noopener noreferrer" aria-label={`${file.name} 다운로드`}><Download size={16} aria-hidden="true" />다운로드</a>}
  </div>;
}
