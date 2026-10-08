'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartNoAxesCombined, RefreshCw, Users, Download, X } from 'lucide-react';
import { careLabels, careSymbols, careTime, careLessonLabel, careProgress, canCareContact, recentlyContacted, careAggregate, nextCareCell, type CareCell, type CareSnapshot, type PersonalCare } from '@/lib/learning-care';
import './learning-care.css';
import { MemberConversation } from './member-conversation';
import { AdminDrawer } from '@/features/admin-ui';
import { CareOverview } from './learning-care-overview';

function useCare<T>(url: string) {
  const [snapshot, setSnapshot] = useState<{ key: string; data: T } | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const key = url + ':' + revision;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as T; })
      .then(data => { if (!controller.signal.aborted) { setSnapshot({ key, data }); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || '다시 불러와 주세요.'); });
    return () => controller.abort();
  }, [url, key]);
  return { data: snapshot?.key === key ? snapshot.data : null, error, reload: () => { setError(''); setRevision(n => n + 1); } };
}
function StatePill({ cell }: { cell: CareCell }) { return <span className={'care-state care-' + cell.state}>{careSymbols[cell.state]} {careLabels[cell.state]}</span>; }
function Meter({ cells, track, label }: { cells: CareCell[]; track: string; label: string }) {
  const p = careProgress(cells, track);
  return <div className="care-meter"><span>{label} <b>{p.done} / {p.total}</b></span><progress value={p.done} max={p.total || 1} aria-label={label}/><small>{p.percent === null ? (p.total ? '설정 확인' : '공개 전') : p.percent + '%'}</small></div>;
}
function exportSummary(title: string, aggregate: ReturnType<typeof careAggregate>, asOf: string) {
  // Drawing known text on canvas avoids HTML injection and private DOM capture.
  const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 900;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.fillStyle = '#102c2a'; ctx.fillRect(0, 0, 1440, 900);
  const line = (text: string, x: number, y: number, size: number, color = '#fff') => { ctx.fillStyle = color; ctx.font = `600 ${size}px sans-serif`; ctx.fillText(text, x, y, 1280); };
  line('BRANDYACTION EDU · 함께 쌓는 실행', 80, 100, 26, '#a8dfc4');
  line(title, 80, 190, 44); line('배움이 실행으로 이어지고 있습니다.', 80, 270, 48);
  [['함께하는 수강생', aggregate.members + '명'], ['학습 완료', aggregate.learning + '건'], ['미션 완료', aggregate.missions + '건']].forEach(([label, count], i) => { line(label, 80 + i * 440, 440, 27, '#a8dfc4'); line(count, 80 + i * 440, 530, 64); });
  line(`최근 7일 동안 ${aggregate.recent}개의 학습·미션을 완료했습니다.`, 80, 690, 34);
  line(`${careTime(asOf)} 기준 · 현재 공개된 학습·미션의 완료 기록 · 개인별 순위 없음`, 80, 800, 22, '#a8dfc4');
  canvas.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'brandy-edu-learning-summary.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }, 'image/png');
}
function ShareSummary({ data }: { data: CareSnapshot }) {
  const a = careAggregate(data.rows, data.asOf), cohort = data.cohorts.find(c => c.id === data.cohortId), title = `${cohort?.courseTitle || '클래스'} · ${cohort?.name || ''}`;
  if (data.rows.some(r => r.cells.some(c => c.state === 'error'))) return <p role="alert" className="care-error">학습 설정을 확인해야 하는 항목이 있습니다. 미션 설정을 확인한 뒤 공유해 주세요.</p>;
  return <><section className="care-share" aria-label="개인정보 없는 공유용 요약"><span className="care-eyebrow">BRANDYACTION EDU · 함께 쌓는 실행</span><h2>배움이 실행으로<br/>이어지고 있습니다.</h2><p>{title}</p><div className="care-share-stats"><div><strong>{a.members}<small>명</small></strong><span>함께하는 수강생</span></div><div><strong>{a.learning}<small>건</small></strong><span>학습 완료</span></div><div><strong>{a.missions}<small>건</small></strong><span>미션 완료</span></div></div><div className="care-share-growth">최근 7일, <b>{a.recent}개의 새로운 완료</b>가 쌓였습니다.</div><small>{careTime(data.asOf)} 기준 · 현재 공개된 학습·미션의 완료 기록</small></section><p className="care-note">공유 이미지에는 이름·이메일·개인별 진도가 들어가지 않습니다. 전체 기수 기준이며 검색 필터는 적용하지 않습니다.</p><button className="btn" onClick={() => exportSummary(title, a, data.asOf)}><Download/> 공유 이미지 저장</button></>;
}

export function AdminLearningCare({ messagesEnabled = process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' }: { messagesEnabled?: boolean } = {}) {
  const [cohort, setCohort] = useState('');
  const { data, error, reload } = useCare<CareSnapshot>('/api/admin/learning-care' + (cohort ? '?cohort=' + cohort : ''));
  const [tab, setTab] = useState('overview'), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [lessonId, setLessonId] = useState(''), [selected, setSelected] = useState<string[]>([]), [detailId, setDetailId] = useState(''), [compose, setCompose] = useState(false), [content, setContent] = useState(''), [sending, setSending] = useState(false), [notice, setNotice] = useState('');
  const [composerTarget, setComposerTarget] = useState<{ cohortId: string; lessonId: string; recipients: string[]; names: string[] } | null>(null);
  const [retry, setRetry] = useState<{ requestId: string; cohortId: string; lessonId: string; recipients: string[]; content: string } | null>(null);
  const sendGate = useRef(false);
  const lessons = data?.rows[0]?.cells || [];
  const chosenLesson = lessons.find(c => c.lessonId === lessonId) || lessons.find(c => c.track === 'daily') || lessons[0];
  const currentLesson = chosenLesson?.lessonId || '';
  const detail = data?.rows.find(r => r.enrollmentId === detailId);
  const filtered = (data?.rows || []).filter(r => {
    if (!`${r.name || ''} ${r.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === 'recent') return recentlyContacted(r, data!.asOf);
    if (filter === 'quiet') return !!r.lastVisitAt && Date.parse(r.lastVisitAt) < Date.parse(data!.asOf) - 3 * 86400000;
    const cells = tab === 'days' ? r.cells.filter(c => c.lessonId === currentLesson) : r.cells;
    if (filter === 'completed' && tab === 'students') { const progress = careProgress(cells); return progress.total > 0 && progress.done === progress.total; }
    return filter === 'all' || cells.some(c => c.state === filter);
  });
  const aggregate = data ? careAggregate(data.rows, data.asOf) : null;
  function resetSelection() { setSelected([]); setDetailId(''); setNotice(''); }
  async function send() {
    if (!data || sendGate.current || !composerTarget) return;
    sendGate.current = true;
    const { cohortId, lessonId, recipients } = composerTarget;
    const payload = retry || { requestId: crypto.randomUUID(), cohortId, lessonId, recipients, content: content.trim() };
    setRetry(payload); setSending(true); setNotice('');
    try {
      const response = await fetch('/api/admin/learning-care', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { if (response.status < 500 && response.status !== 429) setRetry(null); throw new Error(result.error || '발송 결과를 확인하지 못했습니다.'); }
      setRetry(null); setCompose(false); setSelected([]); reload(); setNotice(`${result.count}명에게 학습 안내를 보냈습니다. 메시지함에서 발송 내역을 확인할 수 있습니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '발송 결과를 다시 확인해 주세요.'); } finally { sendGate.current = false; setSending(false); }
  }
  function prepare() { if (!data?.cohortId) return; setComposerTarget({ cohortId: data.cohortId, lessonId: currentLesson, recipients: [...selected], names: data.rows.filter(r => selected.includes(r.memberId)).map(r => r.name || '이름 미등록') }); setContent(`[학습 안내] ${chosenLesson?.title || ''}\n\n지금 할 수 있는 한 단계부터 함께 이어가요. 마이페이지의 ‘지금 할 일’에서 이어갈 수 있어요. 막히는 부분은 질문·답변에 남겨 주세요.\nhttps://brandyaction-edu.com/my`); setCompose(true); }
  return <div className="learning-care">
    <fieldset className="care-workspace" disabled={compose}>
    <header className="care-header"><div><span className="care-eyebrow">수강생 관리</span><h1>수강생 현황</h1><p>한 사람의 다음 걸음까지, 함께 확인합니다.</p></div><div className="care-header-actions">{data && <div className="care-controls"><label>기수<select value={data.cohortId || ''} onChange={e => { setCohort(e.target.value); setLessonId(''); resetSelection(); }}>{data.cohorts.map(c => <option value={c.id} key={c.id}>{c.courseTitle} · {c.name}</option>)}</select></label><small>{careTime(data.asOf)} 기준 · 한국 시간</small></div>}<button className="btn" onClick={() => { resetSelection(); reload(); }}><RefreshCw/> 새로고침</button></div></header>
    {error && <div role="alert" className="care-error">{error} <button className="btn" onClick={reload}>다시 불러오기</button></div>}
    {!data ? !error && <p role="status">수강생 현황을 불러오는 중입니다.</p> : <>
      
      <div className="care-tabs" role="tablist" aria-label="현황 보기">{[['overview', '한눈에 보기'], ['students', '수강생별'], ['days', '일차별'], ['share', '공유용 요약']].map(([value, label]) => <button role="tab" aria-selected={tab === value} key={value} onClick={() => { setTab(value); setFilter('all'); resetSelection(); }}>{label}</button>)}</div>
      {tab === 'share' ? <ShareSummary data={data}/> : <>
        {tab !== 'overview' && <div className="care-stats"><div><Users/><span>수강생</span><b>{aggregate!.members}<small>명</small></b></div><div><ChartNoAxesCombined/><span>공개된 학습·미션 진행률</span><b>{aggregate!.percent === null ? '—' : aggregate!.percent + '%'}</b><small>{aggregate!.completed} / {aggregate!.available}건</small></div><div><span>운영자 검토 대기</span><b>{aggregate!.pending}<small>건</small></b><Link href="/admin/reviews?tab=blocks">검토하러 가기 →</Link></div><div><span>최근 7일 완료한 학습·미션</span><b>+{aggregate!.recent}<small>건</small></b></div></div>}
        {tab === 'overview' ? <CareOverview key={data.cohortId} rows={data.rows} asOf={data.asOf} onStudent={setDetailId} onDay={(id, value) => { setTab('days'); setLessonId(id); setFilter(value); setSearch(''); resetSelection(); }}/> : <>
        <div className="care-controls"><label>수강생 찾기<input value={search} placeholder="이름 또는 이메일" onChange={e => { setSearch(e.target.value); setSelected([]); }}/></label>{tab === 'days' && <label>확인할 일차<select value={currentLesson} onChange={e => { setLessonId(e.target.value); resetSelection(); }}>{lessons.map(c => <option key={c.lessonId} value={c.lessonId}>{careLessonLabel(c)} · {c.title}</option>)}</select></label>}</div>
        <div className="care-filters" aria-label="빠른 필터">{[['all', '전체'], ['completed', '완료'], ['not_submitted', '미제출'], ['submitted', '검토 대기'], ['changes_requested', '보완 요청'], ['locked', '앞 단계 대기'], ['scheduled', '공개 예정'], ['quiet', '3일 이상 방문 기록 없음'], ['recent', '24시간 내 안내']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelected([]); }}>{label}</button>)}</div>
        <div className="care-list-caption"><b>{filtered.length}개 수강 기록</b>{tab === 'days' && <button className="btn" onClick={() => setSelected([...new Set(filtered.filter(r => canCareContact(r, currentLesson, data.asOf)).map(r => r.memberId))].slice(0, 100))}>안내할 수강생 선택 · 최대 100명</button>}{tab === 'days' && <button className="btn primary" disabled={!selected.length || !messagesEnabled} onClick={prepare}>선택한 {selected.length}명 안내 내용 작성</button>}</div>
        <div className="care-legend" aria-label="진행 상태 색상 안내">{(['completed', 'submitted', 'changes_requested', 'not_submitted', 'locked', 'scheduled'] as const).map(state => <span key={state}><i className={'care-' + state}>{careSymbols[state]}</i>{careLabels[state]}</span>)}</div>
        <div className="care-table-scroll"><table className="care-table"><thead><tr><th>수강생</th>{tab === 'days' ? <><th>미션·학습 상태</th><th>마지막 안내</th><th>안내 선택</th></> : <><th>학습 / 미션</th><th>일차별 진행</th><th>최근 방문 · 안내</th></>}</tr></thead><tbody>{filtered.map(row => { const cell = row.cells.find(c => c.lessonId === currentLesson); return <tr key={row.enrollmentId}><th><button className="care-name" onClick={() => setDetailId(row.enrollmentId)}>{row.name || '이름 미등록'} <ArrowRight/></button><small>{row.email || '이메일 미등록'}</small>{row.openQuestions > 0 && <span className="care-question">미답변 {row.openQuestions}건</span>}</th>{tab === 'days' ? <><td>{cell ? <StatePill cell={cell}/> : '대상 아님'}</td><td>{careTime(row.lastContactAt)}</td><td><label><input type="checkbox" aria-label={`${row.name || '회원'} 안내 선택`} checked={selected.includes(row.memberId)} disabled={!canCareContact(row, currentLesson, data.asOf) || (!selected.includes(row.memberId) && selected.length >= 100)} onChange={e => setSelected(ids => e.target.checked ? [...new Set([...ids, row.memberId])] : ids.filter(id => id !== row.memberId))}/> {recentlyContacted(row, data.asOf) ? '최근 안내' : canCareContact(row, currentLesson, data.asOf) ? '선택' : '안내 제외'}</label></td></> : <><td><Meter cells={row.cells} track="learning" label="학습"/><Meter cells={row.cells} track="daily" label="미션"/></td><td><div className="care-grid">{row.cells.map(c => <button className={'care-cell care-' + c.state} key={c.lessonId} title={`${careLessonLabel(c)} ${c.title}: ${careLabels[c.state]}`} aria-label={`${row.name} ${careLessonLabel(c)} ${careLabels[c.state]}`} onClick={() => setDetailId(row.enrollmentId)}>{careSymbols[c.state]}<small>{c.day}</small></button>)}</div></td><td><span>방문 {careTime(row.lastVisitAt)}</span><small>안내 {careTime(row.lastContactAt)}</small></td></>}</tr>; })}</tbody></table></div>
        {!filtered.length && <div className="care-empty">조건에 맞는 수강 기록이 없습니다.</div>}
        <p className="care-note">진행률은 이 기수에 공개된 학습·미션 기준입니다. 미제출은 제출 기록이 없다는 뜻이며 실제 미실행을 단정하지 않습니다. 방문 기록 없음은 미접속과 다를 수 있습니다. 수강권이 만료·회수된 회원과 운영자는 제외됩니다.</p></>}
      </>}
    </>}
    </fieldset>
    {notice && !compose && <p role="status" aria-label="안내 발송 결과" className="care-notice">{notice}</p>}
    {detail && <AdminDrawer title="수강생 상세" size="large" onClose={() => setDetailId('')}><section className="care-detail" aria-label="수강생 상세"><header><div><span className="care-eyebrow">한 사람의 학습 여정</span><h2>{detail.name || '회원'}님의 현재 위치</h2></div><button className="btn" aria-label="상세 닫기" onClick={() => setDetailId('')}><X/></button></header><p>최근 방문 {careTime(detail.lastVisitAt)} · 마지막 안내 {careTime(detail.lastContactAt)}</p><div className="care-detail-list">{detail.cells.map(c => <article key={c.lessonId}><div><small>{careLessonLabel(c)}</small><b>{c.title}</b><small>{c.reason}</small></div><StatePill cell={c}/><small>{c.state === 'completed' ? careTime(c.completedAt) : c.submittedAt ? '제출 ' + careTime(c.submittedAt) : ''}</small></article>)}</div><div className="care-controls"><Link className="btn" href={'/admin/reviews?tab=blocks&member=' + detail.memberId}>제출물 검토</Link><Link className="btn" href={'/admin/customers?member=' + detail.memberId}>회원 운영 정보</Link><Link className="btn" href="/my/messages">메시지함</Link></div><details><summary>이 회원과 나눈 질문·메시지 이력</summary><MemberConversation key={detail.memberId} member={detail.memberId}/></details></section></AdminDrawer>}
    {compose && data && <AdminDrawer title="학습 안내 확인" onClose={() => { if (!sending && !retry) setCompose(false); }}><section className="care-compose" aria-label="학습 안내 확인"><h2>{composerTarget?.recipients.length}명에게 학습 안내</h2>{notice && <p role="alert">{notice}</p>}<p>받는 사람: {composerTarget?.names.join(', ')}</p><label htmlFor="care-message-content">안내 내용</label><textarea id="care-message-content" rows={6} maxLength={5000} value={content} disabled={sending || !!retry} onChange={e => setContent(e.target.value)}/><p className="care-note">완료·검토 대기·공개 전·24시간 내 안내한 회원은 제외합니다. 발송 직전 다시 확인하며, 조건이 바뀌면 전체 발송을 멈춥니다. 메시지함에 저장되며 푸시는 수신 설정에 따라 달라질 수 있습니다.</p><div className="care-controls"><button className="btn primary" disabled={sending || !content.trim()} onClick={() => void send()}>{sending ? '결과 확인 중…' : retry ? '발송 결과 다시 확인' : '확인한 대상에게 보내기'}</button><button className="btn" disabled={sending || !!retry} onClick={() => setCompose(false)}>취소</button><Link href="/my/messages">보낸 메시지 보기</Link></div></section></AdminDrawer>}
  </div>;
}

export function MemberLearningCare() {
  const { data, error, reload } = useCare<PersonalCare>('/api/member/learning-care');
  if (error) return <div className="care-next-error"><span>{error}</span><button className="btn small" onClick={reload}>다시 확인</button></div>;
  if (!data || !data.rows.length) return null;
  return <section className="care-personal" aria-label="지금 할 일"><span className="care-eyebrow">나의 학습</span><h2>지금 할 일</h2>{data.rows.map(row => { const next = nextCareCell(row.cells), done = row.cells.filter(c => c.state === 'completed'), recent = done.filter(c => c.completedAt && Date.parse(c.completedAt) >= Date.parse(data.asOf) - 7 * 86400000).length; return <article key={row.enrollmentId}><div><small>{row.courseTitle} · {row.cohortName}</small><h3>{next ? next.state === 'submitted' ? '제출했어요. 운영자 검토를 기다려 주세요.' : next.state === 'changes_requested' ? '피드백을 확인하고 한 번 더 보완해 보세요.' : next.title : row.cells.some(c => c.state === 'error') ? '학습 설정을 확인하고 있습니다.' : row.cells.length && done.length === row.cells.length ? '공개된 학습을 모두 완료했어요!' : '다음 학습 공개를 기다려 주세요.'}</h3>{next && <p>{careLessonLabel(next)} · {next.title}</p>}<div className="care-growth">최근 7일 <b>+{recent}개 완료</b><span>현재 공개된 {row.cells.length}개 중 {done.length}개 완료</span></div></div><div className="care-next-actions"><Link className="btn primary" href={'/learn/' + row.enrollmentId + (next ? '/' + next.lessonId : '')}>{next?.state === 'submitted' ? '제출 내용 보기' : next?.state === 'changes_requested' ? '피드백 확인하기' : '학습 이어가기'} <ArrowRight/></Link><Link className="btn" href="/my/questions">막혔나요? 질문하기</Link></div></article>; })}<p className="care-note">나의 완료 기록을 보여 드려요. 다른 수강생과의 순위 비교는 하지 않습니다.</p></section>;
}
