'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sharedTextAllowed } from '@/lib/curriculum-ai-sensitive';
import { ArrowUpRight, Check, ChevronRight, FilePlus2, Flag, History, LockKeyhole, MessageSquare, Sparkles, ThumbsUp, Users, X } from 'lucide-react';
import type { CampusSnapshot } from '../contracts';
import { openKinds, kindLabels, validateCommunityCommand, feedbackFocuses, clarityAnswers, composeWork, parseWork, composeReview, parseReview, unreviewedFirst, reviewedByOthers, type WorkBrief, type CommunityState, type CommunityPost, type CommunityCommand, type CommunityComment, type CommunityRewards } from './domain';
import { createCommunityDemo, demoPeerId, mutateCommunityDemo } from './demo';
import styles from './panel.module.css';
import { rememberCommunityDemoRewards,consumeCommunityOpen,getCommunityDemoState,rememberCommunityDemoState } from './events';
import { CommunityWorkflowPanel } from './workflow-panel';
import { PortfolioFiles } from './file-panel';
import { checkPortfolioFile, uploadPortfolioFile, sharePortfolioFile, demoUploads } from './upload';
import { needsShrink, shrinkVideo, previewSeconds } from './video-preview';
import { videoRetentionDays } from './files';
import { useCampusDraftGuard } from '../ui/draft-guard';
import { useConfirmBox } from '../ui/confirm-box';
import { staffLikeName } from '@/lib/campus-staff-name';

type Props = { initialTab?:Tab; snapshot: CampusSnapshot; demo: boolean; onOpen?: (lessonId: string) => void; onRewards?: (rewards: CommunityRewards) => void };
type Tab = 'all' | 'mine' | 'feedback' | 'talent' | 'demo_day';
const tabs: [Tab, string][] = [['all', '동료 결과물'], ['mine', '내 결과물 모음']];
const structured = (kind?: string) => kind === 'landing' || kind === 'ad';
const isVideo = (file: File) => file.type.startsWith('video/');
const emptyBrief = (): WorkBrief => ({ offer: '', focus: feedbackFocuses[0], note: '' });
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value)); }
function postDraft(post?: CommunityPost, lessonId?: string): Partial<CommunityCommand> { return { kind: post?.kind ?? 'landing', title: post?.title ?? '', body: post?.body ?? '', url: post?.url ?? '', imageUrls: post?.image_urls ?? [], lessonId: post?.lesson_id ?? lessonId ?? null, alias: post?.alias ?? '문샷 동료', visibility: post?.visibility ?? 'cohort', changeNote: '' }; }
const doneNotice: Partial<Record<CommunityCommand['action'], string>> = { remove: '삭제했어요.', remove_comment: '의견을 지웠어요.', withdraw: '나만 보기로 돌렸어요.', share: '기수에 다시 공유했어요.', edit_comment: '고친 의견을 저장했어요.' };
export function CommunityPanel(props: Props) {
  return <CommunitySession key={`${props.demo}:${props.snapshot.selectedEnrollmentId ?? ''}:${props.snapshot.viewer.id}`} {...props} />;
}
function CommunitySession({ snapshot, demo, onOpen, onRewards, initialTab }: Props) {
  const enrollmentId = snapshot.selectedEnrollmentId;
  const [ask, confirmBox] = useConfirmBox();
  const [state, setState] = useState<CommunityState | null>(() => demo ? getCommunityDemoState(snapshot.selectedEnrollmentId??'',snapshot.viewer.id)??createCommunityDemo(snapshot) : null);
  const [tab, setTab] = useState<Tab>(initialTab||'all'), [kindFilter, setKindFilter] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [focusPost,setFocusPost]=useState<string|null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null), [draft, setDraft] = useState<Partial<CommunityCommand>>(postDraft(undefined, snapshot.lessons[0]?.id));
  const [draftBaseline,setDraftBaseline]=useState('');
  const [brief, setBrief] = useState<WorkBrief>(emptyBrief), [picked, setPicked] = useState<File[]>([]), [uploading, setUploading] = useState(false), [filesVersion, setFilesVersion] = useState(0), [shrinking, setShrinking] = useState<{ done: number; total: number } | null>(null);
  const previews = useMemo(() => picked.map(file => ({ file, url: /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : '' })), [picked]);
  useEffect(() => () => previews.forEach(p => p.url && URL.revokeObjectURL(p.url)), [previews]);
  const lastSaved = useRef<{ postId?: string; revision?: number } | null>(null);
  const [loading, setLoading] = useState(!demo), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [report, setReport] = useState<{ post: CommunityPost; commentId?: string } | null>(null), [reportReason, setReportReason] = useState('');
  const [compare, setCompare] = useState(false);
  const composeDirty=!!editing&&(JSON.stringify([draft,brief])!==draftBaseline||picked.length>0);
  const closeCompose = async () => { if (!composeDirty || await ask('작성 중인 결과물을 닫을까요? 적은 내용은 사라져요.', '닫기')) setEditing(null); };
  useCampusDraftGuard(composeDirty||(!!report&&!!reportReason.trim()),busy||uploading);
  useEffect(()=>{if(demo&&enrollmentId&&state)rememberCommunityDemoState(enrollmentId,snapshot.viewer.id,state);},[demo,enrollmentId,snapshot.viewer.id,state]);
  const onRewardsRef = useRef(onRewards);
  useEffect(() => { onRewardsRef.current = onRewards; }, [onRewards]);
  useEffect(() => { if (!state?.rewards) return; onRewardsRef.current?.(state.rewards); if (demo && enrollmentId) rememberCommunityDemoRewards(enrollmentId, state.rewards); window.dispatchEvent(new CustomEvent('campus:community-changed', { detail: { enrollmentId, demo, rewards: state.rewards } })); }, [state?.rewards, enrollmentId, demo]);
  const receipts = useRef(new Map<string, string>()), formRef = useRef<HTMLDivElement>(null), detailRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<CommunityCommand | null>(null);
  const alive = useRef(true), readSequence=useRef(0);
  const invalidateReads=useCallback(()=>{readSequence.current+=1;},[]);
  const refresh = useCallback(async (page = 0, quiet = false) => {
    if (demo || !enrollmentId) return null;
    const sequence=++readSequence.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/campus/community?enrollmentId=${encodeURIComponent(enrollmentId)}&page=${page}&view=${tab==='mine'?'mine':'all'}${focusPost?'&postId='+encodeURIComponent(focusPost):''}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '작업실을 불러오지 못했습니다.');
      if (alive.current&&sequence===readSequence.current) setState(previous => {
        if (!previous || page === 0) return data;
        const merge = <T,>(old: T[], fresh: T[], key: (row: T) => string) => [...new Map([...old, ...fresh].map(row => [key(row), row])).values()];
        const next = data as CommunityState;
        return { ...next, posts: merge(previous.posts, next.posts, p => p.id), revisions: merge(previous.revisions, next.revisions, r => r.id), comments: merge(previous.comments, next.comments, c => c.id), acknowledgments: merge(previous.acknowledgments, next.acknowledgments, a => a.comment_id), reports: merge(previous.reports, next.reports, r => r.id) };
      });
      if (quiet && alive.current && sequence===readSequence.current) setFilesVersion(v => v + 1);
      return data as CommunityState;
    } catch (e) { if (!quiet&&alive.current&&sequence===readSequence.current) setError(e instanceof Error ? e.message : '작업실을 불러오지 못했습니다.'); }
    finally { if (alive.current&&sequence===readSequence.current) setLoading(false); }
    return null;
  }, [demo, enrollmentId, tab,focusPost]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => void refresh(), 0); return () => { clearTimeout(timer); invalidateReads();alive.current = false; }; }, [refresh,invalidateReads]);
  // Others keep uploading and reviewing while this window is open: pull quietly once a minute and when the window comes
  // back, without touching what is being typed. Only the first page is replaced, so it waits while more pages are open.
  const idle = useRef(true);
  useEffect(() => { idle.current = !busy && !uploading && !shrinking && !editing && (state?.pageInfo?.page ?? 0) === 0; }, [busy, uploading, shrinking, editing, state?.pageInfo?.page]);
  useEffect(() => { if (demo) return; const pull = () => { if (idle.current && document.visibilityState === 'visible') void refresh(0, true); }; const timer = setInterval(pull, 60000); window.addEventListener('focus', pull); return () => { clearInterval(timer); window.removeEventListener('focus', pull); }; }, [demo, refresh]);
  useEffect(()=>{const open=()=>{if(!enrollmentId)return;const intent=consumeCommunityOpen(enrollmentId);if(intent){setTab(intent.tab);setSelected(intent.postId??null);setFocusPost(intent.postId??null);setNotice(intent.tab==='demo_day'?'문샷 결과물 발표회에서 발표 시간과 동료 질문을 확인하세요.':'문샷 공간에서 선택한 동료의 결과물이에요.');}};window.addEventListener('campus:open-community',open);const timer=setTimeout(open,0);return()=>{clearTimeout(timer);window.removeEventListener('campus:open-community',open);};},[enrollmentId]);
  const command = (values: Partial<CommunityCommand>): CommunityCommand => ({ requestId: crypto.randomUUID(), enrollmentId: enrollmentId!, ...values } as CommunityCommand);
  async function send(input: CommunityCommand, actor?: string) {
    if (busy) return false;
    const shared = ['create', 'revise', 'comment', 'edit_comment'].includes(input.action) ? [input.title, input.body, input.url].filter(Boolean).join('\n') : '';
    const blocked = shared ? await sharedTextAllowed(shared, m => ask(m, '그대로 올리기')) : null;
    if (blocked) { setError(blocked); return false; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const valid = validateCommunityCommand(input); setPending(valid);
      if (demo) {
        if (!state) throw new Error('예시 작업실을 먼저 열어 주세요.');
        const next = mutateCommunityDemo(state, valid, snapshot, actor, receipts.current);
        setState(next); if (valid.action === 'create') setSelected(valid.requestId);
        lastSaved.current = { postId: valid.action === 'create' ? valid.requestId : valid.postId, revision: (valid.expectedRevision ?? 0) + 1 };
      } else {
        const response = await fetch('/api/campus/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
        const data = await response.json();
        // A review can lose a race with the owner's new version. Pull the new version in and say so; the typed review stays.
        if (response.status === 409 && valid.action === 'comment') { const fresh = await refresh(0, true), current = fresh?.posts.find(p => p.id === valid.postId)?.revision; if (current && current !== valid.expectedRevision) { setPending(null); setError('그 사이 이 결과물에 새 버전이 올라왔어요. 바뀐 내용을 보고 「의견 남기기」를 다시 눌러 주세요. 적어 둔 의견은 그대로 있어요.'); return false; } }
        if (!response.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
        if (data.postId) setSelected(data.postId);
        lastSaved.current = data;
        await refresh();
      }
      setPending(null); setNotice(valid.action === 'launch' ? '발사 기록을 남겼어요. 다음 도전도 함께해요.' : demo ? '예시 기록에 반영했어요. 실제 서버에는 저장되지 않습니다.' : doneNotice[valid.action] ?? '저장했어요.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); return false; }
    finally { if (alive.current) setBusy(false); }
  }
  async function pick(input: FileList | File[]) {
    const incoming = Array.from(input);
    try { if (picked.filter(f => !isVideo(f)).length + incoming.length > 4) throw Error('이미지는 네 장까지 올릴 수 있어요.'); if (incoming.some(isVideo)) throw Error('영상은 아래 「영상 올리기」 칸에 넣어 주세요.'); for (const file of incoming) await checkPortfolioFile(file); setPicked(old => [...old, ...incoming]); setError(''); }
    catch (e) { setError(e instanceof Error && /네 장|영상은/.test(e.message) ? e.message : 'PNG·JPG·WEBP 이미지나 PDF, 파일당 10MB까지 올릴 수 있어요.'); }
  }
  /** One video per post. A big or non-MP4 original is re-recorded small in this browser; only that preview is uploaded. */
  async function pickVideo(file: File) {
    if (shrinking) return;
    setError('');
    try {
      let ready = file;
      if (needsShrink(file)) { setShrinking({ done: 0, total: 0 }); ready = await shrinkVideo(file, (done, total) => { if (alive.current) setShrinking({ done, total }); }); }
      await checkPortfolioFile(ready);
      if (alive.current) setPicked(old => [...old.filter(f => !isVideo(f)), ready]);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '영상을 올리지 못했어요.'); }
    finally { if (alive.current) setShrinking(null); }
  }
  /** The post is saved first; its pictures follow, shared with the cohort when the post is. */
  async function attach(postId: string, revision: number, files: File[], shared: boolean) {
    if (!files.length || demo) return;
    setUploading(true);
    try { for (const file of files) { const saved = await uploadPortfolioFile(postId, revision, file); if (shared) await sharePortfolioFile(saved, 'cohort'); } }
    catch (e) { setError('글은 저장했지만 파일을 다 올리지 못했어요. 아래 첨부 칸에서 다시 올려 주세요. (' + (e instanceof Error ? e.message : '전송 실패') + ')'); }
    finally { if (alive.current) { setUploading(false); setFilesVersion(v => v + 1); } }
  }
  function compose(post?: CommunityPost) { const initial=postDraft(post, snapshot.lessons[0]?.id),initialBrief=post?parseWork(post.body)??{...emptyBrief(),note:post.body}:emptyBrief();setDraft(initial);setBrief(initialBrief);setPicked([]);setDraftBaseline(JSON.stringify([initial,initialBrief])); setEditing(post?.id ?? 'new'); setError(''); setTimeout(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); formRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, 0); }
  if (!enrollmentId) return <section className={styles.root}><p>기수를 선택하면 결과물과 동료의 의견을 모아 볼 수 있어요.</p></section>;
  const posts = state?.posts.filter(p => !p.hidden && !state.blockedIds.includes(p.owner_id) && (p.owner_id === snapshot.viewer.id || p.visibility === 'cohort')) ?? [];
  const inTab = posts.filter(p => (tab === 'mine' ? p.owner_id === snapshot.viewer.id : tab === 'feedback' ? p.kind === 'feedback' : tab === 'talent' ? p.kind.startsWith('talent_') : tab === 'demo_day' ? p.kind === 'demo_day' : p.visibility === 'cohort') && (!kindFilter || p.kind === kindFilter));
  const filtered = tab === 'all' ? unreviewedFirst(inTab, state?.comments ?? []) : inTab;
  const isStructured = structured(draft.kind);
  const post = posts.find(p => p.id === selected);
  const revisions = post ? state!.revisions.filter(r => r.post_id === post.id).sort((a, b) => a.revision - b.revision) : [];
  const rewards = state?.rewards;
  const messages = post ? state!.comments.filter(c => c.post_id === post.id && !c.hidden && !state!.blockedIds.includes(c.author_id)) : [];
  return <section className={styles.root} aria-labelledby="community-title">
    <header className={styles.header}><div><span className={styles.eyebrow}>MOONSHOT · 함께 만드는 변화</span><h2 id="community-title">랜딩 페이지와 광고 소재,<br className={styles.mobileBreak} /> 동료 눈으로 먼저 확인해요.</h2><p>올리면 같은 기수 동료가 3초 판단, 좋았던 점, 고칠 점을 남겨요. 받은 의견은 다음 버전으로 이어 가세요.</p></div><button type="button" className={styles.primary} onClick={() => compose()} disabled={busy || loading}><FilePlus2 size={18} /> 결과물 남기기</button></header>
    {demo && <div className={styles.demo}><Sparkles size={17} /> 예시 체험 · 아래 동료와 기록은 가상입니다. 새로고침하면 초기화됩니다.</div>}
    {!!rewards?.usefulFeedback && <p className={styles.hint}>내 의견이 도움이 됐다고 확인한 동료 {rewards.usefulFeedback}명</p>}
    <div className={styles.toolbar}><nav className={styles.tabs} aria-label="작업실 보기">{tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} className={tab === id ? styles.activeTab : ''} onClick={() => { setTab(id); setSelected(null); setFocusPost(null); }}>{label}</button>)}</nav><label className={styles.kindFilter}>보기 <select aria-label="종류로 보기" value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="">전체</option>{openKinds.map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select></label><button type="button" className={styles.textButton} onClick={() => void refresh()} disabled={demo || busy || loading}>새로고침</button></div>
    {tab === 'all' && <p className={styles.hint}>아직 의견을 못 받은 결과물이 올린 순서대로 위에 보여요. 새로 올라온 결과물과 의견은 1분마다 자동으로 반영돼요.</p>}
    {error && <div role="alert" className={styles.error}>{error}{pending && !busy && <button type="button" onClick={() => pending && void send(pending)}>같은 요청 다시 확인</button>}</div>}
    {notice && <p role="status" className={styles.notice}><Check size={16} />{notice}</p>}{confirmBox}
    {loading && <p role="status">작업실을 불러오고 있어요…</p>}
    {uploading && <p role="status">올린 파일을 보내고 있어요. 끝날 때까지 이 창을 닫지 마세요…</p>}
    {editing && <div className={styles.composer} ref={formRef}>
      <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>{editing === 'new' ? '작은 초안도 괜찮아요' : '이전 버전은 그대로 보관해요'}</span><h3>{editing === 'new' ? '결과물 남기기' : '개선한 새 버전'}</h3></div><button className={styles.iconButton} aria-label="작성 닫기" onClick={() => void closeCompose()} type="button"><X size={20} /></button></div>
      <form onPaste={e => { const input = Array.from(e.clipboardData.items).filter(x => x.kind === 'file').map(x => x.getAsFile()).filter((x): x is File => !!x); if (isStructured && input.length) { e.preventDefault(); void pick(input); } }} onSubmit={async event => { event.preventDefault(); const original = posts.find(p => p.id === editing);
        if (isStructured && !original && !draft.url && !picked.length) { setError('페이지 주소나 이미지, 영상 중 하나는 넣어 주세요.'); return; }
        const next = command({ ...draft, ...(isStructured ? { body: composeWork(brief), imageUrls: [], lessonId: null } : {}), action: original ? 'revise' : 'create', postId: original?.id, expectedRevision: original?.revision }), files = isStructured ? picked : [], shared = draft.visibility === 'cohort';
        if (demo && files.length) demoUploads.set(original?.id ?? next.requestId, { files, shared });
        if (await send(next)) { const saved = lastSaved.current; setPicked([]); setEditing(null); setTab('mine'); if (demo) setFilesVersion(v => v + 1); else if (saved?.postId) await attach(saved.postId, saved.revision ?? 1, files, shared); } else if (demo) demoUploads.delete(original?.id ?? next.requestId); }}>
        {isStructured ? <>
          <label>종류<select value={draft.kind} disabled={editing !== 'new'} onChange={e => setDraft({ ...draft, kind: e.target.value as CommunityCommand['kind'] })}>{openKinds.map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select></label>
          <label>제목<input required minLength={2} maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={draft.kind === 'ad' ? '예: 다이어트 도시락 인스타 광고 1안' : '예: 다이어트 도시락 랜딩 첫 화면'} /></label>
          <label>누구에게 무엇을 파나요?<input required minLength={5} maxLength={120} value={brief.offer} onChange={e => setBrief({ ...brief, offer: e.target.value })} placeholder="예: 점심을 거르는 30대 직장인에게 주 5일 도시락 구독" /></label>
          <label>의견받고 싶은 점<select value={brief.focus} onChange={e => setBrief({ ...brief, focus: e.target.value })}>{[...new Set([...feedbackFocuses, brief.focus])].map(f => <option key={f} value={f}>{f}</option>)}</select></label>
          <label>작업물 링크 <span>{draft.kind === 'ad' ? '선택 · 영상 광고는 올려 둔 주소를 넣어 주세요' : '선택 · 열려 있는 페이지 주소'}</span><input type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" /></label>
          <div className={styles.pick} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); void pick(e.dataTransfer.files); } }}>
            <label>{draft.kind === 'ad' ? '광고 이미지 올리기' : '화면 캡처 올리기'} <span>네 장까지 · 파일당 10MB</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" disabled={busy || uploading || picked.length >= 4} onChange={e => { if (e.target.files) void pick(e.target.files); e.target.value = ''; }} /></label>
            <small>파일을 여기에 끌어 놓거나, 캡처한 뒤 이 화면에서 붙여넣기(Ctrl+V)해도 돼요. 고객 이름·연락처 같은 개인정보는 지우고 올려 주세요.</small>
            <label>영상 올리기 <span>선택 · 한 개 · 앞 {previewSeconds}초까지</span><input type="file" accept="video/*" disabled={busy || uploading || !!shrinking} onChange={e => { const file = e.target.files?.[0]; if (file) void pickVideo(file); e.target.value = ''; }} /></label>
            <small>원본은 저장하지 않아요. 이 브라우저에서 작게 줄인 미리보기만 올라가고, 올린 날부터 {videoRetentionDays}일 동안 같은 기수가 볼 수 있어요. 그 뒤에는 영상만 자동으로 지워져요.</small>
            {shrinking && <p role="status" className={styles.shrinking}>영상을 작게 줄이는 중이에요{shrinking.total ? ` · ${Math.round(shrinking.done)}초 / ${Math.round(shrinking.total)}초` : ''}. 영상 길이만큼 걸려요. 이 화면을 그대로 두세요.<progress max={shrinking.total || 1} value={shrinking.done} /></p>}
            {!!previews.length && <ul className={styles.picked} aria-label="올릴 파일">{previews.map(({ file, url }, i) => <li key={file.name + i}>{url && isVideo(file) ? <video src={url} muted playsInline controls preload="metadata" aria-label={file.name} /> : url ? <img src={url} alt={file.name} /> : <span>{file.name}</span>}{isVideo(file) && <small>영상 · {(file.size / 1048576).toFixed(1)}MB</small>}<button type="button" className={styles.textButton} aria-label={file.name + ' 빼기'} onClick={() => setPicked(old => old.filter((_, n) => n !== i))}>빼기</button></li>)}</ul>}
          </div>
          <label>덧붙일 설명 <span>선택</span><textarea maxLength={5000} rows={3} value={brief.note} onChange={e => setBrief({ ...brief, note: e.target.value })} placeholder="만든 의도나 고민한 점이 있으면 적어 주세요." /></label>
          <label>공유할 별명<input required minLength={2} maxLength={24} value={draft.alias} onChange={e => setDraft({ ...draft, alias: e.target.value })} /></label>
        </> : <>
        <div className={styles.formGrid}><label>종류<select value={draft.kind} disabled>{[draft.kind ?? 'portfolio'].map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select></label><label>연결할 수업<select value={draft.lessonId ?? ''} onChange={e => setDraft({ ...draft, lessonId: e.target.value || null })}><option value="">수업 선택 안 함</option>{snapshot.lessons.map(l => <option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label></div>
        <label>제목<input required minLength={2} maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>작업 내용<textarea required minLength={10} maxLength={6000} rows={5} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
        <div className={styles.formGrid}><label>작업물 링크 <span>선택</span><input type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" /></label><label>공유할 별명<input required minLength={2} maxLength={24} value={draft.alias} onChange={e => setDraft({ ...draft, alias: e.target.value })} /></label></div>
        </>}
        {editing !== 'new' && <label>이번에 바꾼 점<input required minLength={5} maxLength={500} value={draft.changeNote} onChange={e => setDraft({ ...draft, changeNote: e.target.value })} placeholder="어떤 의견을 어떻게 반영했는지 적어 주세요." /></label>}
        {editing === 'new' ? null : <p className={styles.hint}>새 버전은 지금 공개 범위({(state?.posts.find(p => p.id === editing)?.visibility ?? draft.visibility) === 'cohort' ? '기수 공유' : '나만 보기'})를 그대로 따라요. 공개 범위는 결과물 화면의 ‘나만 보기로 돌리기 / 기수에 다시 공유’로 바꿔요.</p>}
        {editing === 'new' && <fieldset className={styles.sharing}><legend>누가 볼 수 있나요?</legend><label><input type="radio" name="community-visibility" checked={draft.visibility === 'private'} onChange={() => setDraft({ ...draft, visibility: 'private' })} /><LockKeyhole size={16} /> 나만 보기</label><label><input type="radio" name="community-visibility" checked={draft.visibility === 'cohort'} onChange={() => setDraft({ ...draft, visibility: 'cohort' })} /><Users size={16} /> 같은 기수와 공유</label><p>공유하면 올린 이미지도 같은 기수에 함께 보여요. 외부에 공개되거나 홍보에 자동 사용되지 않아요.</p></fieldset>}
        <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => void closeCompose()}>닫기</button><button className={styles.primary} disabled={busy || uploading || !!shrinking}>{busy ? '저장 중…' : draft.visibility === 'cohort' ? '기수에 공유하며 저장' : '나만 보도록 저장'}</button></div>
      </form>
    </div>}
    {!loading && state && <div className={`${styles.workspace} ${post ? styles.withDetail : ''}`}>
      <div className={styles.cards}>{filtered.length ? filtered.map(item => <button type="button" key={item.id} className={`${styles.postCard} ${selected === item.id ? styles.selected : ''}`} onClick={() => { setSelected(item.id); setCompare(false); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0); }}>
        <div className={styles.cardMeta}><span>{kindLabels[item.kind]}</span>{item.visibility === 'private' ? <LockKeyhole size={14} aria-label="나만 보기" /> : <Users size={14} aria-label="기수 공유" />}</div><h3>{item.title}</h3><p>{parseWork(item.body)?.offer ?? item.body}</p><div className={styles.cardBottom}><span>{item.owner_id === snapshot.viewer.id ? '내 결과물' : item.alias} · v{item.revision}</span><span>{item.visibility === 'cohort' && (state.comments.some(c => c.post_id === item.id && !c.hidden && c.author_id === snapshot.viewer.id && item.owner_id !== snapshot.viewer.id) ? <em className={styles.badge}>내가 의견 남김</em> : !reviewedByOthers(item, state.comments) && <em className={`${styles.badge} ${styles.waiting}`}>의견 기다리는 중</em>)}<MessageSquare size={13} />{state.comments.filter(c => c.post_id === item.id && !c.hidden).length}<ChevronRight size={15} /></span></div>
      </button>) : <div className={styles.empty}><FilePlus2 size={30} /><h3>{tab === 'mine' ? '첫 결과물을 남겨볼까요?' : tab === 'talent' ? '서로의 잘하는 일을 연결해요.' : tab === 'demo_day' ? '완벽한 완성보다, 공개할 수 있는 한 단계.' : '아직 공유된 작업물이 없어요.'}</h3><p>만들던 랜딩 페이지나 광고 소재 한 장이면 충분해요.</p><button type="button" className={styles.secondary} onClick={() => compose()}>결과물 남기기</button></div>}</div>
      {post && <article className={styles.detail} ref={detailRef} aria-label="선택한 작업물">
        <div className={styles.sectionHeader}><span className={styles.pill}>{kindLabels[post.kind]} · v{post.revision}</span><button type="button" className={styles.iconButton} aria-label="작업물 닫기" onClick={() => setSelected(null)}><X size={20} /></button></div>
        <h3 className={styles.detailTitle}>{post.title}</h3><p className={styles.byline}>{post.alias} · {date(post.updated_at)} · {post.visibility === 'private' ? '나만 보기' : '기수 공유'}</p>
        <WorkBody body={post.body} />
        <PortfolioFiles key={post.id} post={post} demo={demo} owner={post.owner_id===snapshot.viewer.id} version={filesVersion}/>
        {(post.kind.startsWith('talent_')||post.kind==='demo_day')&&<CommunityWorkflowPanel key={post.id} post={post} viewerId={snapshot.viewer.id} demo={demo}/>}
        <div className={styles.links}>{post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.external}>작업물 열기 <ArrowUpRight size={16} /></a>}{post.image_urls.map((url, i) => <a href={url} target="_blank" rel="noopener noreferrer" key={url} className={styles.external}>캡처 {i + 1} 보기 <ArrowUpRight size={16} /></a>)}{post.lesson_id && <button className={styles.textButton} type="button" onClick={() => onOpen?.(post.lesson_id!)} disabled={!onOpen}>연결된 수업 보기</button>}</div>
        <div className={styles.detailActions}>{post.owner_id === snapshot.viewer.id && <button type="button" className={styles.secondary} onClick={() => compose(post)} disabled={busy}>개선한 새 버전 저장</button>}{post.owner_id === snapshot.viewer.id && (post.visibility === 'cohort' ? <button type="button" className={styles.textButton} disabled={busy} onClick={async () => { if (await ask('이 결과물을 나만 보기로 돌릴까요? 동료 목록에서 사라지고, 공유한 첨부 파일도 다시 나만 보기가 돼요.', '나만 보기로 돌리기')) void send(command({ action: 'withdraw', postId: post.id })); }}>나만 보기로 돌리기</button> : !post.hidden && <button type="button" className={styles.textButton} disabled={busy} onClick={() => void send(command({ action: 'share', postId: post.id }))}>기수에 다시 공유</button>)}{post.owner_id === snapshot.viewer.id && <button type="button" className={styles.textButton} disabled={busy} onClick={async () => { if (await ask('이 결과물을 지울까요? 받은 의견도 함께 사라지고, 되돌릴 수 없어요.', '지우기')) void send(command({ action: 'remove', postId: post.id })); }}>삭제</button>}<button type="button" className={styles.textButton} aria-expanded={compare} onClick={() => setCompare(!compare)}><History size={15} /> 버전 {revisions.length}개 비교</button></div>
        {compare && <div className={styles.versionSection}><h4>작업의 변화를 나란히</h4>{revisions.length < 2 ? <p className={styles.hint}>새 버전을 저장하면 수정 전후를 비교할 수 있어요.</p> : <VersionComparison revisions={revisions} />}<ol className={styles.timeline}>{revisions.map(v => <li key={v.id}><strong>v{v.revision}</strong><span>{v.change_note}</span><small>{date(v.created_at)} · {v.visibility === 'private' ? '나만 보기' : '기수 공유'}</small></li>)}</ol></div>}
        <div className={styles.commentHeading}><h4>함께 다듬기 <span>{messages.length}</span></h4><p>{structured(post.kind) ? '처음 3초의 느낌, 좋았던 점 하나, 고칠 점 하나를 남겨 주세요.' : '좋았던 점 하나와, 더 나아질 제안 하나를 남겨주세요.'}</p></div>
        {messages.map(comment => <Feedback key={`${comment.id}:${state.acknowledgments.find(a => a.comment_id === comment.id)?.revision ?? 0}`} comment={comment} post={post} state={state} viewerId={snapshot.viewer.id} demo={demo} busy={busy} send={values => send(command(values))} ask={ask} onReport={() => { setReport({ post, commentId: comment.id }); setReportReason(''); }} />)}
        {post.visibility === 'cohort' && post.owner_id === snapshot.viewer.id && !demo ? <p className={styles.privateNote}>내 결과물이에요. 동료가 남긴 의견이 여기에 모여요.</p> : post.visibility === 'cohort' ? <CommentForm structured={structured(post.kind)} busy={busy} onSubmit={(body, alias) => send(command({ action: 'comment', postId: post.id, expectedRevision: post.revision, body, alias }))} /> : <p className={styles.privateNote}><LockKeyhole size={15} /> 나만 보는 기록입니다. 동료 의견을 받으려면 새 버전을 기수에 공유해 주세요.</p>}
        {demo && post.owner_id === snapshot.viewer.id && post.visibility === 'cohort' && !messages.some(c => c.author_id === demoPeerId) && <button type="button" className={styles.demoAction} disabled={busy} onClick={() => void send(command({ action: 'comment', postId: post.id, expectedRevision: post.revision, body: structured(post.kind) ? composeReview({ clear: '애매해요', good: '누구를 위한 상품인지 첫 문장에서 보여요.', fix: '대상이 겪는 구체적인 상황을 첫 문장에 추가하면 더 쉽게 이해할 수 있겠어요.' }) : '대상이 겪는 구체적인 상황을 첫 문장에 추가하면 더 쉽게 이해할 수 있겠어요.', alias: '예시 동료 지우' }), demoPeerId)}>체험: 예시 동료 의견 추가</button>}
        {demo && post.owner_id === demoPeerId && messages.some(c => c.author_id === snapshot.viewer.id) && <button type="button" className={styles.demoAction} disabled={busy} onClick={() => { const co = messages.find(c => c.author_id === snapshot.viewer.id)!; const ack = state.acknowledgments.find(a => a.comment_id === co.id); void send(command({ action: 'acknowledge', postId: post.id, commentId: co.id, expectedRevision: ack?.revision ?? 0, useful: true, decision: 'pending', reason: '' }), demoPeerId); }}>체험: 예시 동료가 도움됨 확인</button>}
        {post.owner_id !== snapshot.viewer.id && <div className={styles.safety}><button type="button" onClick={() => { setReport({ post }); setReportReason(''); }}><Flag size={14} /> 신고하기</button><button type="button" disabled={busy} onClick={() => void send(command({ action: 'block', targetId: post.owner_id }))}>이 동료 차단</button></div>}
      </article>}
    </div>}
    {state?.pageInfo?.hasNext && <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void refresh(state.pageInfo!.page + 1)}>작업물 더 보기</button></div>}
    {report && <form className={styles.report} onSubmit={async e => { e.preventDefault(); if (await send(command({ action: 'report', postId: report.post.id, commentId: report.commentId, reason: reportReason }))) setReport(null); }}><div className={styles.sectionHeader}><h3>운영자에게 확인 요청</h3><button type="button" aria-label="신고 닫기" className={styles.iconButton} onClick={() => setReport(null)}><X size={18} /></button></div><label>확인이 필요한 이유<textarea required minLength={5} maxLength={1000} value={reportReason} onChange={e => setReportReason(e.target.value)} /></label><p className={styles.hint}>신고 내용은 운영자와 작성자 본인에게만 보입니다.</p><button className={styles.primary} disabled={busy}>신고 접수</button></form>}
    {!!state?.blockedIds.length && <details className={styles.blocked}><summary>차단 관리 · {state.blockedIds.length}명</summary>{state.blockedIds.map((id, i) => <button key={id} type="button" disabled={busy} onClick={() => void send(command({ action: 'unblock', targetId: id }))}>차단한 동료 {i + 1} 해제</button>)}</details>}
  </section>;
}
function CommentForm({ busy, onSubmit, structured = false }: { structured?: boolean; busy: boolean; onSubmit: (body: string, alias: string) => Promise<boolean> }) {
  const [body, setBody] = useState(''), [alias, setAlias] = useState('문샷 동료'), [clear, setClear] = useState(''), [good, setGood] = useState(''), [fix, setFix] = useState('');
  const dirty = structured ? !!(clear || good.trim() || fix.trim()) : !!body.trim();
  useCampusDraftGuard(dirty,busy&&dirty);
  if (structured) return <form className={styles.commentForm} onSubmit={async e => { e.preventDefault(); if (await onSubmit(composeReview({ clear, good, fix }), alias)) { setClear(''); setGood(''); setFix(''); } }}>
    <fieldset className={styles.clarity}><legend>처음 3초 안에 무엇을 파는지 알겠나요?</legend><div>{clarityAnswers.map(answer => <label key={answer}><input type="radio" name="review-clarity" required checked={clear === answer} onChange={() => setClear(answer)} /> {answer}</label>)}</div></fieldset>
    <label>좋았던 점 하나<textarea required minLength={5} maxLength={300} rows={2} value={good} onChange={e => setGood(e.target.value)} placeholder="예: 첫 문장에서 누구를 위한 상품인지 바로 보여요." /></label>
    <label>고칠 점 하나<textarea required minLength={5} maxLength={300} rows={2} value={fix} onChange={e => setFix(e.target.value)} placeholder="예: 가격이 버튼 아래에 있어 놓치기 쉬워요. 버튼 위로 올려 보세요." /></label>
    <label>의견에 표시할 별명<input required minLength={2} maxLength={24} value={alias} onChange={e => setAlias(e.target.value)} /></label><div><small>칸마다 5자 이상 적어 주세요.</small><button className={styles.primary} disabled={busy}>의견 남기기</button></div></form>;
  return <form className={styles.commentForm} onSubmit={async e => { e.preventDefault(); if (await onSubmit(body, alias)) setBody(''); }}><label>동료에게 남길 의견<textarea required minLength={10} maxLength={2000} rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="구체적으로 좋았던 점과 이유, 바로 시도할 수 있는 제안을 남겨주세요." /></label><label>의견에 표시할 별명<input required minLength={2} maxLength={24} value={alias} onChange={e => setAlias(e.target.value)} /></label><div><small>10자 이상 · 같은 내용을 반복할 수 없어요.</small><button className={styles.primary} disabled={busy}>의견 남기기</button></div></form>;
}
function WorkBody({ body }: { body: string }) {
  const work = parseWork(body);
  if (!work) return <p className={styles.body}>{body}</p>;
  return <><dl className={styles.brief}><div><dt>누구에게 무엇을</dt><dd>{work.offer}</dd></div><div><dt>의견받고 싶은 점</dt><dd>{work.focus}</dd></div></dl>{work.note && <p className={styles.body}>{work.note}</p>}</>;
}
function ReviewBody({ body }: { body: string }) {
  const review = parseReview(body);
  if (!review) return <p className={styles.body}>{body}</p>;
  return <dl className={styles.brief}><div><dt>3초 안에 무엇을 파는지</dt><dd>{review.clear}</dd></div><div><dt>좋았던 점</dt><dd>{review.good}</dd></div><div><dt>고칠 점</dt><dd>{review.fix}</dd></div></dl>;
}
function Feedback({ comment, post, state, viewerId, demo = false, busy, send, ask, onReport }: { comment: CommunityComment; post: CommunityPost; state: CommunityState; viewerId: string; demo?: boolean; busy: boolean; send: (c: Partial<CommunityCommand>) => Promise<boolean>; ask: (message: string, yes?: string) => Promise<boolean>; onReport: () => void }) {
  const ack = state.acknowledgments.find(a => a.comment_id === comment.id);
  const [expanded, setExpanded] = useState(false), [useful, setUseful] = useState(ack?.useful ?? false), [decision, setDecision] = useState<'pending' | 'apply' | 'keep'>(ack?.decision ?? 'pending'), [reason, setReason] = useState(ack?.reason ?? ''), [revision, setRevision] = useState(ack?.applied_revision ?? post.revision);
  const eligibleRevisions = state.revisions.filter(r => r.post_id === post.id && r.revision > comment.post_revision);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(comment.body), mine = comment.author_id === viewerId;
  useCampusDraftGuard(expanded&&(useful!==(ack?.useful??false)||decision!==(ack?.decision??'pending')||reason!==(ack?.reason??'')||(decision==='apply'&&revision!==ack?.applied_revision)),busy&&expanded);
  return <div className={styles.comment}><div className={styles.commentMeta}><strong className={staffLikeName(comment.alias) ? styles.staffName : undefined}>{comment.alias}</strong><span>v{comment.post_revision}에 남긴 의견 · {date(comment.created_at)}{comment.edited_at ? ' · 수정됨' : ''}</span></div>{editing ? <form className={styles.ackForm} onSubmit={async e => { e.preventDefault(); if (await send({ action: 'edit_comment', commentId: comment.id, body: draft })) setEditing(false); }}><label>의견 고치기<textarea value={draft} minLength={10} maxLength={2000} rows={5} onChange={e => setDraft(e.target.value)} /></label><div className={styles.detailActions}><button type="submit" className={styles.secondary} disabled={busy || draft.trim().length < 10}>고친 의견 저장</button><button type="button" className={styles.textButton} onClick={() => { setDraft(comment.body); setEditing(false); }}>취소</button></div></form> : <ReviewBody body={comment.body} />}{mine && !editing && <div className={styles.detailActions}><button type="button" className={styles.textButton} disabled={busy} onClick={() => setEditing(true)}>고치기</button><button type="button" className={styles.textButton} disabled={busy} onClick={async () => { if (await ask('이 의견을 지울까요? 되돌릴 수 없어요.', '지우기')) void send({ action: 'remove_comment', commentId: comment.id }); }}>지우기</button></div>}{ack && <div className={styles.ackSummary}>{ack.useful && <span><ThumbsUp size={13} /> 도움됨</span>}<span>{ack.decision === 'apply' ? `v${ack.applied_revision}에 반영했어요` : ack.decision === 'keep' ? '이유를 남기고 유지했어요' : '의견을 확인했어요'}</span>{ack.reason && <p>{ack.reason}</p>}</div>}
    {post.owner_id === viewerId && comment.author_id !== viewerId ? <><button type="button" className={styles.textButton} aria-expanded={expanded} onClick={() => { if (!expanded) setRevision(ack?.applied_revision ?? eligibleRevisions.at(-1)?.revision ?? post.revision); setExpanded(!expanded); }}><ThumbsUp size={15} /> {ack ? '확인 기록 수정' : '도움됨 · 반영 기록 남기기'}</button>{expanded && <form className={styles.ackForm} onSubmit={async e => { e.preventDefault(); if (await send({ action: 'acknowledge', postId: post.id, commentId: comment.id, expectedRevision: ack?.revision ?? 0, useful, decision, reason, appliedRevision: decision === 'apply' ? revision : undefined })) setExpanded(false); }}><label className={styles.check}><input type="checkbox" checked={useful} onChange={e => setUseful(e.target.checked)} /> 이 의견이 실제로 도움이 되었어요</label><label>반영 상태<select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="pending">검토 중</option><option value="apply" disabled={!eligibleRevisions.length}>새 버전에 반영</option><option value="keep">이유를 남기고 유지</option></select></label>{decision === 'apply' && <label>반영한 버전<select value={revision} onChange={e => setRevision(Number(e.target.value))}>{eligibleRevisions.map(r => <option value={r.revision} key={r.id}>v{r.revision} · {r.change_note}</option>)}</select></label>}{!eligibleRevisions.length && <p className={styles.hint}>반영했다면 먼저 위에서 개선한 새 버전을 저장해 주세요.</p>}<label>반영 내용 또는 유지한 이유<textarea minLength={decision === 'pending' ? 0 : 5} required={decision !== 'pending'} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} rows={2} /></label><button className={styles.secondary} disabled={busy}>확인 기록 저장</button></form>}</> : comment.author_id !== viewerId && <button className={styles.textButton} type="button" onClick={onReport}>이 의견 신고</button>}
  </div>;
}
function VersionComparison({ revisions }: { revisions: CommunityState['revisions'] }) {
  const [before, setBefore] = useState(revisions[0].revision), [after, setAfter] = useState(revisions.at(-1)!.revision);
  return <div className={styles.comparison}>{[['수정 전', before, setBefore], ['수정 후', after, setAfter]].map(([label, value, update]) => { const v = revisions.find(r => r.revision === value)!; return <div key={String(label)}><label>{String(label)}<select value={Number(value)} onChange={e => (update as (v: number) => void)(Number(e.target.value))}>{revisions.map(r => <option key={r.id} value={r.revision}>v{r.revision} · {date(r.created_at)}</option>)}</select></label><h5>{v.title}</h5><WorkBody body={v.body} />{v.url && <a href={v.url} target="_blank" rel="noopener noreferrer">당시 작업물 링크 <ArrowUpRight size={13} /></a>}</div>; })}</div>;
}
export { CommunityModerationPanel } from './moderation-panel';
