"use client";

import { useEffect, useRef, useState } from "react";

type Source = { id: string; title: string; course_code: string };
type Preview = { sourceId: string; title: string; revision: string; weeks: number; lessons: number; contents: number; missions: number; quizzes: number; resources: number };
const endpoint = "/api/platform/curriculum-copy";
async function read(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "불러오지 못했습니다. 다시 시도해 주세요.");
  return result;
}

export function CurriculumCopyPanel({ targetId, eligible, disabled, dirty, onCopied }: {
  targetId: string; eligible: boolean; disabled: boolean; dirty: boolean; onCopied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [more, setMore] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open || copied) return;
    const controller = new AbortController();
    fetch(`${endpoint}?target=${encodeURIComponent(targetId)}&q=${encodeURIComponent(query)}&page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(read).then(result => { if (!controller.signal.aborted) { setSources(result.sources); setMore(result.hasMore); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, targetId, query, page, refresh, copied]);
  useEffect(() => {
    if (!sourceId || !open || copied) return;
    const controller = new AbortController();
    fetch(`${endpoint}?source=${encodeURIComponent(sourceId)}`, { cache: "no-store", signal: controller.signal })
      .then(read).then(result => { if (!controller.signal.aborted) setPreview(result.preview); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [sourceId, open, refresh, copied]);

  function resetRead() {
    setLoading(true); setError(""); setSources([]); setMore(false); setPreview(null);
    setPreviewLoading(Boolean(sourceId));
  }
  function selectSource(id: string) {
    setSourceId(id); setPreview(null); setPreviewLoading(Boolean(id)); setError("");
  }
  async function copy() {
    if (inFlight.current || !preview || disabled || dirty || !eligible) return;
    inFlight.current = true; setBusy(true); setError("");
    const fingerprint = `${targetId}:${preview.sourceId}:${preview.revision}`;
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await read(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, sourceId: preview.sourceId, revision: preview.revision, requestId: request.current.id }) }));
      setCopied(true); onCopied();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "복사하지 못했습니다. 다시 시도해 주세요."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const locked = disabled || dirty || busy || copied;
  return <section className="product-curriculum-guide" aria-label="기존 커리큘럼 불러오기">
    <h3>기존 커리큘럼 불러오기</h3>
    <p>같은 상품에 기수만 추가하면 현재 커리큘럼을 그대로 사용합니다. 기수별로 내용을 다르게 운영하려면 새 상품을 만든 뒤 이전 상품의 내용을 불러오세요.</p>
    {copied ? <div role="status"><p>비공개 복사본을 저장했습니다. 원본에는 영향을 주지 않습니다. 화면을 새로고침한 뒤 학습·미션·공통 자료를 확인하고 필요한 항목을 공개해 주세요.</p><button className="btn" type="button" onClick={() => window.location.reload()}>복사한 내용 새로고침</button></div> : <>
      {!eligible && <p className="meta">주차와 공통 자료가 없는 ‘작성 중’ 상품에서 사용할 수 있습니다. 기존 내용은 덮어쓰지 않습니다.</p>}
      {dirty && <p className="notice">다른 탭에서 수정한 상품 정보를 먼저 저장해 주세요.</p>}
      <button className="btn" type="button" disabled={!eligible || locked} onClick={() => { resetRead(); setOpen(value => !value); }}>{open ? "불러오기 닫기" : "원본 상품 선택"}</button>
      {open && <div className="curriculum-copy-options">
        <div className="product-curriculum-create"><label>원본 상품 검색<input value={search} maxLength={100} disabled={locked} onChange={event => setSearch(event.target.value)} /></label><button className="btn small" type="button" disabled={locked} onClick={() => { resetRead(); setPreviewLoading(false); setPage(0); setSourceId(""); setQuery(search.trim()); setRefresh(value => value + 1); }}>검색</button></div>
        {loading ? <p role="status">원본 상품을 찾는 중입니다.</p> : <>
          <label>불러올 상품<select value={sourceId} disabled={locked || !eligible} onChange={event => selectSource(event.target.value)}><option value="">상품을 선택해 주세요</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title} · {source.course_code}</option>)}</select></label>
          {!sources.length && <p className="meta">검색 결과가 없습니다. 다른 이름으로 검색해 주세요.</p>}
          {(page > 0 || more) && <div className="product-curriculum-create"><button className="btn small" type="button" disabled={locked || page === 0} onClick={() => { resetRead(); selectSource(""); setPage(value => value - 1); }}>이전</button><span>{page + 1}페이지</span><button className="btn small" type="button" disabled={locked || !more} onClick={() => { resetRead(); selectSource(""); setPage(value => value + 1); }}>다음</button></div>}
        </>}
        {previewLoading && <p role="status">복사할 내용을 확인하는 중입니다.</p>}
        {preview && <div className="notice">
          <strong>{preview.title}</strong>
          <p>주차 {preview.weeks}개 · 학습 {preview.lessons}개 (콘텐츠 {preview.contents}개)<br />미션 {preview.missions}개 · 퀴즈 {preview.quizzes}개 · 공통 자료 {preview.resources}개</p>
          <p>주차·학습·미션과 미리보기는 모두 비공개로 복사합니다. 영상·파일은 같은 원본 주소를 사용하며, 공통 자료의 다운로드 범위는 유지합니다.</p>
          <p>가격·모집 일정·수강생·학습 진도·제출물·결제 내역은 복사하지 않습니다.</p>
          {preview.weeks === 0 && <p>원본에 복사할 주차가 없습니다.</p>}
          <button className="btn primary" type="button" disabled={locked || !eligible || previewLoading || preview.sourceId !== sourceId || preview.weeks === 0} onClick={() => void copy()}>{busy ? "복사 중…" : "비공개로 불러오기"}</button>
        </div>}
        {error && <p className="notice warning" role="alert">{error} <button className="btn small" type="button" disabled={locked} onClick={() => { resetRead(); setRefresh(value => value + 1); }}>다시 확인</button></p>}
      </div>}
    </>}
  </section>;
}
