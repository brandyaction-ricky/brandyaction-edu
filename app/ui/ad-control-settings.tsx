"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { freezeReasonLabel, adThresholds, defaultAdThresholds, missingControl, type AdControl, type AdEvidence, type AdPolicy } from '@/lib/edu-ad-controls';
import type { Row } from '@/lib/platform';

type History = { cohort_id: string; revision: number; occurred_at: string; policy: AdPolicy };
type Loaded = { enabled: boolean; canManage: boolean; policies: AdPolicy[]; evidence: (AdEvidence & { control: AdControl })[]; history: History[]; checkedAt?: string };
type Draft = { budget_krw: string; ads_start: string; ads_end: string; sales_end: string; mode: AdPolicy['mode']; reason: string; hours: number | null; cpr_limit_krw: number; roas_floor: number; refund_request_limit: number; enabled: boolean };
const emptyDraft: Draft = { budget_krw: '', ads_start: '', ads_end: '', sales_end: '', mode: 'auto', reason: '', hours: 72, enabled: true, ...defaultAdThresholds };
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export function AdControlSettings({ cohorts }: { cohorts: Row[] }) {
  const [selected, setSelected] = useState(''), [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edited, setEdited] = useState<{ cohort: string; revision: number; draft: Draft } | null>(null), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true), saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/ad-controls', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      setLoaded(data); setMessage('');
    }).catch(e => { if (e.name !== 'AbortError') { setLoaded(null); setMessage(e.message || '상태를 확인하지 못했습니다.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const policy = loaded?.policies.find(p => p.cohort_id === selected);
  const evidence = loaded?.evidence.find(e => e.cohort_id === selected);
  const control = loading || !loaded ? missingControl() : evidence?.control || missingControl();
  const enabled = !!loaded?.enabled, editable = enabled && !!loaded?.canManage && !loading;
  const draft = edited?.cohort === selected && edited.revision === (policy?.revision || 0) ? edited.draft :
    policy ? { ...emptyDraft, budget_krw: String(policy.budget_krw), ads_start: policy.ads_start,
      ads_end: policy.ads_end, sales_end: policy.sales_end, enabled: policy.enabled, mode: policy.mode, ...adThresholds(policy),
      hours: policy.mode === 'freeze' && policy.override_until === null ? null : 72 } : { ...emptyDraft };
  const setDraft = (value: Draft) => setEdited({ cohort: selected, revision: policy?.revision || 0, draft: value });
  const reload = () => { setLoading(true); setRefresh(n => n + 1); };
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editable || !selected || saving.current) return;
    saving.current = true; setPending(true); setMessage('');
    try {
      const response = await fetch('/api/admin/ad-controls', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, budget_krw: Number(draft.budget_krw), cohort_id: selected, revision: policy?.revision || 0 }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { saving.current = false; setPending(false); }
  }
  const field = (key: 'budget_krw' | 'ads_start' | 'ads_end' | 'sales_end', label: string, type: string) =>
    <label className="field"><span>{label}</span><input type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 1_000_000_000 : undefined}
      required value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>;
  return <section className="panel pad mt24" aria-labelledby="ad-controls-heading">
    <div className="row" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div><h2 id="ad-controls-heading">광고비 증액 관리</h2><p className="muted">팁스에 “지금 광고비를 더 써도 되는지” 알려 줍니다.</p></div>
      <button className="btn" type="button" disabled={loading || pending} onClick={reload}><RefreshCw size={16} aria-hidden /> 새로 확인</button>
    </div>
    {!enabled && !loading && loaded && <p className="notice mt16">아직 연결을 켜지 않았어요. DEV 검수·승인 후 사용할 수 있습니다.</p>}
    <label className="field mt24"><span>관리할 기수</span><select value={selected} disabled={pending} onChange={e => setSelected(e.target.value)}>
      <option value="">기수를 선택해 주세요</option>{cohorts.map(c => <option key={String(c.id)} value={String(c.id)}>{String(c.name || c.cohort_code || '기수')}</option>)}
    </select></label>
    {selected && <>
      <div className="notice mt16" role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {control.freeze ? <ShieldAlert size={24} aria-hidden /> : <ShieldCheck size={24} aria-hidden />}
        <div><strong>{loading ? '현재 상태 확인 중…' : !enabled && loaded ? '아직 판단을 시작하지 않았어요' : control.freeze ? '광고비를 더 늘리지 않아요' : control.freeze_source === 'manual' ? '광고비 증액 제한을 풀었어요' : '광고비 증액을 검토할 수 있어요'}</strong>
          {!loading && enabled && <div className="small mt8">{control.freeze_source === 'manual' && !control.freeze && <p>대표가 기한까지 제한을 풀었어요. 자동 기준은 아래와 같습니다.</p>}{control.freeze_reasons.map(r => <p key={r}>{freezeReasonLabel(r, evidence?.policy)}</p>)}
            {control.freeze_source === 'manual' && <><p>대표 설정 · {control.override_until ? `${time(control.override_until)}까지` : '직접 해제할 때까지'}</p><p>{evidence?.policy.reason}</p></>}
            {control.cohort_budget_krw !== null && <p>기수 예산 {control.cohort_budget_krw.toLocaleString('ko-KR')}원</p>}
            {loaded?.checkedAt && <p className="muted">확인 시각 {time(loaded.checkedAt)}</p>}</div>}
        </div>
      </div>
      <p className="muted small mt16">광고는 계속 운영됩니다. 실제 예산 변경은 팁스에서 별도로 승인합니다. 메타 캠페인 지출 한도도 별도로 설정해 주세요.</p>
      {enabled && !loaded?.canManage && <p className="muted">상태는 볼 수 있어요. 설정 변경은 대표 승인 계정만 할 수 있습니다.</p>}
      <details className="mt24"><summary>예산·판단 방식 설정</summary>
        <form onSubmit={save} className="mt16"><fieldset disabled={!editable || pending} style={{ padding: 0, margin: 0, border: 0, minWidth: 0 }}>
          <div className="form-grid">{field('budget_krw', '기수 전체 광고 예산 (원)', 'number')}{field('ads_start', '광고 시작일', 'date')}
            {field('ads_end', '광고 종료일', 'date')}{field('sales_end', '판매 마감일', 'date')}</div>
          <div className="field mt16"><label htmlFor="ad-control-mode">판단 방식</label><select id="ad-control-mode" value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as Draft['mode'], hours: e.target.value === 'freeze' ? null : 72 })}>
            <option value="auto">자동 판단으로 돌아가기</option><option value="freeze">직접 증액 막기</option><option value="release">잠시 증액 제한 풀기</option>
          </select></div>
          {draft.mode === 'freeze' && <label className="checkline mt16"><input type="checkbox" checked={draft.hours === null} onChange={e => setDraft({ ...draft, hours: e.target.checked ? null : 72 })} /> 직접 해제할 때까지 증액 막기</label>}
          {draft.mode !== 'auto' && draft.hours !== null && <><label className="field mt16"><span>유지 시간 (최대 72시간)</span><input type="number" min={1} max={72} required value={draft.hours} onChange={e => setDraft({ ...draft, hours: Number(e.target.value) })} /></label>
            <p className="muted small">기한이 지나면 자동 판단으로 돌아갑니다. 값이 없으면 다시 증액을 막습니다.</p></>}
          <details className="mt16"><summary>자동 동결 기준 변경</summary><div className="form-grid mt16">
            <label className="field"><span>카톡방 입장 비용 기준 (원)</span><input type="number" required min={1} max={1000000} value={draft.cpr_limit_krw} onChange={e => setDraft({ ...draft, cpr_limit_krw: Number(e.target.value) })} /></label>
            <label className="field"><span>기수 전체 ROAS 기준 (배)</span><input type="number" required min={0.1} max={100} step="any" value={draft.roas_floor} onChange={e => setDraft({ ...draft, roas_floor: Number(e.target.value) })} /></label>
            <label className="field"><span>하루 환불 요청 기준 (건)</span><input type="number" required min={1} max={10000} value={draft.refund_request_limit} onChange={e => setDraft({ ...draft, refund_request_limit: Number(e.target.value) })} /></label>
          </div><p className="muted small">기준을 바꾸면 변경 사유와 함께 기록됩니다. 지난 날짜의 판단에는 당시 기준이 적용됩니다.</p></details>
          <label className="field mt16"><span>변경 사유</span><textarea required minLength={3} maxLength={500} rows={3} value={draft.reason}
            placeholder="확인한 내용과 변경 이유를 남겨 주세요. 고객 개인정보는 적지 마세요." onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>
          <label className="checkline mt16"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> 이 기수를 팁스 판단 대상으로 사용</label>
          <p className="muted small">여러 기수를 동시에 선택하면 기수를 확정할 수 없어 증액을 막습니다.</p>
          <button className="btn primary mt16" type="submit">{pending ? '저장 중…' : '설정 저장'}</button>
        </fieldset></form>
      </details>
      <details className="mt24"><summary>판단 기준·입력값 보기</summary><div className="small muted mt16">
        <p>판매 마감 전: 카톡방 입장 비용이 이틀 연속 {adThresholds(policy).cpr_limit_krw.toLocaleString('ko-KR')}원을 넘으면 증액을 막습니다.</p>
        <p>판매 마감 후: 환불 예상액을 뺀 기수 전체 ROAS가 {adThresholds(policy).roas_floor}배 미만이거나 환불 요청이 하루 {adThresholds(policy).refund_request_limit}건 이상이면 증액을 막습니다.</p>
        <p>어느 유입으로 구매했든 기수 전체 매출을 봅니다. 내부·시험 주문은 제외합니다.</p>
        <p>환불 예상액의 근거가 아직 없으면 ROAS를 확정하지 않고 증액을 막습니다.</p>
        {evidence && <><p>입장 비용: 최근일 {evidence.cpr_today === null ? '미확인' : `${Math.round(evidence.cpr_today).toLocaleString()}원`} · 전날 {evidence.cpr_previous === null ? '미확인' : `${Math.round(evidence.cpr_previous).toLocaleString()}원`}</p>
          <p>환불 요청: {evidence.refund_requests ?? '미확인'}건 · 환불 예상액: {evidence.reserve_krw === null ? '미확인' : `${evidence.reserve_krw.toLocaleString()}원`}</p></>}
      </div></details>
      <details className="mt24"><summary>변경 기록</summary><div className="small mt16">
        {(loaded?.history || []).filter(h => h.cohort_id === selected).map(h => <div key={h.revision} className="notice mt8">
          <strong>{time(h.occurred_at)} · {h.policy.mode === 'auto' ? '자동 판단' : h.policy.mode === 'freeze' ? '직접 동결' : '임시 해제'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{h.policy.reason}</p>{h.policy.override_until ? <p className="muted">기한 {time(h.policy.override_until)}</p> : h.policy.mode === 'freeze' && <p className="muted">직접 해제할 때까지</p>}<p className="muted">입장 비용 {adThresholds(h.policy).cpr_limit_krw.toLocaleString('ko-KR')}원 · ROAS {adThresholds(h.policy).roas_floor}배 · 환불 요청 {adThresholds(h.policy).refund_request_limit}건</p>
        </div>)}{!loaded?.history.some(h => h.cohort_id === selected) && <p className="muted">아직 변경 기록이 없습니다.</p>}
      </div></details>
    </>}
    {message && <p className="notice mt16" role="alert">{message}</p>}
  </section>;
}
