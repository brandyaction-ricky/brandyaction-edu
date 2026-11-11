'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, FilePlus2, Flag, History, LockKeyhole, MessageSquare, Rocket, ShieldCheck, Sparkles, ThumbsUp, Users, X } from 'lucide-react';
import type { CampusSnapshot } from '../contracts';
import { openKinds, kindLabels, validateCommunityCommand, type CommunityState, type CommunityPost, type CommunityCommand, type CommunityComment, type CommunityRewards } from './domain';
import { createCommunityDemo, demoPeerId, mutateCommunityDemo } from './demo';
import styles from './panel.module.css';
import { rememberCommunityDemoRewards,consumeCommunityOpen,getCommunityDemoState,rememberCommunityDemoState } from './events';
import { CommunityWorkflowPanel } from './workflow-panel';
import { PortfolioFiles } from './file-panel';
import { useCampusDraftGuard } from '../ui/draft-guard';

type Props = { initialTab?:Tab; snapshot: CampusSnapshot; demo: boolean; onOpen?: (lessonId: string) => void; onRewards?: (rewards: CommunityRewards) => void };
type Tab = 'all' | 'mine' | 'feedback' | 'talent' | 'demo_day';
const tabs: [Tab, string][] = [['all', '동료 작업실'], ['mine', '내 결과물 모음'], ['feedback', '의견 나누기']];
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value)); }
function postDraft(post?: CommunityPost, lessonId?: string): Partial<CommunityCommand> { return { kind: post?.kind ?? 'portfolio', title: post?.title ?? '', body: post?.body ?? '', url: post?.url ?? '', imageUrls: post?.image_urls ?? [], lessonId: post?.lesson_id ?? lessonId ?? null, alias: post?.alias ?? '문샷 동료', visibility: post?.visibility ?? 'private', changeNote: '' }; }
export function CommunityPanel(props: Props) {
  return <CommunitySession key={`${props.demo}:${props.snapshot.selectedEnrollmentId ?? ''}:${props.snapshot.viewer.id}`} {...props} />;
}
function CommunitySession({ snapshot, demo, onOpen, onRewards, initialTab }: Props) {
  const enrollmentId = snapshot.selectedEnrollmentId;
  const [state, setState] = useState<CommunityState | null>(() => demo ? getCommunityDemoState(snapshot.selectedEnrollmentId??'',snapshot.viewer.id)??createCommunityDemo(snapshot) : null);
  const [tab, setTab] = useState<Tab>(initialTab||'all'), [selected, setSelected] = useState<string | null>(null);
  const [focusPost,setFocusPost]=useState<string|null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null), [draft, setDraft] = useState<Partial<CommunityCommand>>(postDraft(undefined, snapshot.lessons[0]?.id));
  const [draftBaseline,setDraftBaseline]=useState('');
  const [loading, setLoading] = useState(!demo), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [report, setReport] = useState<{ post: CommunityPost; commentId?: string } | null>(null), [reportReason, setReportReason] = useState('');
  const [compare, setCompare] = useState(false);
  useCampusDraftGuard((!!editing&&JSON.stringify(draft)!==draftBaseline)||(!!report&&!!reportReason.trim()),busy);
  useEffect(()=>{if(demo&&enrollmentId&&state)rememberCommunityDemoState(enrollmentId,snapshot.viewer.id,state);},[demo,enrollmentId,snapshot.viewer.id,state]);
  const onRewardsRef = useRef(onRewards);
  useEffect(() => { onRewardsRef.current = onRewards; }, [onRewards]);
  useEffect(() => { if (!state?.rewards) return; onRewardsRef.current?.(state.rewards); if (demo && enrollmentId) rememberCommunityDemoRewards(enrollmentId, state.rewards); window.dispatchEvent(new CustomEvent('campus:community-changed', { detail: { enrollmentId, demo, rewards: state.rewards } })); }, [state?.rewards, enrollmentId, demo]);
  const receipts = useRef(new Map<string, string>()), formRef = useRef<HTMLDivElement>(null), detailRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<CommunityCommand | null>(null);
  const alive = useRef(true), readSequence=useRef(0);
  const invalidateReads=useCallback(()=>{readSequence.current+=1;},[]);
  const refresh = useCallback(async (page = 0) => {
    if (demo || !enrollmentId) return;
    const sequence=++readSequence.current;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/campus/community?enrollmentId=${encodeURIComponent(enrollmentId)}&page=${page}&view=${tab}${focusPost?'&postId='+encodeURIComponent(focusPost):''}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '작업실을 불러오지 못했습니다.');
      if (alive.current&&sequence===readSequence.current) setState(previous => {
        if (!previous || page === 0) return data;
        const merge = <T,>(old: T[], fresh: T[], key: (row: T) => string) => [...new Map([...old, ...fresh].map(row => [key(row), row])).values()];
        const next = data as CommunityState;
        return { ...next, posts: merge(previous.posts, next.posts, p => p.id), revisions: merge(previous.revisions, next.revisions, r => r.id), comments: merge(previous.comments, next.comments, c => c.id), acknowledgments: merge(previous.acknowledgments, next.acknowledgments, a => a.comment_id), reports: merge(previous.reports, next.reports, r => r.id) };
      });
    } catch (e) { if (alive.current&&sequence===readSequence.current) setError(e instanceof Error ? e.message : '작업실을 불러오지 못했습니다.'); }
    finally { if (alive.current&&sequence===readSequence.current) setLoading(false); }
  }, [demo, enrollmentId, tab,focusPost]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => void refresh(), 0); return () => { clearTimeout(timer); invalidateReads();alive.current = false; }; }, [refresh,invalidateReads]);
  useEffect(()=>{const open=()=>{if(!enrollmentId)return;const intent=consumeCommunityOpen(enrollmentId);if(intent){setTab(intent.tab);setSelected(intent.postId??null);setFocusPost(intent.postId??null);setNotice(intent.tab==='demo_day'?'문샷 결과물 발표회에서 발표 시간과 동료 질문을 확인하세요.':'문샷 공간에서 선택한 동료의 결과물이에요.');}};window.addEventListener('campus:open-community',open);const timer=setTimeout(open,0);return()=>{clearTimeout(timer);window.removeEventListener('campus:open-community',open);};},[enrollmentId]);
  const command = (values: Partial<CommunityCommand>): CommunityCommand => ({ requestId: crypto.randomUUID(), enrollmentId: enrollmentId!, ...values } as CommunityCommand);
  async function send(input: CommunityCommand, actor?: string) {
    if (busy) return false;
    setError(''); setNotice(''); setBusy(true);
    try {
      const valid = validateCommunityCommand(input); setPending(valid);
      if (demo) {
        if (!state) throw new Error('예시 작업실을 먼저 열어 주세요.');
        const next = mutateCommunityDemo(state, valid, snapshot, actor, receipts.current);
        setState(next); if (valid.action === 'create') setSelected(valid.requestId);
      } else {
        const response = await fetch('/api/campus/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
        if (data.postId) setSelected(data.postId);
        await refresh();
      }
      setPending(null); setNotice(valid.action === 'launch' ? '발사 기록을 남겼어요. 다음 도전도 함께해요.' : demo ? '예시 기록에 반영했어요. 실제 서버에는 저장되지 않습니다.' : '저장했어요.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); return false; }
    finally { if (alive.current) setBusy(false); }
  }
  function compose(post?: CommunityPost) { const initial=postDraft(post, snapshot.lessons[0]?.id);setDraft(initial);setDraftBaseline(JSON.stringify(initial)); setEditing(post?.id ?? 'new'); setError(''); setTimeout(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); formRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, 0); }
  if (!enrollmentId) return <section className={styles.root}><p>기수를 선택하면 결과물과 동료의 의견을 모아 볼 수 있어요.</p></section>;
  const posts = state?.posts.filter(p => !p.hidden && !state.blockedIds.includes(p.owner_id) && (p.owner_id === snapshot.viewer.id || p.visibility === 'cohort')) ?? [];
  const filtered = posts.filter(p => tab === 'mine' ? p.owner_id === snapshot.viewer.id : tab === 'feedback' ? p.kind === 'feedback' : tab === 'talent' ? p.kind.startsWith('talent_') : tab === 'demo_day' ? p.kind === 'demo_day' : p.visibility === 'cohort');
  const post = posts.find(p => p.id === selected);
  const revisions = post ? state!.revisions.filter(r => r.post_id === post.id).sort((a, b) => a.revision - b.revision) : [];
  const rewards = state?.rewards;
  const messages = post ? state!.comments.filter(c => c.post_id === post.id && !c.hidden && !state!.blockedIds.includes(c.author_id)) : [];
  return <section className={styles.root} aria-labelledby="community-title">
    <header className={styles.header}><div><span className={styles.eyebrow}>MOONSHOT · 함께 만드는 변화</span><h2 id="community-title">작업물은 쌓이고,<br className={styles.mobileBreak} /> 함께 더 좋아져요.</h2><p>작은 초안부터 공유하고, 받은 의견을 다음 버전으로 연결해 보세요.</p></div><button type="button" className={styles.primary} onClick={() => compose()} disabled={busy || loading}><FilePlus2 size={18} /> 결과물 남기기</button></header>
    {demo && <div className={styles.demo}><Sparkles size={17} /> 예시 체험 · 아래 동료와 기록은 가상입니다. 새로고침하면 초기화됩니다.</div>}
    {rewards && <div className={styles.stats} aria-label="검증된 성장 기록">
      <div><span>필수 과제 승인</span><strong>{rewards.approvedMissions}<small> / {rewards.requiredMissions}</small></strong><p>현재 공개 커리큘럼 기준</p></div>
      <div><span>도움이 된 동료</span><strong>{rewards.usefulFeedback}<small>명</small></strong><p>받은 사람이 확인한 의견</p></div>
      <div><span>내 성장 레벨</span><strong>레벨 {rewards.level}<small> · {rewards.xp} 성장 점수</small></strong><p>과제 승인 + 유용한 기여</p></div>
      <div><span>함께 발사한 동료</span><strong>{rewards.cohortLaunches}<small> / {rewards.cohortGoal}명</small></strong><p>기수 공동 로켓 · 누적 발사</p></div>
    </div>}
    <div className={styles.toolbar}><nav className={styles.tabs} aria-label="작업실 보기">{tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} className={tab === id ? styles.activeTab : ''} onClick={() => { setTab(id); setSelected(null); setFocusPost(null); }}>{label}</button>)}</nav><button type="button" className={styles.textButton} onClick={() => void refresh()} disabled={demo || busy || loading}>새로고침</button></div>
    {error && <div role="alert" className={styles.error}>{error}{pending && !busy && <button type="button" onClick={() => pending && void send(pending)}>같은 요청 다시 확인</button>}</div>}
    {notice && <p role="status" className={styles.notice}><Check size={16} />{notice}</p>}
    {loading && <p role="status">작업실을 불러오고 있어요…</p>}
    {editing && <div className={styles.composer} ref={formRef}>
      <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>{editing === 'new' ? '작은 초안도 괜찮아요' : '이전 버전은 그대로 보관해요'}</span><h3>{editing === 'new' ? '결과물 남기기' : '개선한 새 버전'}</h3></div><button className={styles.iconButton} aria-label="작성 닫기" onClick={() => setEditing(null)} type="button"><X size={20} /></button></div>
      <form onSubmit={async event => { event.preventDefault(); const original = posts.find(p => p.id === editing); if (await send(command({ ...draft, action: original ? 'revise' : 'create', postId: original?.id, expectedRevision: original?.revision }))) { setEditing(null); setTab('mine'); } }}>
        <div className={styles.formGrid}><label>종류<select value={draft.kind} disabled={editing !== 'new'} onChange={e => setDraft({ ...draft, kind: e.target.value as CommunityCommand['kind'] })}>{(editing === 'new' ? openKinds : [draft.kind ?? 'portfolio']).map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select></label><label>연결할 수업<select value={draft.lessonId ?? ''} onChange={e => setDraft({ ...draft, lessonId: e.target.value || null })}><option value="">수업 선택 안 함</option>{snapshot.lessons.map(l => <option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label></div>
        <label>제목<input required minLength={2} maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="어떤 작업을 했고, 무엇이 궁금한가요?" /></label>
        <label>작업 내용<textarea required minLength={10} maxLength={6000} rows={5} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} placeholder={draft.kind === 'failure' ? '시도한 것 → 기대와 달랐던 결과 → 배운 점 → 다음 시도' : draft.kind === 'talent_offer' || draft.kind === 'talent_request' ? '도울 수 있는 일 또는 필요한 도움 · 예상 분량 · 가능한 시간 · 기대하는 교환' : '만든 목적 · 시도한 방법 · 구체적으로 의견받고 싶은 점을 적어 주세요.'} /></label>
        <div className={styles.formGrid}><label>작업물 링크 <span>선택</span><input type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" /></label><label>공유할 별명<input required minLength={2} maxLength={24} value={draft.alias} onChange={e => setDraft({ ...draft, alias: e.target.value })} /></label></div>
        <label>캡처 이미지 링크 <span>선택 · 최대 4개, 줄마다 하나</span><textarea rows={2} value={draft.imageUrls?.join('\n')} onChange={e => setDraft({ ...draft, imageUrls: e.target.value.split('\n').filter(Boolean) })} placeholder="공유 권한이 있는 HTTPS 이미지 링크" /></label><p className={styles.hint}>링크를 여는 사람에게도 접근 권한이 있는지 확인해 주세요. 본인만 볼 캡처·PDF는 작업물을 저장한 후 비공개 첨부에 넣을 수 있어요.</p>
        {editing !== 'new' && <label>이번에 바꾼 점<input required minLength={5} maxLength={500} value={draft.changeNote} onChange={e => setDraft({ ...draft, changeNote: e.target.value })} placeholder="어떤 의견을 어떻게 반영했는지 적어 주세요." /></label>}
        <fieldset className={styles.sharing}><legend>누가 볼 수 있나요?</legend><label><input type="radio" name="community-visibility" checked={draft.visibility === 'private'} onChange={() => setDraft({ ...draft, visibility: 'private' })} /><LockKeyhole size={16} /> 나만 보기</label><label><input type="radio" name="community-visibility" checked={draft.visibility === 'cohort'} onChange={() => setDraft({ ...draft, visibility: 'cohort' })} /><Users size={16} /> 같은 기수와 공유</label><p>공유를 선택한 버전만 동료에게 보여요. 외부에 공개되거나 홍보에 자동 사용되지 않아요.</p></fieldset>
        <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setEditing(null)}>닫기</button><button className={styles.primary} disabled={busy}>{busy ? '저장 중…' : draft.visibility === 'cohort' ? '기수에 공유하며 저장' : '나만 보도록 저장'}</button></div>
      </form>
    </div>}
    {!loading && state && <div className={`${styles.workspace} ${post ? styles.withDetail : ''}`}>
      <div className={styles.cards}>{filtered.length ? filtered.map(item => <button type="button" key={item.id} className={`${styles.postCard} ${selected === item.id ? styles.selected : ''}`} onClick={() => { setSelected(item.id); setCompare(false); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0); }}>
        <div className={styles.cardMeta}><span>{kindLabels[item.kind]}</span>{item.visibility === 'private' ? <LockKeyhole size={14} aria-label="나만 보기" /> : <Users size={14} aria-label="기수 공유" />}</div><h3>{item.title}</h3><p>{item.body}</p><div className={styles.cardBottom}><span>{item.alias} · v{item.revision}</span><span><MessageSquare size={13} />{state.comments.filter(c => c.post_id === item.id && !c.hidden).length}<ChevronRight size={15} /></span></div>
      </button>) : <div className={styles.empty}><FilePlus2 size={30} /><h3>{tab === 'mine' ? '첫 결과물을 남겨볼까요?' : tab === 'talent' ? '서로의 잘하는 일을 연결해요.' : tab === 'demo_day' ? '완벽한 완성보다, 공개할 수 있는 한 단계.' : '아직 공유된 작업물이 없어요.'}</h3><p>작은 초안과 구체적인 질문 하나면 충분해요.</p><button type="button" className={styles.secondary} onClick={() => compose()}>결과물 남기기</button></div>}</div>
      {post && <article className={styles.detail} ref={detailRef} aria-label="선택한 작업물">
        <div className={styles.sectionHeader}><span className={styles.pill}>{kindLabels[post.kind]} · v{post.revision}</span><button type="button" className={styles.iconButton} aria-label="작업물 닫기" onClick={() => setSelected(null)}><X size={20} /></button></div>
        <h3 className={styles.detailTitle}>{post.title}</h3><p className={styles.byline}>{post.alias} · {date(post.updated_at)} · {post.visibility === 'private' ? '나만 보기' : '기수 공유'}</p>
        <p className={styles.body}>{post.body}</p>
        <PortfolioFiles key={post.id} post={post} demo={demo} owner={post.owner_id===snapshot.viewer.id}/>
        {(post.kind.startsWith('talent_')||post.kind==='demo_day')&&<CommunityWorkflowPanel key={post.id} post={post} viewerId={snapshot.viewer.id} demo={demo}/>}
        <div className={styles.links}>{post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.external}>작업물 열기 <ArrowUpRight size={16} /></a>}{post.image_urls.map((url, i) => <a href={url} target="_blank" rel="noopener noreferrer" key={url} className={styles.external}>캡처 {i + 1} 보기 <ArrowUpRight size={16} /></a>)}{post.lesson_id && <button className={styles.textButton} type="button" onClick={() => onOpen?.(post.lesson_id!)} disabled={!onOpen}>연결된 수업 보기</button>}</div>
        <div className={styles.detailActions}>{post.owner_id === snapshot.viewer.id && <button type="button" className={styles.secondary} onClick={() => compose(post)} disabled={busy}>개선한 새 버전 저장</button>}<button type="button" className={styles.textButton} aria-expanded={compare} onClick={() => setCompare(!compare)}><History size={15} /> 버전 {revisions.length}개 비교</button></div>
        {compare && <div className={styles.versionSection}><h4>작업의 변화를 나란히</h4>{revisions.length < 2 ? <p className={styles.hint}>새 버전을 저장하면 수정 전후를 비교할 수 있어요.</p> : <VersionComparison revisions={revisions} />}<ol className={styles.timeline}>{revisions.map(v => <li key={v.id}><strong>v{v.revision}</strong><span>{v.change_note}</span><small>{date(v.created_at)} · {v.visibility === 'private' ? '나만 보기' : '기수 공유'}</small></li>)}</ol></div>}
        <div className={styles.commentHeading}><h4>함께 다듬기 <span>{messages.length}</span></h4><p>좋았던 점 하나와, 더 나아질 제안 하나를 남겨주세요.</p></div>
        {messages.map(comment => <Feedback key={`${comment.id}:${state.acknowledgments.find(a => a.comment_id === comment.id)?.revision ?? 0}`} comment={comment} post={post} state={state} viewerId={snapshot.viewer.id} busy={busy} send={values => send(command(values))} onReport={() => { setReport({ post, commentId: comment.id }); setReportReason(''); }} />)}
        {post.visibility === 'cohort' ? <CommentForm busy={busy} onSubmit={(body, alias) => send(command({ action: 'comment', postId: post.id, expectedRevision: post.revision, body, alias }))} /> : <p className={styles.privateNote}><LockKeyhole size={15} /> 나만 보는 기록입니다. 동료 의견을 받으려면 새 버전을 기수에 공유해 주세요.</p>}
        {demo && post.owner_id === snapshot.viewer.id && post.visibility === 'cohort' && !messages.some(c => c.author_id === demoPeerId) && <button type="button" className={styles.demoAction} disabled={busy} onClick={() => void send(command({ action: 'comment', postId: post.id, expectedRevision: post.revision, body: '대상이 겪는 구체적인 상황을 첫 문장에 추가하면 더 쉽게 이해할 수 있겠어요.', alias: '예시 동료 지우' }), demoPeerId)}>체험: 예시 동료 의견 추가</button>}
        {demo && post.owner_id === demoPeerId && messages.some(c => c.author_id === snapshot.viewer.id) && <button type="button" className={styles.demoAction} disabled={busy} onClick={() => { const co = messages.find(c => c.author_id === snapshot.viewer.id)!; const ack = state.acknowledgments.find(a => a.comment_id === co.id); void send(command({ action: 'acknowledge', postId: post.id, commentId: co.id, expectedRevision: ack?.revision ?? 0, useful: true, decision: 'pending', reason: '' }), demoPeerId); }}>체험: 예시 동료가 도움됨 확인</button>}
        {post.owner_id !== snapshot.viewer.id && <div className={styles.safety}><button type="button" onClick={() => { setReport({ post }); setReportReason(''); }}><Flag size={14} /> 신고하기</button><button type="button" disabled={busy} onClick={() => void send(command({ action: 'block', targetId: post.owner_id }))}>이 동료 차단</button></div>}
      </article>}
    </div>}
    {state?.pageInfo?.hasNext && <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void refresh(state.pageInfo!.page + 1)}>작업물 더 보기</button></div>}
    {report && <form className={styles.report} onSubmit={async e => { e.preventDefault(); if (await send(command({ action: 'report', postId: report.post.id, commentId: report.commentId, reason: reportReason }))) setReport(null); }}><div className={styles.sectionHeader}><h3>운영자에게 확인 요청</h3><button type="button" aria-label="신고 닫기" className={styles.iconButton} onClick={() => setReport(null)}><X size={18} /></button></div><label>확인이 필요한 이유<textarea required minLength={5} maxLength={1000} value={reportReason} onChange={e => setReportReason(e.target.value)} /></label><p className={styles.hint}>신고 내용은 운영자와 작성자 본인에게만 보입니다.</p><button className={styles.primary} disabled={busy}>신고 접수</button></form>}
    {rewards && <section className={styles.launch} aria-label="로켓 발사 조건"><div className={styles.rocketIcon}><Rocket size={30} /></div><div className={styles.launchCopy}><h3>{rewards.claimedAt ? '한 번의 도약이 기록되었어요.' : '결과물을 개선하면, 발사가 가까워져요.'}</h3><p>필수 과제 승인 · 다른 동료의 도움됨 · 받은 의견의 새 버전 반영</p>{rewards.badges.length > 0 && <div className={styles.badges}>{rewards.badges.map(b => <span key={b}><ShieldCheck size={14} />{b}</span>)}</div>}{rewards.reasons.length > 0 && <ul>{rewards.reasons.map(r => <li key={r}>{r}</li>)}</ul>}<small>타이머·접속 횟수는 성장 점수가 되지 않아요. 발사 기록은 당시 조건 충족 이력입니다.</small></div><button className={styles.primary} type="button" disabled={busy || !rewards.eligible || !!rewards.claimedAt} onClick={() => void send(command({ action: 'launch' }))}>{rewards.claimedAt ? '발사 기록 완료' : '나의 로켓 발사'}</button></section>}
    {!!state?.blockedIds.length && <details className={styles.blocked}><summary>차단 관리 · {state.blockedIds.length}명</summary>{state.blockedIds.map((id, i) => <button key={id} type="button" disabled={busy} onClick={() => void send(command({ action: 'unblock', targetId: id }))}>차단한 동료 {i + 1} 해제</button>)}</details>}
  </section>;
}
function CommentForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: string, alias: string) => Promise<boolean> }) {
  const [body, setBody] = useState(''), [alias, setAlias] = useState('문샷 동료');
  useCampusDraftGuard(!!body.trim(),busy&&!!body.trim());
  return <form className={styles.commentForm} onSubmit={async e => { e.preventDefault(); if (await onSubmit(body, alias)) setBody(''); }}><label>동료에게 남길 의견<textarea required minLength={10} maxLength={2000} rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="구체적으로 좋았던 점과 이유, 바로 시도할 수 있는 제안을 남겨주세요." /></label><label>의견에 표시할 별명<input required minLength={2} maxLength={24} value={alias} onChange={e => setAlias(e.target.value)} /></label><div><small>10자 이상 · 같은 내용을 반복할 수 없어요.</small><button className={styles.primary} disabled={busy}>의견 남기기</button></div></form>;
}
function Feedback({ comment, post, state, viewerId, busy, send, onReport }: { comment: CommunityComment; post: CommunityPost; state: CommunityState; viewerId: string; busy: boolean; send: (c: Partial<CommunityCommand>) => Promise<boolean>; onReport: () => void }) {
  const ack = state.acknowledgments.find(a => a.comment_id === comment.id);
  const [expanded, setExpanded] = useState(false), [useful, setUseful] = useState(ack?.useful ?? false), [decision, setDecision] = useState<'pending' | 'apply' | 'keep'>(ack?.decision ?? 'pending'), [reason, setReason] = useState(ack?.reason ?? ''), [revision, setRevision] = useState(ack?.applied_revision ?? post.revision);
  const eligibleRevisions = state.revisions.filter(r => r.post_id === post.id && r.revision > comment.post_revision);
  useCampusDraftGuard(expanded&&(useful!==(ack?.useful??false)||decision!==(ack?.decision??'pending')||reason!==(ack?.reason??'')||(decision==='apply'&&revision!==ack?.applied_revision)),busy&&expanded);
  return <div className={styles.comment}><div className={styles.commentMeta}><strong>{comment.alias}</strong><span>v{comment.post_revision}에 남긴 의견 · {date(comment.created_at)}</span></div><p className={styles.body}>{comment.body}</p>{ack && <div className={styles.ackSummary}>{ack.useful && <span><ThumbsUp size={13} /> 도움됨</span>}<span>{ack.decision === 'apply' ? `v${ack.applied_revision}에 반영했어요` : ack.decision === 'keep' ? '이유를 남기고 유지했어요' : '의견을 확인했어요'}</span>{ack.reason && <p>{ack.reason}</p>}</div>}
    {post.owner_id === viewerId && comment.author_id !== viewerId ? <><button type="button" className={styles.textButton} aria-expanded={expanded} onClick={() => { if (!expanded) setRevision(ack?.applied_revision ?? eligibleRevisions.at(-1)?.revision ?? post.revision); setExpanded(!expanded); }}><ThumbsUp size={15} /> {ack ? '확인 기록 수정' : '도움됨 · 반영 기록 남기기'}</button>{expanded && <form className={styles.ackForm} onSubmit={async e => { e.preventDefault(); if (await send({ action: 'acknowledge', postId: post.id, commentId: comment.id, expectedRevision: ack?.revision ?? 0, useful, decision, reason, appliedRevision: decision === 'apply' ? revision : undefined })) setExpanded(false); }}><label className={styles.check}><input type="checkbox" checked={useful} onChange={e => setUseful(e.target.checked)} /> 이 의견이 실제로 도움이 되었어요</label><label>반영 상태<select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="pending">검토 중</option><option value="apply" disabled={!eligibleRevisions.length}>새 버전에 반영</option><option value="keep">이유를 남기고 유지</option></select></label>{decision === 'apply' && <label>반영한 버전<select value={revision} onChange={e => setRevision(Number(e.target.value))}>{eligibleRevisions.map(r => <option value={r.revision} key={r.id}>v{r.revision} · {r.change_note}</option>)}</select></label>}{!eligibleRevisions.length && <p className={styles.hint}>반영했다면 먼저 위에서 개선한 새 버전을 저장해 주세요.</p>}<label>반영 내용 또는 유지한 이유<textarea minLength={decision === 'pending' ? 0 : 5} required={decision !== 'pending'} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} rows={2} /></label><button className={styles.secondary} disabled={busy}>확인 기록 저장</button></form>}</> : comment.author_id !== viewerId && <button className={styles.textButton} type="button" onClick={onReport}>이 의견 신고</button>}
  </div>;
}
function VersionComparison({ revisions }: { revisions: CommunityState['revisions'] }) {
  const [before, setBefore] = useState(revisions[0].revision), [after, setAfter] = useState(revisions.at(-1)!.revision);
  return <div className={styles.comparison}>{[['수정 전', before, setBefore], ['수정 후', after, setAfter]].map(([label, value, update]) => { const v = revisions.find(r => r.revision === value)!; return <div key={String(label)}><label>{String(label)}<select value={Number(value)} onChange={e => (update as (v: number) => void)(Number(e.target.value))}>{revisions.map(r => <option key={r.id} value={r.revision}>v{r.revision} · {date(r.created_at)}</option>)}</select></label><h5>{v.title}</h5><p>{v.body}</p>{v.url && <a href={v.url} target="_blank" rel="noopener noreferrer">당시 작업물 링크 <ArrowUpRight size={13} /></a>}</div>; })}</div>;
}
export { CommunityModerationPanel } from './moderation-panel';
