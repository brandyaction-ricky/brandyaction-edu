'use client';

import { metaCampaignIds, metaConnectionHelp, parseMetaCampaignIds } from '@/lib/meta-campaign-settings';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Save } from 'lucide-react';
import { campaignRange, presetRange, type ActualRow, type DashboardReport, type PerformanceCampaign } from '@/lib/landing-performance';
import { actualPayload, actualRevenue, campaignStatus, count, kstTime, metaStatus, money, signed } from '@/lib/landing-admin-state';
import { AdminButton, AdminDataTable, AdminDivider, AdminSection, AdminStatusBadge } from '@/app/ui/final/admin-system';
import { OperationsSummary } from './performance-dashboard';
import { CompactEmpty, DiscardConfirmation, InlineError, TrackingModal } from './tracking-controls';

export function ActualsPanel({ report, onEdit, onAdd, onRetry, onSettings }: { report: DashboardReport; onEdit: (row: ActualRow) => void; onAdd: () => void; onRetry: () => void; onSettings: () => void }) {
  return <AdminSection id="tracking-actuals" bordered title="실측 데이터" description="카카오톡방 인원과 신규·기존 결제를 날짜별로 관리합니다." actions={<><AdminButton tone="secondary" onClick={onSettings}>캠페인 설정</AdminButton><AdminButton tone="primary" onClick={onAdd}><Plus size={16}/>실측 기록 추가</AdminButton></>}>
    <OperationsSummary report={report}/>
    {report.ui?.errors.actuals && <InlineError onRetry={onRetry}>{report.ui.errors.actuals}</InlineError>}
    <AdminDivider/><div className="tracking-subsection-head"><h3>일별 실측 기록</h3><span className="tracking-help">{report.range.startDay} — {report.range.endDay} · 최신 날짜순</span></div>
      {report.actuals.length ? <AdminDataTable label="일별 실측 기록" tableClassName="tracking-actuals-table"><thead><tr>{['날짜', '카카오톡방 인원', '전일 대비 증감', '방문', 'CTA 클릭', '차이', '신규 결제', '기존 결제', '일별 매출', '메모', '수정'].map((label, index) => <th scope="col" data-align={index > 0 && index < 9 ? 'number' : index === 10 ? 'action' : undefined} key={label}>{label}</th>)}</tr></thead><tbody>{[...report.actuals].sort((a, b) => b.day.localeCompare(a.day)).map(row => {
        const previous = report.ui?.previous_day_members[row.day];
        const traffic = report.daily.find(item => item.day === row.day), increase = row.kakao_members == null || previous == null ? null : row.kakao_members - previous;
        return <tr key={row.day} onClick={() => onEdit(row)}><th scope="row">{row.day}</th><td data-align="number">{count(row.kakao_members)}</td><td data-align="number" title="바로 전 날짜의 기록이 없으면 — 표시">{signed(increase)}</td><td data-align="number">{count(traffic?.sessions)}</td><td data-align="number">{count(traffic?.cta_click_sessions)}</td><td data-align="number" title="카톡방 인원 증가분 − CTA 클릭 세션">{increase == null || traffic == null ? '—' : signed(increase - traffic.cta_click_sessions)}</td><td data-align="number">{count(row.new_payments)}</td><td data-align="number">{count(row.existing_payments)}</td><td data-align="number">{money(actualRevenue(row))}</td><td className="tracking-identifier"><span title={row.memo || ''}>{row.memo || '—'}</span></td><td data-align="action"><AdminButton size="sm" aria-label={`${row.day} 실측 기록 수정`} onClick={event => { event.stopPropagation(); onEdit(row); }}>수정</AdminButton></td></tr>;
      })}</tbody></AdminDataTable> : <CompactEmpty title="실측 데이터가 없습니다." action={<AdminButton tone="primary" onClick={onAdd}>첫 실측 기록 추가</AdminButton>}>선택 기간에 저장된 기록이 없습니다. 카카오톡방 인원과 결제 건수를 입력해 주세요.</CompactEmpty>}
  </AdminSection>;
}
const actualFields = [['kakao_members', '자정 기준 카카오톡방 현재 인원'], ['new_payments', '신규 고객 결제 건수'], ['existing_payments', '기존 고객 결제 건수'], ['memo', '메모']] as const;
export function ActualDrawer({ campaign, initial, pending, onClose, onSave }: { campaign: PerformanceCampaign; initial: ActualRow | null; pending: boolean; onClose: () => void; onSave: (values: Record<string, unknown>) => Promise<boolean> }) {
  const [day, setDay] = useState(initial?.day || campaignRange(presetRange('today', campaign), campaign).startDay);
  const [record, setRecord] = useState<{ day: string; row: ActualRow | null; error?: string }>({ day: initial?.day || '', row: initial });
  const [clears, setClears] = useState<string[]>([]), [dirty, setDirty] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [discard, setDiscard] = useState<{ nextDay?: string } | null>(null);
  const form = useRef<HTMLFormElement>(null), saveLock = useRef(false);
  useEffect(() => {
    if (initial?.day === day && retry === 0) return;
    if (!day || day < campaign.start_day || day > campaign.end_day) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ landing: campaign.landing_id, campaign: campaign.id, start: day, end: day });
    fetch('/api/landing/performance?' + query, { cache: 'no-store', signal: controller.signal }).then(async response => { const value = await response.json(); if (!response.ok) throw Error(value.error || '기존 기록을 확인하지 못했습니다.'); return value as DashboardReport; }).then(value => { if (!controller.signal.aborted) setRecord({ day, row: value.actuals[0] || null }); }).catch(error => { if (!controller.signal.aborted) setRecord({ day, row: null, error: error.message }); });
    return () => controller.abort();
  }, [day, campaign.id, campaign.landing_id, campaign.start_day, campaign.end_day, initial?.day, retry]);
  const loading = day !== record.day, editing = !loading && !!record.row;
  function close() { if (pending || saveLock.current) return; if (dirty) setDiscard({}); else onClose(); }
  function changeDay(value: string) { setDay(value); setClears([]); setDirty(false); setError(''); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || saveLock.current || loading || record.error) return;
    saveLock.current = true; setError('');
    const okay = await onSave(actualPayload(new FormData(event.currentTarget), clears));
    saveLock.current = false;
    if (okay) onClose(); else setError('저장하지 못했습니다. 입력값은 유지됩니다. 내용을 확인하고 다시 저장해 주세요.');
  }
  return <TrackingModal title={editing ? '실측 기록 수정' : '실측 기록 추가'} onClose={close}>
    <form ref={form} className="tracking-drawer-form" onSubmit={submit} onChange={event => { if (event.target.getAttribute('name') !== 'day') setDirty(true); }}>
      <div className="tracking-drawer-body"><p className="tracking-help">빈칸은 기존값을 유지합니다. 숫자 0은 실제 0으로 저장됩니다.</p>
        <label className="admin-field">날짜 · KST<input className="admin-input" name="day" type="date" value={day} min={campaign.start_day} max={campaign.end_day} required disabled={pending} onChange={event => { if (dirty) setDiscard({ nextDay: event.target.value }); else changeDay(event.target.value); }}/></label>
        {loading && <p role="status">해당 날짜의 기존 기록을 확인하고 있습니다.</p>}
        {record.error && <InlineError onRetry={() => setRetry(value => value + 1)}>{record.error}</InlineError>}
        <fieldset disabled={pending || loading || !!record.error} key={day}>{actualFields.map(([name, label]) => <div className="tracking-actual-field" key={name}><label className="admin-field">{label}{name === 'memo' ? <textarea className="admin-textarea" name={name} maxLength={1000} rows={3} disabled={clears.includes(name)} placeholder={editing ? '변경할 메모 입력' : '운영 메모를 남겨 주세요.'}/> : <input className="admin-input" name={name} type="number" inputMode="numeric" min="0" max="100000000" step="1" disabled={clears.includes(name)} placeholder={editing ? '변경할 값 입력' : '미입력'}/>}</label>{editing && <div className="tracking-field-current"><small>현재: {name === 'memo' ? record.row?.memo || '—' : count(record.row?.[name])}</small><AdminButton size="sm" aria-pressed={clears.includes(name)} onClick={() => { setClears(values => values.includes(name) ? values.filter(key => key !== name) : [...values, name]); setDirty(true); }}>{clears.includes(name) ? '비우기 취소' : '값 비우기'}<span className="sr-only"> · {label}</span></AdminButton></div>}{clears.includes(name) && <p className="tracking-help">저장하면 이 값이 비워집니다.</p>}</div>)}</fieldset>
        <p className="tracking-help">적용 단가: 신규 {money(record.row?.new_price_snapshot ?? campaign.new_customer_price)} / 기존 {money(record.row?.existing_price_snapshot ?? campaign.existing_customer_price)}. 매출은 저장된 단가로 자동 계산됩니다.</p>
        {error && <InlineError>{error}</InlineError>}
      </div><footer className="admin-dialog-footer"><AdminButton onClick={close} disabled={pending}>취소</AdminButton><AdminButton type="submit" tone="primary" disabled={pending || loading || !!record.error || !day}><Save size={16}/>{pending ? '저장 중' : editing ? '부분 저장' : '실측 기록 저장'}</AdminButton></footer>
    </form>
    {discard && <DiscardConfirmation message={discard.nextDay !== undefined ? '날짜를 변경하면 작성 중인 내용이 사라집니다.' : '입력 중인 실측값을 저장하지 않고 닫을까요?'} onCancel={() => setDiscard(null)} onDiscard={() => { const nextDay = discard.nextDay; setDiscard(null); if (nextDay !== undefined) changeDay(nextDay); else onClose(); }}/>}
  </TrackingModal>;
}
export function campaignDraft(campaign: PerformanceCampaign) {
  return { name: campaign.name, utm_campaign: campaign.utm_campaign, start_day: campaign.start_day, end_day: campaign.end_day, uses_ads: campaign.uses_ads, live_peak: campaign.live_peak == null ? '' : String(campaign.live_peak), new_customer_price: String(campaign.new_customer_price), existing_customer_price: String(campaign.existing_customer_price), meta_campaign_ids: metaCampaignIds(campaign).join('\n') };
}
export function CampaignSettings({ campaign, canManage, pending, syncing, onDirty, onSave, onSync }: { campaign: PerformanceCampaign; canManage: boolean; pending: boolean; syncing: boolean; onDirty: (dirty: boolean) => void; onSave: (value: Record<string, unknown>) => Promise<boolean>; onSync: () => Promise<boolean> }) {
  const [draft, setDraft] = useState(() => campaignDraft(campaign)), [baseline, setBaseline] = useState(() => campaignDraft(campaign)), [message, setMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline), saveLock = useRef(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const change = (key: keyof typeof draft, value: string | boolean) => { setDraft(values => ({ ...values, [key]: value })); setMessage(''); };
  const field = (key: Exclude<keyof typeof draft, 'uses_ads'>, label: string, type = 'text') => <label className="admin-field">{label}<input className="admin-input" name={key} type={type} value={draft[key]} required={key !== 'live_peak' && key !== 'meta_campaign_ids'} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '1' : undefined} inputMode={type === 'number' || key === 'meta_campaign_ids' ? 'numeric' : undefined} maxLength={key === 'name' ? 200 : key === 'utm_campaign' ? 250 : undefined} placeholder={key === 'meta_campaign_ids' ? '광고 세팅 후 캠페인 ID 입력' : undefined} onChange={event => change(key, event.target.value)}/></label>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dirty || pending || saveLock.current) return;
    if (draft.end_day < draft.start_day) { setMessage('종료일은 시작일 이후로 선택해 주세요.'); return; }
    saveLock.current = true;
    try {
      const values = { ...draft, meta_campaign_ids: parseMetaCampaignIds(draft.meta_campaign_ids) };
      const okay = await onSave(values);
      if (okay) { const saved = { ...draft, meta_campaign_ids: values.meta_campaign_ids.join('\n') }; setDraft(saved); setBaseline(saved); setMessage('설정을 저장했습니다.'); onDirty(false); }
      else setMessage('설정을 저장하지 못했습니다. 입력값은 유지됩니다. 다시 저장해 주세요.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '설정을 저장하지 못했습니다. 입력값은 유지됩니다.'); }
    finally { saveLock.current = false; }
  }
  const status = metaStatus(campaign, syncing);
  return <form className="tracking-settings tracking-stack" onSubmit={submit}>
    <p className="tracking-help">방문 집계는 선택한 클래스·기간의 모든 UTM과 직접 유입을 포함합니다. 아래 UTM 캠페인 값은 집계 제한이 아니며, 광고·오가닉 UTM은 대시보드 상세 필터에서 여러 개 선택할 수 있습니다. UTM이 없는 유입은 출처를 구분할 수 없습니다.</p>
    {!canManage && <p className="tracking-help">설정은 조회만 가능합니다. 캠페인·Meta 설정 변경에는 관리자 권한이 필요합니다.</p>}
    <fieldset disabled={!canManage || pending}><AdminSection title="기본 정보"><div className="tracking-form-grid">{field('name', '캠페인명')}{field('utm_campaign', 'UTM 캠페인')}{field('start_day', '시작일', 'date')}{field('end_day', '종료일', 'date')}{field('live_peak', '라이브 최대 동시시청', 'number')}<label className="tracking-check admin-field"><span>유입 구분</span><span><input name="uses_ads" type="checkbox" checked={draft.uses_ads} onChange={event => change('uses_ads', event.target.checked)}/> 광고 사용</span><small className="tracking-help">체크하면 대시보드에서 [페이드], 해제하면 [오가닉]으로 표시됩니다. 새 페이지는 기본 해제입니다.</small></label><div className="admin-field"><span>운영 상태</span><strong>{campaignStatus({ start_day: draft.start_day, end_day: draft.end_day })}</strong><small className="tracking-help">한국 시간의 시작일·종료일 기준으로 자동 표시됩니다.</small></div></div></AdminSection>
    <AdminDivider/><AdminSection title="결제 설정"><div className="tracking-form-grid">{field('new_customer_price', '신규 고객 가격 · 원', 'number')}{field('existing_customer_price', '기존 고객 가격 · 원', 'number')}</div><p className="tracking-help">새 실측 기록에는 캠페인 가격이 적용됩니다. 기존 기록의 단가 스냅샷은 유지되어 과거 매출이 바뀌지 않습니다.</p></AdminSection>
    <AdminDivider/><AdminSection title="Meta 광고 연동" actions={<AdminStatusBadge status={campaign.meta_sync_status} label={status} tone={status === '동기화 오류' ? 'danger' : status === '동기화 성공' ? 'success' : undefined}/>}><div className="tracking-form-grid"><label className="admin-field">Meta 광고계정 ID<input className="admin-input" name="meta_ad_account_id" value={campaign.meta_ad_account_id || ''} readOnly placeholder="공통 광고계정 미설정"/><small className="tracking-help">모든 무료클래스 캠페인에 자동 적용되는 공통 광고계정입니다. 이 화면에서는 변경할 수 없습니다.</small></label><label className="admin-field">Meta 캠페인 ID<textarea className="admin-textarea" name="meta_campaign_ids" value={draft.meta_campaign_ids} rows={4} placeholder="캠페인 ID를 한 줄에 하나씩 입력" onChange={event => change('meta_campaign_ids', event.target.value)}/><small className="tracking-help">같은 광고계정의 캠페인을 최대 20개 연결할 수 있습니다. 줄바꿈 또는 쉼표로 구분하며, 중복 ID는 한 번만 반영됩니다.</small></label></div>
      <p className="tracking-help">{metaConnectionHelp(campaign)}</p><dl className="tracking-sync-details"><div><dt>마지막 성공</dt><dd>{kstTime(campaign.meta_last_synced_at)}</dd></div><div><dt>마지막 시도</dt><dd>{kstTime(campaign.meta_sync_attempted_at)}</dd></div><div><dt>마지막 결과</dt><dd>{campaign.meta_sync_error || status}</dd></div></dl>
      <div className="tracking-sync-action"><AdminButton tone="secondary" disabled={!canManage || pending || dirty || !campaign.meta_ad_account_id || !metaCampaignIds(campaign).length} onClick={() => void onSync()}><RefreshCw size={16}/>{syncing ? '동기화 중' : 'Meta 재동기화'}</AdminButton><p className="tracking-help">{!campaign.meta_ad_account_id ? '공통 광고계정 설정이 필요합니다.' : !metaCampaignIds(campaign).length ? 'Meta 캠페인 ID를 입력하고 설정을 저장하면 동기화할 수 있습니다.' : dirty ? '변경사항을 먼저 저장한 뒤 동기화해 주세요.' : '저장된 모든 캠페인의 광고 데이터를 함께 가져옵니다. ID를 제거해도 이미 수집된 과거 실적은 보존됩니다.'}</p></div>
    </AdminSection></fieldset>
    <div className="admin-dialog-footer tracking-action-bar"><span role="status">{message || (dirty ? '저장하지 않은 변경사항이 있습니다.' : '저장된 설정과 동일합니다.')}</span><AdminButton type="submit" tone="primary" disabled={!canManage || pending || !dirty}><Save size={16}/>{pending && !syncing ? '저장 중' : '설정 저장'}</AdminButton></div>
  </form>;
}
