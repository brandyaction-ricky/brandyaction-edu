'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { metaCampaignIds } from '@/lib/meta-campaign-settings';
import { DEFAULT_SAMPLE_MIN, parseSampleMin } from '@/lib/landing-operations-phase1';
import type { Classify } from './ad-type-control';
import { RefreshCw, Settings2 } from 'lucide-react';
import { PERFORMANCE_PRESETS, campaignRange, presetRange, previousRange, validDay, type ActualRow, type DashboardReport, type PerformanceCampaign, type PerformanceCourse, type PerformancePreset } from '@/lib/landing-performance';
import { appendFilters, campaignStatus, emptyFilters, metaStatus, periodError, readFilters, readPeriod, type TrackingFilters, type TrackingPeriod } from '@/lib/landing-admin-state';
import { AdminButton, AdminDrawer, AdminPage, AdminPageHeader, AdminStatusBadge, AdminToast } from '@/features/admin-ui';
import { MultiSourceComparison, PerformanceDashboard } from './performance-dashboard';
import { ActualDrawer, ActualsPanel, CampaignSettings } from './tracking-operations';
import { CompactEmpty, DiscardConfirmation, InlineError, TrackingFiltersPanel, TrackingSkeleton } from './tracking-controls';
import './tracking-admin.css';

const labels = { today: '오늘', yesterday: '어제', '7d': '7일', '14d': '14일', campaign: '캠페인 전체', custom: '직접 기간' };
async function responseJson(response: Response) { const value = await response.json(); if (!response.ok) throw Error(value.error || '요청에 실패했습니다.'); return value; }
const initialPeriod: TrackingPeriod = { preset: '7d', start: '', end: '', compare: false, compareStart: '', compareEnd: '' };
type MultiReport = DashboardReport & { source_title: string };
type ReportResult = DashboardReport | { multi: true; reports: MultiReport[] };

export function LandingAdmin() {
  const [courses, setCourses] = useState<PerformanceCourse[]>([]), [courseId, setCourseId] = useState(''), [campaignId, setCampaignId] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<TrackingPeriod>(initialPeriod), [filters, setFilters] = useState<TrackingFilters>(emptyFilters);
  const [list, setList] = useState({ loading: true, error: '', canManage: false }), [listVersion, setListVersion] = useState(0), [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; report?: ReportResult; error?: string }>({ requestKey: '' });
  const [pending, setPending] = useState(false), [syncing, setSyncing] = useState(false), [dirty, setDirty] = useState(false), [message, setMessage] = useState('');
  const [drawer, setDrawer] = useState<{ row: ActualRow | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sampleMin, setSampleMin] = useState(String(DEFAULT_SAMPLE_MIN));
  const [navigation, setNavigation] = useState<{ proceed: () => void } | null>(null);
  const pendingRef = useRef(false), initialized = useRef(false), actualsRequested = useRef(false);
  const requestSequence = useRef(0), listSequence = useRef(0), initialAnalyticsRequest = useRef(true);
  const course = courses.find(item => item.id === courseId), campaign = course?.campaigns.find(item => item.id === campaignId);
  const selectedCampaigns = selectedCampaignIds.flatMap(id => courses.flatMap(item => item.campaigns).filter(value => value.id === id));
  const selectionRange = selectedCampaigns.length ? { start_day: selectedCampaigns.map(item => item.start_day).sort().at(-1)!, end_day: selectedCampaigns.map(item => item.end_day).sort()[0] } : campaign;
  useEffect(() => {
    const controller = new AbortController(), sequence = ++listSequence.current;
    fetch('/api/landing/performance', { cache: 'no-store', signal: controller.signal }).then(responseJson).then(value => {
      if (controller.signal.aborted || sequence !== listSequence.current) return;
      const items: PerformanceCourse[] = value.courses || [];
      setCourses(items); setList({ loading: false, error: '', canManage: Boolean(value.can_manage_campaign) });
      if (initialized.current) return;
      const url = new URLSearchParams(location.search), requestedCourse = url.get('course') || url.get('landing'), requestedCampaigns = [...new Set(url.getAll('campaign'))], requestedCampaign = requestedCampaigns[0];
      setSampleMin(String(parseSampleMin(url.get('sample_min')) ?? DEFAULT_SAMPLE_MIN));
      const nextCourse = requestedCourse ? items.find(item => item.id === requestedCourse) : requestedCampaign ? items.find(item => item.campaigns.some(c => c.id === requestedCampaign)) : items.find(item => item.status === 'published' && item.tracking === 'active') || items[0];
      const requestedItems = requestedCampaigns.flatMap(id => items.flatMap(item => item.campaigns).filter(campaign => campaign.id === id));
      const nextCampaign = requestedCampaign ? requestedItems[0] : nextCourse?.campaigns[0];
      setSettingsOpen(url.get('panel') === 'settings' || url.get('tab') === 'settings'); actualsRequested.current = url.get('tab') === 'actuals'; setFilters(readFilters(url));
      if ((requestedCourse && !nextCourse) || (requestedCampaign && !nextCampaign)) { setList({ loading: false, error: '존재하지 않거나 접근할 수 없는 클래스·캠페인입니다. 선택을 다시 확인해 주세요.', canManage: Boolean(value.can_manage_campaign) }); return; }
      initialized.current = true;
      setCourseId(nextCourse?.id || ''); setCampaignId(nextCampaign?.id || ''); setSelectedCampaignIds(requestedItems.length ? requestedItems.map(item => item.id) : nextCampaign ? [nextCampaign.id] : []);
      if (nextCampaign) setPeriod(readPeriod(url, nextCampaign));
    }).catch(error => { if (!controller.signal.aborted && sequence === listSequence.current) setList(previous => ({ ...previous, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [listVersion]);
  const validationError = selectionRange ? selectionRange.start_day > selectionRange.end_day ? '선택한 무료클래스 캠페인의 운영 기간이 겹치지 않습니다.' : periodError(period, selectionRange) : '';
  const query = (() => {
    if (!selectedCampaignIds.length || !period.start || !period.end || validationError) return '';
    const value = new URLSearchParams({ start: period.start, end: period.end });
    if (selectedCampaignIds.length === 1) value.set('landing', courseId);
    selectedCampaignIds.forEach(id => value.append('campaign', id));
    if (period.compare) { value.set('compare_start', period.compareStart); value.set('compare_end', period.compareEnd); }
    if (selectedCampaignIds.length === 1) appendFilters(value, filters); return value.toString();
  })();
  const requestKey = query + ':' + reload;
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController(), sequence = ++requestSequence.current;
    // Update filter checkboxes and URL immediately; coalesce rapid selections.
    const delay = initialAnalyticsRequest.current ? 0 : 500;
    initialAnalyticsRequest.current = false;
    const timer = setTimeout(() => {
      fetch('/api/landing/performance?' + query + '&include=ui', { cache: 'no-store', signal: controller.signal }).then(responseJson).then(value => { if (!controller.signal.aborted && sequence === requestSequence.current) setResult({ requestKey, report: value }); }).catch(error => { if (!controller.signal.aborted && sequence === requestSequence.current) setResult(previous => ({ ...previous, requestKey, error: error.message })); });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, requestKey]);
  useEffect(() => {
    if (!initialized.current) return;
    const url = new URL(location.href);
    for (const key of ['course', 'landing', 'campaign', 'preset', 'start', 'end', 'compare', 'compare_start', 'compare_end', 'panel', ...Object.keys(filters)]) url.searchParams.delete(key);
    if (courseId) url.searchParams.set('course', courseId);
    if (campaignId) { selectedCampaignIds.forEach(id => url.searchParams.append('campaign', id)); url.searchParams.set('preset', period.preset); url.searchParams.set('start', period.start); url.searchParams.set('end', period.end); }
    if (period.compare) { url.searchParams.set('compare', '1'); url.searchParams.set('compare_start', period.compareStart); url.searchParams.set('compare_end', period.compareEnd); }
    if (settingsOpen) url.searchParams.set('panel', 'settings');
    else if (url.searchParams.get('tab') === 'settings') url.searchParams.set('tab', 'dashboard');
    if (parseSampleMin(sampleMin) !== null) url.searchParams.set('sample_min', sampleMin);
    if (selectedCampaignIds.length === 1) appendFilters(url.searchParams, filters);
    // Next copies its internal history state; passing that state ourselves skips search-param updates.
    history.replaceState(null, '', url);
  }, [courseId, campaignId, selectedCampaignIds, period, filters, settingsOpen, sampleMin]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (!result.report || !actualsRequested.current) return; actualsRequested.current = false; requestAnimationFrame(() => document.getElementById('tracking-actuals')?.scrollIntoView({ block: 'start' })); }, [result.report]);
  function navigate(proceed: () => void) { if (pendingRef.current) return; if (dirty) setNavigation({ proceed }); else proceed(); }
  function toggleCampaign(id: string, checked: boolean) {
    navigate(() => {
      const nextIds = checked ? [...selectedCampaignIds.filter(value => value !== id), id] : selectedCampaignIds.filter(value => value !== id);
      if (!nextIds.length) return;
      const nextPrimaryId = checked ? id : campaignId === id ? nextIds[0] : campaignId;
      const nextCourse = courses.find(item => item.campaigns.some(value => value.id === nextPrimaryId));
      const nextCampaign = nextCourse?.campaigns.find(value => value.id === nextPrimaryId);
      const selected = nextIds.flatMap(value => courses.flatMap(item => item.campaigns).filter(candidate => candidate.id === value));
      const start = selected.map(value => value.start_day).sort().at(-1)!, end = selected.map(value => value.end_day).sort()[0];
      setSelectedCampaignIds(nextIds); setCourseId(nextCourse?.id || ''); setCampaignId(nextPrimaryId); setFilters(emptyFilters()); setDrawer(null); setSettingsOpen(false); setMessage('');
      if (nextCampaign && start <= end) { const today = presetRange('7d', { start_day: start, end_day: end }); const range = campaignRange(today, { start_day: start, end_day: end }); const previous = previousRange(range.startDay, range.endDay); setPeriod(old => ({ ...old, start: range.startDay, end: range.endDay, compareStart: previous.startDay, compareEnd: previous.endDay })); }
    });
  }
  function choosePreset(value: PerformancePreset) {
    if (!selectionRange) return;
    if (value === 'custom') { setPeriod(previous => ({ ...previous, preset: value })); return; }
    const range = campaignRange(presetRange(value, selectionRange), selectionRange), previous = previousRange(range.startDay, range.endDay);
    setPeriod(old => ({ ...old, preset: value, start: range.startDay, end: range.endDay, compareStart: previous.startDay, compareEnd: previous.endDay }));
  }
  function dateChange(key: 'start' | 'end', value: string) { setPeriod(old => { const next = { ...old, [key]: value, preset: 'custom' as const }; if (old.compare && validDay(next.start) && validDay(next.end) && next.start <= next.end) { const prior = previousRange(next.start, next.end); next.compareStart = prior.startDay; next.compareEnd = prior.endDay; } return next; }); }
  function toggleCompare(value: boolean) { setPeriod(old => { const previous = validDay(old.start) && validDay(old.end) && old.start <= old.end ? previousRange(old.start, old.end) : { startDay: '', endDay: '' }; return { ...old, compare: value, compareStart: previous.startDay, compareEnd: previous.endDay }; }); }
  function comparisonPreset(days: 1 | 7 | 14) { if (!selectionRange) return; const preset = days === 1 ? 'today' : days === 7 ? '7d' : '14d', range = campaignRange(presetRange(preset, selectionRange), selectionRange), previous = previousRange(range.startDay, range.endDay); setPeriod({ preset, start: range.startDay, end: range.endDay, compare: true, compareStart: previous.startDay, compareEnd: previous.endDay }); }
  function refresh() { navigate(() => { setListVersion(value => value + 1); setReload(value => value + 1); }); }
  function closeSettings() { navigate(() => setSettingsOpen(false)); }
  async function post(body: Record<string, unknown>, success: string, propagateError = false) {
    if (pendingRef.current) return false;
    pendingRef.current = true; setPending(true); setMessage('');
    try {
      const value = await responseJson(await fetch('/api/landing/performance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      // A pre-save GET must not overwrite the confirmed persisted state.
      requestSequence.current++;
      if (value.campaign) listSequence.current++;
      if (value.campaign) { const saved = value.campaign as PerformanceCampaign; setCourses(previous => previous.map(item => ({ ...item, campaigns: item.campaigns.map(c => c.id === saved.id ? saved : c) }))); setDirty(false); const range = campaignRange({ startDay: period.start, endDay: period.end }, saved); if (range.startDay !== period.start || range.endDay !== period.end) { const prior = previousRange(range.startDay, range.endDay); setPeriod(old => ({ ...old, start: range.startDay, end: range.endDay, compareStart: prior.startDay, compareEnd: prior.endDay })); } }
      setMessage(success); setReload(value => value + 1); return true;
    } catch (error) { setMessage((error as Error).message); if (propagateError) throw error; return false; } finally { pendingRef.current = false; setPending(false); }
  }
  const classify: Classify = async (row, value) => {
    if (!campaign) return false;
    const okay = await post({ action: 'classification', campaign_id: campaign.id, adset: row.adset, creative: row.creative, ad_type: value }, '광고 유형을 저장했습니다.');
    if (okay) setResult(previous => !previous.report || 'multi' in previous.report || previous.report.campaign.id !== campaign.id ? previous : ({ ...previous, report: { ...previous.report, performance: previous.report.performance.map(item => item.adset === row.adset && item.creative === row.creative ? { ...item, ad_type: value } : item) } }));
    return okay;
  };
  async function sync() {
    if (!campaign || pendingRef.current || dirty || !campaign.meta_ad_account_id || !metaCampaignIds(campaign).length) return false;
    pendingRef.current = true; setPending(true); setSyncing(true); setMessage('Meta 데이터를 동기화하고 있습니다.');
    try { const value = await responseJson(await fetch('/api/landing/performance/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: campaign.id }) })); setMessage(`Meta 동기화 성공 · ${value.rows}행을 반영했습니다.`); return true; }
    catch (error) { setMessage('동기화 실패 · ' + (error as Error).message); return false; }
    finally { pendingRef.current = false; setPending(false); setSyncing(false); setListVersion(value => value + 1); setReload(value => value + 1); }
  }
  const multiReports = result.report && 'multi' in result.report ? result.report.reports : undefined;
  const report = result.report && !('multi' in result.report) && result.report.campaign.id === campaign?.id ? result.report : undefined;
  const loading = !!query && result.requestKey !== requestKey;
  const error = validationError || (result.requestKey === requestKey ? result.error : '');
  const stateLabel = campaignStatus(campaign), stateKey = stateLabel === '운영 중' ? 'active' : stateLabel === '시작 전' ? 'scheduled' : stateLabel === '종료' ? 'completed' : 'not_configured';
  return <AdminPage width="wide" template="analytics" className="landing-admin tracking-admin">
    <AdminPageHeader title="무료클래스 트래킹" description="광고·랜딩 성과를 확인하고, 실측 데이터와 캠페인 설정을 한 흐름에서 관리합니다."/>
    <section className="tracking-toolbar" aria-label="무료클래스 조회 조건">
      <div className="tracking-context-row"><fieldset className="tracking-course-multi" disabled={pending || !courses.length}><legend>무료클래스 · 여러 개 선택 가능</legend>{courses.flatMap(item => item.campaigns.map(value => <label key={value.id}><input type="checkbox" checked={selectedCampaignIds.includes(value.id)} onChange={event => toggleCampaign(value.id, event.target.checked)}/><span>{item.title}{item.campaigns.length > 1 ? ` · ${value.name}` : ''}</span><AdminStatusBadge status={value.uses_ads ? 'active' : 'not_configured'} label={value.uses_ads ? '페이드' : '오가닉'}/></label>))}</fieldset><div className="tracking-context-status"><AdminStatusBadge status={stateKey} label={stateLabel}/>{selectedCampaignIds.length === 1 && campaign && <AdminStatusBadge status={campaign.meta_sync_status} label={metaStatus(campaign, syncing)} tone={campaign.meta_sync_status === 'failed' ? 'danger' : campaign.meta_sync_status === 'success' ? 'success' : undefined}/>}</div><span className="tracking-toolbar-spacer"/><AdminButton onClick={refresh} disabled={pending || loading}><RefreshCw size={16}/>새로고침</AdminButton><AdminButton tone="secondary" onClick={() => setSettingsOpen(true)} disabled={!campaign || selectedCampaignIds.length !== 1}><Settings2 size={16}/>캠페인 설정</AdminButton></div>
      {campaign && <><div className="tracking-periods" role="group" aria-label="조회 기간">{[...PERFORMANCE_PRESETS, 'custom' as const].map(value => <AdminButton size="sm" key={value} className={period.preset === value ? 'selected' : ''} aria-pressed={period.preset === value} onClick={() => choosePreset(value)}>{labels[value]}</AdminButton>)}<label className="tracking-check"><input type="checkbox" checked={period.compare} onChange={event => toggleCompare(event.target.checked)}/>비교 모드</label><span className="tracking-help">{period.start} — {period.end} · KST</span></div>
      {period.preset === 'custom' && <div className="tracking-date-inputs"><label>B 시작일<input className="admin-input" type="date" value={period.start} min={selectionRange?.start_day} max={selectionRange?.end_day} onChange={event => dateChange('start', event.target.value)}/></label><label>B 종료일<input className="admin-input" type="date" value={period.end} min={selectionRange?.start_day} max={selectionRange?.end_day} onChange={event => dateChange('end', event.target.value)}/></label></div>}
      {period.compare && <div className="tracking-compare"><div className="tracking-compare-presets">{([1, 7, 14] as const).map(days => <AdminButton size="sm" key={days} onClick={() => comparisonPreset(days)}>{days === 1 ? '어제 → 오늘' : `직전 ${days}일 → 최근 ${days}일`}</AdminButton>)}<AdminButton size="sm" onClick={() => choosePreset('custom')}>직접 맞추기</AdminButton></div><div className="tracking-date-inputs"><label>A · 예전 기간 시작<input className="admin-input" type="date" value={period.compareStart} onChange={event => setPeriod(old => ({ ...old, compareStart: event.target.value }))}/></label><label>A · 예전 기간 종료<input className="admin-input" type="date" value={period.compareEnd} onChange={event => setPeriod(old => ({ ...old, compareEnd: event.target.value }))}/></label><span className="tracking-help">B · 최근 기간 {period.start} — {period.end}</span></div></div>}
      {selectedCampaignIds.length === 1 ? <TrackingFiltersPanel options={report?.options} filters={filters} onChange={setFilters} exportUrl={`/api/landing/performance/export?${query}`} disabled={!query || loading || !!error}/> : <p className="tracking-help">다중 선택에서는 유입별 비교를 위해 상세 소재 필터와 CSV 내보내기를 적용하지 않습니다.</p>}</>}
    </section>
    {list.error && <InlineError onRetry={() => setListVersion(value => value + 1)}>{list.error}</InlineError>}
    {message && <AdminToast tone={message.includes('실패') || message.includes('못했습니다') ? 'danger' : 'success'}>{message}</AdminToast>}
    <div className="tracking-main">
      {error && <InlineError onRetry={() => setReload(value => value + 1)}>{error}{report && ' 이전 조회 결과는 아래에 유지됩니다.'}</InlineError>}
      {!campaign ? list.loading ? <TrackingSkeleton/> : <CompactEmpty title={courses.length ? '캠페인이 등록되지 않았습니다.' : '무료클래스가 등록되지 않았습니다.'} action={<Link className="admin-button admin-button--tertiary" href="/admin/products">상품 관리 확인</Link>}>무료클래스와 연결된 캠페인 구성을 확인해 주세요.</CompactEmpty> : !report && !multiReports ? error ? null : <TrackingSkeleton/> : <>
        {loading && <p className="tracking-help" role="status">새 조건을 조회하고 있습니다. 아래는 이전 조회 결과입니다.</p>}
        <div aria-busy={loading} className={loading ? 'tracking-refreshing' : ''}>{multiReports ? <MultiSourceComparison reports={multiReports}/> : report && <><PerformanceDashboard key={campaign.id} report={report} compare={period.compare} filtered={Object.values(filters).some(values => values.length > 0)} sampleMin={sampleMin} onSampleMin={setSampleMin} pending={pending || loading || !!error} onRetry={() => setReload(value => value + 1)} onClassify={classify}/><ActualsPanel report={report} onEdit={row => setDrawer({ row })} onAdd={() => setDrawer({ row: null })} onSettings={() => setSettingsOpen(true)} onRetry={() => setReload(value => value + 1)}/></>}</div>
      </>}
    </div>
    {drawer && campaign && <ActualDrawer campaign={campaign} initial={drawer.row} pending={pending} onClose={() => setDrawer(null)} onSave={values => post({ action: 'actual', campaign_id: campaign.id, values }, '일별 실측값을 저장했습니다.')}/>}
    {settingsOpen && campaign && <AdminDrawer title="캠페인 설정" size="large" className="tracking-settings-drawer" onClose={closeSettings}><CampaignSettings key={JSON.stringify(campaign) + ':' + listVersion} campaign={campaign} canManage={list.canManage} pending={pending} syncing={syncing} onDirty={setDirty} onSave={values => post({ action: 'campaign', campaign_id: campaign.id, values }, '캠페인 설정을 저장했습니다.', true)} onSync={sync}/></AdminDrawer>}
    {navigation && (
      <DiscardConfirmation message="변경한 캠페인 설정을 저장하지 않고 이동할까요?" onCancel={() => setNavigation(null)} onDiscard={() => { const proceed = navigation.proceed; setNavigation(null); setDirty(false); proceed(); }}/>
    )}
  </AdminPage>;
}
