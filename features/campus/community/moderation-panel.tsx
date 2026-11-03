'use client';
import { useEffect, useState } from 'react';
import type { CommunityModerationState } from './repository';
import type { CommunityCommand } from './domain';
import styles from './panel.module.css';
import { CommunityWorkflowPanel } from './workflow-panel';
export function CommunityModerationPanel({ cohortId }: { cohortId: string }) {
  return <ModerationSession key={cohortId} cohortId={cohortId} />;
}
function ModerationSession({ cohortId }: { cohortId: string }) {
  const [state, setState] = useState<CommunityModerationState | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/campus/community/moderation?cohortId=${encodeURIComponent(cohortId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setState(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '신고 목록을 확인하지 못했습니다.'); });
    return () => controller.abort();
  }, [cohortId]);
  async function moderate(postId: string, moderation: CommunityCommand['moderation'], reportId?: string, commentId?: string) {
    if (busy || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/campus/community/moderation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), enrollmentId: cohortId, action: 'moderate', postId, commentId, reportId, moderation, reason }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      const reload = await fetch(`/api/campus/community/moderation?cohortId=${encodeURIComponent(cohortId)}`, { cache: 'no-store' });
      const current = await reload.json(); if (!reload.ok) throw new Error(current.error); setState(current); setReason('');
    } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); } finally { setBusy(false); }
  }
  return <section className={styles.root} aria-label="커뮤니티 관리"><header className={styles.header}><div><span className={styles.eyebrow}>MOONSHOT · 운영 지원</span><h2>의견이 안전하게 오가는 작업실</h2><p>신고를 확인하고 숨김·복구·처리 완료를 기록합니다. 조치 이유와 담당자는 서버에 보존됩니다.</p></div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!state && !error && <p role="status">신고 기록을 확인하고 있어요…</p>}
    {state?.viewerId&&<details><summary>데모데이 발표 진행</summary>{state.posts.filter(p=>p.kind==='demo_day'&&p.visibility==='cohort'&&!p.hidden).map(p=><details key={p.id}><summary>{p.title} · {p.alias}</summary><CommunityWorkflowPanel post={p} viewerId={state.viewerId!} demo={false}/></details>)}</details>}
    <label>조치 사유 <span>5자 이상 · 모든 조치에 함께 기록</span><textarea rows={2} minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    {state && <><h3>접수된 신고 · {state.reports.filter(r => r.status === 'open').length}건</h3>{!state.reports.length && <p className={styles.hint}>접수된 신고가 없습니다.</p>}{state.reports.map(r => { const post = state.posts.find(p => p.id === r.post_id), comment = state.comments.find(c => c.id === r.comment_id); return <article className={styles.comment} key={r.id}><span className={styles.pill}>{r.status === 'open' ? '확인 필요' : '처리 완료'}</span><h4>{post?.title ?? '삭제된 작업물'}</h4>{comment && <p className={styles.body}>의견: {comment.body}</p>}<p className={styles.body}>신고 사유: {r.reason}</p><div className={styles.links}><button className={styles.secondary} type="button" disabled={busy || reason.trim().length < 5 || !post} onClick={() => post && void moderate(post.id, post.hidden ? 'restore_post' : 'hide_post')}>{post?.hidden ? '작업물 복구' : '작업물 숨김'}</button>{comment && <button className={styles.secondary} type="button" disabled={busy || reason.trim().length < 5} onClick={() => void moderate(r.post_id, comment.hidden ? 'restore_comment' : 'hide_comment', undefined, comment.id)}>{comment.hidden ? '의견 복구' : '의견 숨김'}</button>}{r.status === 'open' && <button className={styles.primary} type="button" disabled={busy || reason.trim().length < 5} onClick={() => void moderate(r.post_id, 'resolve_report', r.id)}>신고 처리 완료</button>}</div></article>; })}</>}
  </section>;
}
