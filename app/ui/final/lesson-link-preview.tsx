'use client';
import { useEffect, useRef, useState } from 'react';
export function LessonLinkPreview({ url, onApply }: { url: string; onApply: (title: string) => void }) {
  const [state, setState] = useState<{ loading?: boolean; title?: string; error?: string }>({});
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);
  async function load() {
    current.current?.abort(); const abort = new AbortController(); current.current = abort;
    const timer = setTimeout(() => abort.abort(), 8000); setState({ loading: true });
    try {
      const response = await fetch('/api/admin/link-preview?' + new URLSearchParams({ url }), { cache: 'no-store', signal: abort.signal });
      const result = await response.json(); if (!response.ok) throw Error(result.error || '제목을 가져오지 못했습니다.');
      if (!abort.signal.aborted) setState({ title: result.title });
    } catch (error) { if (current.current === abort) setState({ error: abort.signal.aborted ? '조회 시간이 초과됐습니다. 제목을 직접 입력해 주세요.' : (error as Error).message }); }
    finally { clearTimeout(timer); }
  }
  return <div className="lba-link-preview"><button className="btn small" type="button" disabled={state.loading || !url} onClick={() => void load()}>{state.loading ? '사이트 제목 확인 중…' : '사이트 제목 불러오기'}</button>
    {state.title && <div className="notice"><p>{state.title}</p><button type="button" className="btn small" onClick={() => { onApply(state.title!); setState({}); }}>이 제목 적용</button></div>}
    {state.error && <p role="alert">{state.error}</p>}<p className="meta">제목을 불러온 뒤 적용할 수 있습니다. 직접 작성한 문구는 자동으로 바뀌지 않습니다.</p></div>;
}
export function LessonLinkCard({ url, title }: { url: string; title?: string }) {
  let domain; try { domain = new URL(url).hostname; } catch { return null; }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="lb-link-card"><span aria-hidden="true" className="lb-link-icon">↗</span><span><strong>{title?.trim() || domain}</strong><small>{domain}</small></span><span className="sr-only">새 창에서 열기</span></a>;
}
