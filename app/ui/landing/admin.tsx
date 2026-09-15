'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { metaCampaignIds } from '@/lib/meta-campaign-settings';
import { RefreshCw } from 'lucide-react';
import { PERFORMANCE_PRESETS, campaignRange, presetRange, previousRange, validDay, type ActualRow, type DashboardReport, type PerformanceCampaign, type PerformanceCourse, type PerformancePreset } from '@/lib/landing-performance';
import { appendFilters, campaignStatus, emptyFilters, metaStatus, parseTab, periodError, readFilters, readPeriod, TRACKING_TABS, type TrackingFilters, type TrackingPeriod, type TrackingTab } from '@/lib/landing-admin-state';
import { PerformanceDashboard } from './performance-dashboard';
import { ActualDrawer, ActualsPanel, CampaignSettings } from './tracking-operations';
import { CompactEmpty, DiscardConfirmation, InlineError, TrackingFiltersPanel, TrackingSkeleton } from './tracking-controls';
import './tracking-admin.css';

const labels = { today: '오늘', yesterday: '어제', '7d': '7일', '14d': '14일', campaign: '캠페인 전체', custom: '직접 기간' };
async function responseJson(response: Response) { const value = await response.json(); if (!response.ok) throw Error(value.error || '요청에 실패했습니다.'); return value; }
const initialPeriod: TrackingPeriod = { preset: '7d', start: '', end: '', compare: false, compareStart: '', compareEnd: '' };

export function LandingAdmin() {
  const [courses, setCourses] = useState<PerformanceCourse[]>([]), [courseId, setCourseId] = useState(''), [campaignId, setCampaignId] = useState('');
  const [tab, setTab] = useState<TrackingTab>('dashboard'), [period, setPeriod] = useState<TrackingPeriod>(initialPeriod), [filters, setFilters] = useState<TrackingFilters>(emptyFilters);
  const [list, setList] = useState({ loading: true, error: '', canManage: false }), [listVersion, setListVersion] = useState(0), [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; report?: DashboardReport; error?: string }>({ requestKey: '' });
  const [pending, setPending] = useState(false), [syncing, setSyncing] = useState(false), [dirty, setDirty] = useState(false), [message, setMessage] = useState('');
  const [drawer, setDrawer] = useState<{ row: ActualRow | null } | null>(null);
  const [navigation, setNavigation] = useState<{ proceed: () => void } | null>(null);
  const pendingRef = useRef(false), initialized = useRef(false);
  const course = courses.find(item => item.id === courseId), campaign = course?.campaigns.find(item => item.id === campaignId);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/landing/performance', { cache: 'no-store', signal: controller.signal }).then(responseJson).then(value => {
      if (controller.signal.aborted) return;
      const items: PerformanceCourse[] = value.courses || [];
      setCourses(items); setList({ loading: false, error: '', canManage: Boolean(value.can_manage_campaign) });
      if (initialized.current) return;
      const url = new URLSearchParams(location.search), requestedCourse = url.get('course') || url.get('landing'), requestedCampaign = url.get('campaign');
      const nextCourse = requestedCourse ? items.find(item => item.id === requestedCourse) : requestedCampaign ? items.find(item => item.campaigns.some(c => c.id === requestedCampaign)) : items.find(item => item.status === 'published' && item.tracking === 'active') || items[0];
      const nextCampaign = requestedCampaign ? nextCourse?.campaigns.find(item => item.id === requestedCampaign) : nextCourse?.campaigns[0];
      setTab(parseTab(url.get('tab'))); setFilters(readFilters(url));
      if ((requestedCourse && !nextCourse) || (requestedCampaign && !nextCampaign)) { setList({ loading: false, error: '존재하지 않거나 접근할 수 없는 클래스·캠페인입니다. 선택을 다시 확인해 주세요.', canManage: Boolean(value.can_manage_campaign) }); return; }
      initialized.current = true;
      setCourseId(nextCourse?.id || ''); setCampaignId(nextCampaign?.id || '');
      if (nextCampaign) setPeriod(readPeriod(url, nextCampaign));
    }).catch(error => { if (!controller.signal.aborted) setList(previous => ({ ...previous, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [listVersion]);
  const validationError = campaign ? periodError(period, campaign) : '';
  const query = (() => {
    if (!courseId || !campaignId || !period.start || !period.end || validationError) return '';
    const value = new URLSearchParams({ landing: courseId, campaign: campaignId, start: period.start, end: period.end });
    if (period.compare) { value.set('compare_start', period.compareStart); value.set('compare_end', period.compareEnd); }
    appendFilters(value, filters); return value.toString();
  })();
  const requestKey = query + ':' + reload;
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch('/api/landing/performance?' + query + '&include=ui', { cache: 'no-store', signal: controller.signal }).then(responseJson).then(value => { if (!controller.signal.aborted) setResult({ requestKey, report: value }); }).catch(error => { if (!controller.signal.aborted) setResult(previous => ({ ...previous, requestKey, error: error.message })); });
    return () => controller.abort();
  }, [query, requestKey]);
  useEffect(() => {
    if (!initialized.current) return;
    const url = new URL(location.href);
    for (const key of ['course', 'landing', 'campaign', 'preset', 'start', 'end', 'compare', 'compare_start', 'compare_end', 'tab', ...Object.keys(filters)]) url.searchParams.delete(key);
    url.searchParams.set('tab', tab);
    if (courseId) url.searchParams.set('course', courseId);
    if (campaignId) { url.searchParams.set('campaign', campaignId); url.searchParams.set('preset', period.preset); url.searchParams.set('start', period.start); url.searchParams.set('end', period.end); }
    if (period.compare) { url.searchParams.set('compare', '1'); url.searchParams.set('compare_start', period.compareStart); url.searchParams.set('compare_end', period.compareEnd); }
    appendFilters(url.searchParams, filters);
    // Preserve Next's history state and scroll position. No route-wide refresh.
    history.replaceState(history.state, '', url);
  }, [tab, courseId, campaignId, period, filters]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function navigate(proceed: () => void) { if (pendingRef.current) return; if (dirty) setNavigation({ proceed }); else proceed(); }
  function changeTab(next: TrackingTab) { if (next !== tab) navigate(() => setTab(next)); }
  function applyCampaign(next?: PerformanceCampaign) {
    setCampaignId(next?.id || ''); setFilters(emptyFilters()); setDrawer(null); setMessage('');
    if (next) setPeriod(readPeriod(new URLSearchParams({ preset: '7d' }), next));
  }
  function chooseCourse(id: string) { navigate(() => { initialized.current = true; setList(previous => ({ ...previous, error: '' })); setCourseId(id); applyCampaign(courses.find(item => item.id === id)?.campaigns[0]); }); }
  function chooseCampaign(id: string) { navigate(() => applyCampaign(course?.campaigns.find(item => item.id === id))); }
  function choosePreset(value: PerformancePreset) {
    if (!campaign) return;
    if (value === 'custom') { setPeriod(previous => ({ ...previous, preset: value })); return; }
    const range = campaignRange(presetRange(value, campaign), campaign), previous = previousRange(range.startDay, range.endDay);
    setPeriod(old => ({ ...old, preset: value, start: range.startDay, end: range.endDay, compareStart: previous.startDay, compareEnd: previous.endDay }));
  }
  function dateChange(key: 'start' | 'end', value: string) { setPeriod(old => { const next = { ...old, [key]: value, preset: 'custom' as const }; if (old.compare && validDay(next.start) && validDay(next.end) && next.start <= next.end) { const prior = previousRange(next.start, next.end); next.compareStart = prior.startDay; next.compareEnd = prior.endDay; } return next; }); }
  function toggleCompare(value: boolean) { setPeriod(old => { const previous = validDay(old.start) && validDay(old.end) && old.start <= old.end ? previousRange(old.start, old.end) : { startDay: '', endDay: '' }; return { ...old, compare: value, compareStart: previous.startDay, compareEnd: previous.endDay }; }); }
  function comparisonPreset(days: 1 | 7 | 14) { if (!campaign) return; const preset = days === 1 ? 'today' : days === 7 ? '7d' : '14d', range = campaignRange(presetRange(preset, campaign), campaign), previous = previousRange(range.startDay, range.endDay); setPeriod({ preset, start: range.startDay, end: range.endDay, compare: true, compareStart: previous.startDay, compareEnd: previous.endDay }); }
  function refresh() { navigate(() => { setListVersion(value => value + 1); setReload(value => value + 1); }); }
  async function post(body: Record<string, unknown>, success: string, propagateError = false) {
    if (pendingRef.current) return false;
    pendingRef.current = true; setPending(true); setMessage('');
    try {
      const value = await responseJson(await fetch('/api/landing/performance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      if (value.campaign) { const saved = value.campaign as PerformanceCampaign; setCourses(previous => previous.map(item => ({ ...item, campaigns: item.campaigns.map(c => c.id === saved.id ? saved : c) }))); setDirty(false); const range = campaignRange({ startDay: period.start, endDay: period.end }, saved); if (range.startDay !== period.start || range.endDay !== period.end) { const prior = previousRange(range.startDay, range.endDay); setPeriod(old => ({ ...old, start: range.startDay, end: range.endDay, compareStart: prior.startDay, compareEnd: prior.endDay })); } }
      setMessage(success); setReload(value => value + 1); return true;
    } catch (error) { setMessage((error as Error).message); if (propagateError) throw error; return false; } finally { pendingRef.current = false; setPending(false); }
  }
  async function sync() {
    if (!campaign || pendingRef.current || dirty || !campaign.meta_ad_account_id || !metaCampaignIds(campaign).length) return false;
    pendingRef.current = true; setPending(true); setSyncing(true); setMessage('Meta 데이터를 동기화하고 있습니다.');
    try { const value = await responseJson(await fetch('/api/landing/performance/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: campaign.id }) })); setMessage(`Meta 동기화 성공 · ${value.rows}행을 반영했습니다.`); return true; }
    catch (error) { setMessage('동기화 실패 · ' + (error as Error).message); return false; }
    finally { pendingRef.current = false; setPending(false); setSyncing(false); setListVersion(value => value + 1); setReload(value => value + 1); }
  }
  const report = result.report?.campaign.id === campaign?.id ? result.report : undefined;
  const loading = !!query && result.requestKey !== requestKey;
  const error = validationError || (result.requestKey === requestKey ? result.error : '');
  return <div className="landing-admin tracking-admin">
    <div className="tracking-context">
      <div className="tracking-context-row"><label>무료클래스<select value={courseId} onChange={event => chooseCourse(event.target.value)} disabled={pending || !courses.length}>{!courseId && <option value="">{list.loading ? '불러오는 중' : '클래스 선택'}</option>}{courses.map(item => <option key={item.id} value={item.id}>{item.title}{item.status === 'published' ? '' : ' · 미공개'}</option>)}</select></label><label>캠페인<select value={campaignId} onChange={event => chooseCampaign(event.target.value)} disabled={pending || !course?.campaigns.length}>{!campaignId && <option value="">등록된 캠페인 없음</option>}{course?.campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="tracking-context-status"><span className="tracking-badge">{campaignStatus(campaign)}</span>{campaign && <span className={`tracking-badge ${campaign.meta_sync_status === 'failed' ? 'error' : campaign.meta_sync_status === 'success' ? 'success' : ''}`}>{metaStatus(campaign, syncing)}</span>}</div><button type="button" className="btn" onClick={refresh} disabled={pending || loading}><RefreshCw size={16}/>새로고침</button></div>
      {campaign && <><div className="tracking-periods" role="group" aria-label="조회 기간">{[...PERFORMANCE_PRESETS, 'custom' as const].map(value => <button type="button" key={value} className={`btn ${period.preset === value ? 'selected' : ''}`} aria-pressed={period.preset === value} onClick={() => choosePreset(value)}>{labels[value]}</button>)}<label className="tracking-check"><input type="checkbox" checked={period.compare} onChange={event => toggleCompare(event.target.checked)}/>비교 모드</label><span className="tracking-help">{period.start} — {period.end} · KST</span></div>
      {period.preset === 'custom' && <div className="tracking-date-inputs"><label>B 시작일<input type="date" value={period.start} min={campaign.start_day} max={campaign.end_day} onChange={event => dateChange('start', event.target.value)}/></label><label>B 종료일<input type="date" value={period.end} min={campaign.start_day} max={campaign.end_day} onChange={event => dateChange('end', event.target.value)}/></label></div>}
      {period.compare && <div className="tracking-compare"><div className="tracking-compare-presets">{([1, 7, 14] as const).map(days => <button type="button" className="btn" key={days} onClick={() => comparisonPreset(days)}>{days === 1 ? '어제 → 오늘' : `직전 ${days}일 → 최근 ${days}일`}</button>)}<button type="button" className="btn" onClick={() => choosePreset('custom')}>직접 맞추기</button></div><div className="tracking-date-inputs"><label>A · 예전 기간 시작<input type="date" value={period.compareStart} onChange={event => setPeriod(old => ({ ...old, compareStart: event.target.value }))}/></label><label>A · 예전 기간 종료<input type="date" value={period.compareEnd} onChange={event => setPeriod(old => ({ ...old, compareEnd: event.target.value }))}/></label><span className="tracking-help">B · 최근 기간 {period.start} — {period.end}</span></div></div>}</>}
      <div className="tracking-tabs" role="tablist" aria-label="무료클래스 트래킹">{(Object.entries(TRACKING_TABS) as [TrackingTab, string][]).map(([key, label], index, tabs) => <button type="button" role="tab" id={`tracking-tab-${key}`} aria-controls={`tracking-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} key={key} onClick={() => changeTab(key)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; navigate(() => { setTab(tabs[next][0]); document.getElementById(`tracking-tab-${tabs[next][0]}`)?.focus(); }); } }}>{label}</button>)}</div>
    </div>
    {list.error && <InlineError onRetry={() => setListVersion(value => value + 1)}>{list.error}</InlineError>}
    {message && <div className="tracking-notice" role="status">{message}</div>}
    <div role="tabpanel" id={`tracking-panel-${tab}`} aria-labelledby={`tracking-tab-${tab}`} className="tracking-tab-panel">
      {error && <InlineError onRetry={() => setReload(value => value + 1)}>{error}{report && ' 이전 조회 결과는 아래에 유지됩니다.'}</InlineError>}
      {!campaign ? list.loading ? <TrackingSkeleton kind={tab}/> : <CompactEmpty title={courses.length ? '캠페인이 등록되지 않았습니다.' : '무료클래스가 등록되지 않았습니다.'} action={<Link className="btn" href="/admin/products">상품 관리 확인</Link>}>무료클래스와 연결된 캠페인 구성을 확인해 주세요.</CompactEmpty> : tab === 'settings' ? <CampaignSettings key={JSON.stringify(campaign) + ':' + listVersion} campaign={campaign} canManage={list.canManage} pending={pending} syncing={syncing} onDirty={setDirty} onSave={values => post({ action: 'campaign', campaign_id: campaign.id, values }, '캠페인 설정을 저장했습니다.', true)} onSync={sync}/> : !report ? error ? null : <TrackingSkeleton kind={tab}/> : <>
        {loading && <p className="tracking-help" role="status">새 조건을 조회하고 있습니다. 아래는 이전 조회 결과입니다.</p>}
        <div aria-busy={loading} className={loading ? 'tracking-refreshing' : ''}>{tab === 'dashboard' ? <PerformanceDashboard report={report} compare={period.compare} pending={pending || loading || !!error} onRetry={() => setReload(value => value + 1)} onClassify={(row, value) => void post({ action: 'classification', campaign_id: campaign.id, adset: row.adset, creative: row.creative, ad_type: value }, '광고 유형을 저장했습니다.')}/> : <ActualsPanel report={report} onEdit={row => setDrawer({ row })} onAdd={() => setDrawer({ row: null })} onSettings={() => changeTab('settings')} onRetry={() => setReload(value => value + 1)}/>}</div>
      </>}
      {tab === 'dashboard' && campaign && <TrackingFiltersPanel options={report?.options} filters={filters} onChange={setFilters} exportUrl={`/api/landing/performance/export?${query}`} disabled={!query || loading || !!error}/>}
    </div>
    {drawer && campaign && <ActualDrawer campaign={campaign} initial={drawer.row} pending={pending} onClose={() => setDrawer(null)} onSave={values => post({ action: 'actual', campaign_id: campaign.id, values }, '일별 실측값을 저장했습니다.')}/>}
    {navigation && <DiscardConfirmation message="변경한 캠페인 설정을 저장하지 않고 이동할까요?" onCancel={() => setNavigation(null)} onDiscard={() => { const proceed = navigation.proceed; setNavigation(null); setDirty(false); proceed(); }}/>}
  </div>;
}
