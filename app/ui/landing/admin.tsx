'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PERFORMANCE_PERIODS, type PerformanceCourse, type PerformancePeriod, type PerformanceReport } from '@/lib/landing-performance';
import { PerformanceDashboard } from './performance-dashboard';

export function LandingAdmin() {
  const [courses, setCourses] = useState<PerformanceCourse[]>([]);
  const [selected, setSelected] = useState('');
  const [period, setPeriod] = useState<PerformancePeriod>(7);
  const [reload, setReload] = useState(0);
  const [list, setList] = useState({ loading: true, error: '' });
  const [result, setResult] = useState<{ key: string; report?: PerformanceReport; error?: string }>({ key: '' });
  const query = new URLSearchParams({ landing: selected, days: String(period) }).toString();
  const requestKey = query + ':' + reload;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/landing/performance', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw Error(value.error || '무료클래스 목록을 불러오지 못했습니다.');
        if (controller.signal.aborted) return;
        const items: PerformanceCourse[] = value.courses;
        setCourses(items);
        const requested = new URLSearchParams(location.search).get('course');
        setSelected(current => items.find(item => item.id === (current || requested))?.id || items.find(item => item.status === 'published' && item.tracking === 'active')?.id || items.find(item => item.status === 'published')?.id || items[0]?.id || '');
        setList({ loading: false, error: '' });
      })
      .catch(error => { if (!controller.signal.aborted) setList({ loading: false, error: error.message }); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch('/api/landing/performance?' + query, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw Error(value.error || '성과 데이터를 불러오지 못했습니다.');
        if (!controller.signal.aborted) setResult({ key: requestKey, report: value });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, error: error.message }); });
    return () => controller.abort();
  }, [selected, query, requestKey]);

  const current = courses.find(course => course.id === selected);
  const fresh = result.key === requestKey;
  const loading = list.loading || (!!selected && !fresh);
  const error = list.error || (fresh ? result.error : '');
  const report = !error && fresh ? result.report : undefined;
  return <div className="landing-admin">
    <div className="toolbar">
      <label className="select-filter"><span>대상 무료클래스</span><select aria-label="대상 무료클래스" value={selected} onChange={event => setSelected(event.target.value)} disabled={!courses.length}>{!courses.length && <option value="">등록된 무료클래스 없음</option>}{courses.map(course => <option key={course.id} value={course.id}>{course.title}{course.status === 'published' ? '' : ' · 미공개'}</option>)}</select></label>
      {current && <span className={'badge ' + (current.tracking === 'active' ? 'green' : current.tracking === 'paused' ? 'amber' : '')}>{current.tracking === 'active' ? '데이터 수집 중' : current.tracking === 'paused' ? '데이터 수집 중지됨' : '수집 설정 없음'}</span>}
      <span className="spacer" />
      {report && <span className="meta">{report.range.startDay} — {report.range.endDay} · KST</span>}
      <button type="button" className="btn" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />새로고침</button>
    </div>
    <div className="tabs" role="group" aria-label="조회 기간">{PERFORMANCE_PERIODS.map(days => <button key={days} type="button" className={'tab ' + (period === days ? 'active' : '')} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days}D</button>)}</div>
    {error ? <div className="empty" role="alert"><h3>성과 데이터를 불러오지 못했습니다.</h3><p>{error} 새로고침으로 다시 시도해 주세요.</p></div>
      : loading ? <div className="empty" role="status"><p>실제 성과 데이터를 불러오고 있습니다.</p></div>
      : !current ? <div className="empty"><h3>등록된 무료클래스가 없습니다.</h3><p>상품 관리에서 등록한 무료클래스가 표시됩니다.</p></div>
      : report && <PerformanceDashboard report={report} />}
    {current && !loading && !error && current.tracking !== 'active' && <p className="notice amber mt24">{current.tracking === 'paused' ? '현재 이 클래스의 신규 데이터 수집이 중지되어 있습니다. 기존 기록만 조회하며, 수집 설정은 변경하지 않았습니다.' : '이 클래스에는 기존 트래킹 설정이 없습니다. 수집되지 않은 방문은 통계에 포함되지 않습니다.'}</p>}
  </div>;
}
