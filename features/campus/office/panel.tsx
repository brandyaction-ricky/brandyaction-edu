'use client';
import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, FileText, Link2, Radio, ShieldCheck } from 'lucide-react';
import type { CampusSnapshot } from '../contracts';
import { officeOutputs, officeStatusLabels, outputLabels, type OfficeCommand, type OfficeState, type OfficeOutput, type OfficeEvent } from './domain';
import { emptyOfficeDemo, mutateOfficeDemo, receiveOfficeDemo } from './demo';
import styles from './panel.module.css';
import { useCampusDraftGuard } from '../ui/draft-guard';
import { OfficeDispatchPanel } from './dispatch-panel';
export function OfficePanel({ snapshot, demo,active=true }: { snapshot: CampusSnapshot; demo: boolean;active?:boolean }) { return <OfficeSession key={`${snapshot.viewer.id}:${snapshot.selectedEnrollmentId}:${demo}`} snapshot={snapshot} demo={demo} active={active} />; }
export const Panel = OfficePanel;
function OfficeSession({ snapshot, demo,active=true }: { snapshot: CampusSnapshot; demo: boolean;active?:boolean }) {
  const enrollmentId = snapshot.selectedEnrollmentId;
  const [state, setState] = useState<OfficeState | null>(() => demo ? emptyOfficeDemo() : null), [objective, setObjective] = useState(''), [materials, setMaterials] = useState(''), [output, setOutput] = useState<OfficeOutput>('plan');
  const [selected, setSelected] = useState<string | null>(null), [note, setNote] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [showArchived, setShowArchived] = useState(false);
  const [dispatchLocked,setDispatchLocked]=useState(false);
  const [pending, setPending] = useState<OfficeCommand | null>(null);
  useCampusDraftGuard(!!objective.trim()||!!materials.trim()||output!=='plan'||(state?.jobs.find(j=>j.id===selected)?.status==='review'&&!!note.trim()),busy,'campus-office',active);
  const receipts = useRef(new Map<string, string>()), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!demo && enrollmentId) {
      const controller = new AbortController();
      fetch(`/api/campus/office?enrollmentId=${enrollmentId}`, { cache: 'no-store', signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (alive.current) setState(data); }).catch(e => { if (!controller.signal.aborted && alive.current) setError(e instanceof Error ? e.message : '작업함을 불러오지 못했습니다.'); });
      return () => { alive.current = false; controller.abort(); };
    }
    return () => { alive.current = false; };
  }, [demo, enrollmentId]);
  async function refresh() { if (demo || !enrollmentId) return; const r = await fetch(`/api/campus/office?enrollmentId=${enrollmentId}`, { cache: 'no-store' }); const data = await r.json(); if (!r.ok) throw new Error(data.error); if (alive.current) setState(data); }
  async function send(c: OfficeCommand) {
    if (busy) return false; setBusy(true); setError(''); setNotice(''); setPending(c);
    try {
      if (demo) setState(mutateOfficeDemo(state!, c, snapshot, receipts.current));
      else { const r = await fetch('/api/campus/office', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); const data = await r.json(); if (!r.ok) throw new Error(data.error); await refresh(); }
      setSelected(c.action === 'create' ? c.requestId : c.jobId!); setPending(null);setNote('');if(c.action==='create')setOutput('plan'); setNotice(c.action === 'create' ? '요청을 보관했어요. AI 직원 연결 전에는 외부로 전송하거나 실행하지 않습니다.' : '작업 기록을 저장했어요.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); return false; } finally { setBusy(false); }
  }
  const job = state?.jobs.find(j => j.id === selected);
  const command = (action: OfficeCommand['action']) => ({ requestId: crypto.randomUUID(), enrollmentId: enrollmentId!, action, jobId: job?.id, expectedRevision: job?.revision, note });
  function receive(event: OfficeEvent['event']) {
    if (!job || !state || !demo) return;
    try { setState(receiveOfficeDemo(state, { jobId: job.id, expectedRevision: job.revision, event, note: event === 'failed' ? '가상 연결 실패 · 실제 봇 호출 없음' : '로컬 예시 이벤트', draftText: event === 'draft' ? '예시 초안\n\n1. 고객이 얻는 변화를 한 문장으로 정리합니다.\n2. 첫 화면에 대상과 결과를 함께 배치합니다.\n3. 실제 고객 한 명에게 이해되는지 확인합니다.\n\n이 내용은 AI가 생성한 결과가 아닌 로컬 QA 예시입니다.' : undefined })); setNotice('예시 이벤트만 반영했어요. 실제 오피스 봇은 연결하지 않았습니다.'); } catch (e) { setError(e instanceof Error ? e.message : '예시 이벤트를 처리하지 못했습니다.'); }
  }
  if (!enrollmentId) return <section className={styles.root}><p>기수를 선택하면 개인 AI 오피스 작업함을 열 수 있어요.</p></section>;
  return <section className={styles.root} aria-labelledby="office-heading"><header className={styles.header}><div className={styles.icon}><Bot size={28} /></div><div><span className={styles.eyebrow}>문샷 · 나의 AI 사무실</span><h2 id="office-heading">부탁할 일을 정리하고,<br />완성의 판단은 내가 해요.</h2><p>나만 보는 작업 요청 · 초안 검토 · 승인 기록</p></div><span className={styles.connection}><Radio size={14} />{state?.connection === 'incoming_adapter_registered' ? '작업 소식 연결 준비됨' : 'AI 직원 연결 준비 중'}</span></header>
    <div className={styles.banner}><ShieldCheck size={18} /><p>{demo ? '가상 작업함입니다. 아래 예시 이벤트로 흐름만 체험할 수 있어요.' : state?.connection === 'incoming_adapter_registered' ? 'AI 직원의 작업 소식을 받을 준비가 됐어요. 요청을 적는 것만으로 일을 보내지는 않습니다.' : '지금은 요청을 안전하게 보관합니다. AI 직원이 연결되기 전에는 실행·완료로 표시하지 않아요.'}</p></div>
    {error && <div role="alert" className={styles.error}>{error}{pending && <button type="button" onClick={() => void send(pending)} disabled={busy}>같은 요청 다시 확인</button>}</div>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.layout}><form className={styles.form} onSubmit={async e => { e.preventDefault(); if (await send({ requestId: crypto.randomUUID(), enrollmentId, action: 'create', objective, materialUrls: materials.split('\n').filter(Boolean), outputType: output })) { setObjective(''); setMaterials(''); } }}><h3>새 작업 요청</h3><label>이루고 싶은 목표<textarea required minLength={10} maxLength={2000} rows={4} value={objective} onChange={e => setObjective(e.target.value)} placeholder="누구를 위한 작업인지, 어떤 결과를 원하고 무엇은 지켜야 하는지 적어 주세요." /></label><label>받고 싶은 결과물<select value={output} onChange={e => setOutput(e.target.value as OfficeOutput)}>{officeOutputs.map(o => <option key={o} value={o}>{outputLabels[o]}</option>)}</select></label><label>참고 자료 링크 <span>선택 · 최대 5개</span><textarea rows={2} value={materials} onChange={e => setMaterials(e.target.value)} placeholder="https://… 링크를 줄마다 하나씩" /></label><p className={styles.hint}>이 요청은 본인만 볼 수 있어요. 링크의 공개 범위는 원본 서비스에서 확인해 주세요.</p><button className={styles.primary} disabled={busy || !state}>요청 보관하기</button></form>
      <div className={styles.inbox}><div className={styles.listHeader}><h3>내 작업함 <span>{state?.jobs.filter(j => j.status !== 'archived').length ?? 0}</span></h3><button type="button" className={styles.textButton} aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>{showArchived ? '진행 작업 보기' : '보관함 보기'}</button>{!demo && <button className={styles.textButton} type="button" onClick={() => void refresh().catch(e => setError(e.message))} disabled={busy}>새로고침</button>}</div>
        {!state && !error && <p role="status">작업함을 불러오고 있어요…</p>}
        {state && !state.jobs.some(j => showArchived ? j.status === 'archived' : j.status !== 'archived') && <div className={styles.empty}><FileText size={28} /><h4>{showArchived ? '보관한 작업이 없어요.' : '첫 번째 부탁을 적어볼까요?'}</h4><p>목표와 참고 자료를 정리해 두면 연결 후 이어갈 수 있어요.</p></div>}
        <div className={styles.jobs}>{state?.jobs.filter(j => showArchived ? j.status === 'archived' : j.status !== 'archived').map(j => <button type="button" className={`${styles.job} ${selected === j.id ? styles.selected : ''}`} key={j.id} onClick={() => { setSelected(j.id); setNote(''); }}><span className={styles.status} data-status={j.status}>{officeStatusLabels[j.status]}</span><h4>{j.objective}</h4><small>{outputLabels[j.output_type]} · v{j.revision}</small></button>)}</div>
      </div></div>
    {job && <article className={styles.detail} aria-label="선택한 AI 직원 작업"><div className={styles.listHeader}><h3>{outputLabels[job.output_type]}</h3><span className={styles.status} data-status={job.status}>{officeStatusLabels[job.status]}</span></div><p className={styles.body}>{job.objective}</p><div className={styles.links}>{job.material_urls.map((u, i) => <a href={u} key={u} target="_blank" rel="noopener noreferrer"><Link2 size={13} />참고 자료 {i + 1}</a>)}</div>
      {job.status === 'awaiting_connection' && <p className={styles.waiting}>아직 봇에 전달되지 않았어요. 실제 접수 이벤트가 와야 ‘요청 접수’로 바뀝니다.</p>}
      {job.draft_text && <section className={styles.draft}><h4>{job.status === 'approved' ? '내가 승인한 결과' : '검토할 초안'}</h4><p className={styles.body}>{job.draft_text}</p>{job.draft_url && <a href={job.draft_url} target="_blank" rel="noopener noreferrer">결과물 링크 열기</a>}</section>}
      <OfficeDispatchPanel job={job} demo={demo} onChanged={refresh} onLockChange={setDispatchLocked}/>{job.error_note && <p role="alert" className={styles.error}>{job.error_note}</p>}
      {job.status === 'review' && <div className={styles.review}><label>검토 메모<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} minLength={5} maxLength={2000} placeholder="확인한 내용이나 구체적인 수정 요청을 5자 이상 적어 주세요." /></label><div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy || note.trim().length < 5} onClick={() => void send(command('request_revision'))}>수정 요청</button><button className={styles.primary} type="button" disabled={busy || note.trim().length < 5} onClick={() => void send(command('approve'))}><CheckCircle2 size={16} />검토 후 승인</button></div><p className={styles.hint}>승인은 오피스 안의 결과 확인입니다. 사이트 게시나 고객 발송을 실행하지 않아요.</p></div>}
      {job.review_note && <p className={styles.memo}>내 검토 기록: {job.review_note}</p>}
      <div className={styles.actions}>{job.status === 'failed' && <button className={styles.secondary} type="button" disabled={busy||dispatchLocked} onClick={() => void send(command('retry'))}>다시 연결 대기로</button>}{!['queued','running','archived'].includes(job.status) && <button className={styles.textButton} type="button" disabled={busy||dispatchLocked} onClick={() => void send(command('archive'))}>이 작업 보관</button>}</div>
      {demo && <details className={styles.demoControls}><summary>로컬 검수용 예시 이벤트</summary><p>실제 봇이나 Telegram에 연결하지 않고 상태 전이만 확인합니다.</p><div className={styles.actions}>{(['accepted','started','draft','failed'] as const).map(event => <button type="button" className={styles.secondary} key={event} disabled={event === 'accepted' ? !['awaiting_connection','revision_requested'].includes(job.status) : event === 'started' ? job.status !== 'queued' : event === 'draft' ? job.status !== 'running' : !['queued','running'].includes(job.status)} onClick={() => receive(event)}>{({accepted:'예시 접수',started:'예시 실행 시작',draft:'예시 초안 도착',failed:'예시 실행 오류'})[event]}</button>)}</div></details>}
      <details className={styles.history}><summary>요청·검토 이력</summary><ol>{state?.history.filter(h => h.job_id === job.id).map(h => <li key={h.id}><strong>v{h.revision} · {officeStatusLabels[h.status]}</strong><span>{h.actor_type === 'learner' ? '내 요청' : demo ? '연습용 작업 소식' : '연결된 AI 직원이 보낸 소식'} · {h.note}</span>{h.draft_text && <details><summary>당시 초안</summary><p className={styles.body}>{h.draft_text}</p></details>}</li>)}</ol></details>
    </article>}
  </section>;
}
