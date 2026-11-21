'use client';
import {useEffect, useMemo, useState} from 'react';
import {ARRIVAL_STATIONS} from './analytics';
import type {ArrivalReport} from './analytics-report';
import s from './analytics-panel.module.css';

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const presets = [
  {id: 'today', label: '오늘', range: (t: string) => [t, t]},
  {id: 'yesterday', label: '어제', range: (t: string) => [shift(t, -1), shift(t, -1)]},
  {id: '3', label: '최근 3일', range: (t: string) => [shift(t, -2), t]},
  {id: '7', label: '최근 7일', range: (t: string) => [shift(t, -6), t]},
  {id: '30', label: '최근 30일', range: (t: string) => [shift(t, -29), t]},
] as const;
const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : '–';
const duration = (n: number) => n >= 60 ? `${Math.floor(n / 60)}분 ${n % 60}초` : `${n}초`;
const stationLabel = (n: number) => ARRIVAL_STATIONS.find(st => st.station === n)?.label ?? `${n}단계`;
const Bar = ({value, max, tone = 'main'}: {value: number; max: number; tone?: 'main' | 'soft' | 'good'}) =>
  <span className={s.bar}><span className={s[tone]} style={{width: `${max ? Math.max(value ? 3 : 0, value / max * 100) : 0}%`}}/></span>;

/** 문샷 AI 직원 체험 방문 분석: 기간 선택 → 요약 · 날짜별 · 단계별 이탈 · 상황별 · 버튼별 · 유입 경로. */
export function ArrivalAnalyticsPanel() {
  const today = kstToday();
  const [preset, setPreset] = useState<string>('7'), [from, setFrom] = useState(shift(today, -6)), [to, setTo] = useState(today);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{key: string; report?: ArrivalReport; error?: string} | null>(null);
  const [stationFilter, setStationFilter] = useState('all');
  const requestKey = `${from}/${to}/${version}`;
  const validPeriod = Boolean(from && to && from <= to);
  const current = result?.key === requestKey ? result : null;
  const report = current?.report;
  const error = validPeriod ? current?.error : '조회할 시작일과 종료일을 확인해 주세요.';
  const loading = validPeriod && !current;
  function choose(id: string) { const p = presets.find(x => x.id === id); if (!p) return; const [a, b] = p.range(kstToday()); setPreset(id); setFrom(a); setTo(b); }
  useEffect(() => {
    if (!validPeriod) return;
    const controller = new AbortController();
    void fetch('/api/admin/campus/arrival-analytics?' + new URLSearchParams({from, to}), {signal: controller.signal, cache: 'no-store'})
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || '체험존 분석을 불러오지 못했어요.');
        if (!controller.signal.aborted) setResult({key: requestKey, report: d});
      })
      .catch(e => {
        if (!controller.signal.aborted) setResult({key: requestKey, error: e instanceof Error ? e.message : '체험존 분석을 불러오지 못했어요.'});
      });
    return () => controller.abort();
  }, [from, to, requestKey, validPeriod]);
  const buttons = useMemo(() => (report?.buttons ?? []).filter(b => stationFilter === 'all' || String(b.station) === stationFilter), [report, stationFilter]);
  const sum = report?.summary;
  const maxDaily = Math.max(1, ...(report?.daily ?? []).map(d => d.sessions));
  const maxAudience = Math.max(1, ...(report?.audiences ?? []).map(a => a.sessions));
  const maxButton = Math.max(1, ...buttons.map(b => b.count));
  const audienceTotal = (report?.audiences ?? []).reduce((a, x) => a + x.sessions, 0);

  return <section className={s.panel} aria-label="문샷 체험존 방문 분석">
    <header className={s.head}>
      <div><small>/experience/moonshot · 카톡방 모집용 AI 직원 체험</small><h2>문샷 체험존 방문 분석</h2></div>
      <button type="button" onClick={() => setVersion(v => v + 1)} disabled={loading || !validPeriod}>새로고침</button>
    </header>
    <div className={s.period} role="group" aria-label="조회 기간">
      {presets.map(p => <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => choose(p.id)}>{p.label}</button>)}
      <label>시작<input type="date" value={from} max={to} onChange={e => { setPreset('custom'); setFrom(e.target.value); }}/></label>
      <label>종료<input type="date" value={to} min={from} max={today} onChange={e => { setPreset('custom'); setTo(e.target.value); }}/></label>
    </div>
    {loading ? <p role="status">체험존 방문을 집계하고 있어요…</p> : error ? <p role="alert" className={s.error}>{error}</p> : report && sum && <div>
      {report.truncated && <p className={s.notice} role="status"><strong>선택한 기간의 일부 기록만 표시합니다.</strong> 아래 수치는 처음 10만 건을 집계한 결과입니다. 전체 수치를 확인하려면 기간을 줄여 조회해 주세요.</p>}
      {!report.trackingEnabled && <p className={s.notice} role="status">지금은 수집이 꺼져 있어요. 「문샷 캠퍼스 행동」 탭에서 활동 수집을 켜면 기록이 쌓입니다. 아래는 이미 쌓인 기록입니다.</p>}
      <div className={s.cards}>
        {[
          ['방문', `${sum.sessions.toLocaleString()}회`, '체험 첫 화면을 연 횟수'],
          ['체험 시작', `${sum.started.toLocaleString()}회`, `방문의 ${pct(sum.started, sum.sessions)} · 상황 고르고 시작`],
          ['웰컴 라운지 도착', `${sum.lounge.toLocaleString()}회`, `방문의 ${pct(sum.lounge, sum.sessions)} · 끝까지 본 비율`],
          ['버튼 클릭', `${sum.clicks.toLocaleString()}회`, `방문당 ${sum.sessions ? (sum.clicks / sum.sessions).toFixed(1) : 0}회`],
          ['평균 머문 시간', duration(sum.avgSeconds), '방문 한 번 기준'],
        ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
      </div>

      <h3>어디서 나갔나요? <small>단계별 도달·이탈</small></h3>
      <div className={s.funnel}>{report.funnel.map((f, i) => {
        const prev = i ? report.funnel[i - 1].reached : f.reached;
        return <div key={f.station} className={s.funnelRow}>
          <span className={s.step}>{i + 1}. {f.label}</span>
          <Bar value={f.reached} max={report.funnel[0].reached || 1} tone={f.station === 7 ? 'good' : 'main'}/>
          <strong>{f.reached.toLocaleString()}회</strong>
          <small>{i ? `앞 단계의 ${pct(f.reached, prev)}` : '시작점'}{f.stoppedHere ? ` · 여기서 ${f.stoppedHere}회 나감` : ''}</small>
        </div>;
      })}</div>

      <h3>어떤 사람이 많이 왔나요? <small>첫 화면에서 고른 상황</small></h3>
      <div className={s.audiences}>{report.audiences.map(a => <div key={a.id} className={s.audienceRow}>
        <span className={s.step}>{a.label}</span>
        <Bar value={a.sessions} max={maxAudience} tone="soft"/>
        <strong>{a.sessions.toLocaleString()}회</strong>
        <small>선택의 {pct(a.sessions, audienceTotal)} · 라운지 도착 {pct(a.lounge, a.sessions)} · 평균 {duration(a.avgSeconds)}</small>
      </div>)}</div>

      <h3>날짜별 흐름</h3>
      <div className={s.scroll}><table><thead><tr><th>날짜</th><th>방문</th><th/><th>체험 시작</th><th>라운지 도착</th><th>도착률</th><th>클릭</th></tr></thead>
        <tbody>{[...report.daily].reverse().map(d => <tr key={d.date}><th>{d.date.slice(5).replace('-', '.')}</th><td>{d.sessions}</td><td className={s.cellBar}><Bar value={d.sessions} max={maxDaily}/></td><td>{d.started}</td><td>{d.lounge}</td><td>{pct(d.lounge, d.sessions)}</td><td>{d.clicks}</td></tr>)}</tbody></table></div>

      <h3>어떤 버튼이 많이 눌렸나요?</h3>
      <label className={s.filter}>단계<select value={stationFilter} onChange={e => setStationFilter(e.target.value)}><option value="all">전체</option>{ARRIVAL_STATIONS.map(st => <option key={st.station} value={st.station}>{st.label}</option>)}</select></label>
      {buttons.length ? <div className={s.scroll}><table><thead><tr><th>버튼</th><th>단계</th><th/><th>클릭</th><th>누른 방문</th></tr></thead>
        <tbody>{buttons.map(b => <tr key={b.station + b.label}><th>{b.label}</th><td>{stationLabel(b.station)}</td><td className={s.cellBar}><Bar value={b.count} max={maxButton} tone="soft"/></td><td>{b.count}</td><td>{b.sessions}</td></tr>)}</tbody></table></div>
        : <p className={s.empty}>선택한 기간·단계에 클릭 기록이 없어요.</p>}

      <h3>어디서 들어왔나요? <small>링크에 붙은 유입 표시(utm)</small></h3>
      {report.sources.length ? <div className={s.scroll}><table><thead><tr><th>유입</th><th>방문</th><th>라운지 도착</th><th>도착률</th></tr></thead>
        <tbody>{report.sources.map(x => <tr key={x.source}><th>{x.source}</th><td>{x.sessions}</td><td>{x.lounge}</td><td>{pct(x.lounge, x.sessions)}</td></tr>)}</tbody></table></div>
        : <p className={s.empty}>선택한 기간에 방문 기록이 없어요.</p>}
      <details className={s.help}><summary>지표 기준</summary><ul>
        <li>방문은 같은 브라우저 탭에서 체험을 연 한 번입니다. 사람 수와 다를 수 있어요.</li>
        <li>자정을 넘겨 이어진 방문은 여러 날을 함께 조회할 때 한 번만 세요. 버튼 클릭은 선택한 기간에 누른 횟수를 모두 더합니다.</li>
        <li>체험 시작은 첫 화면에서 상황을 고르고 「이 상황으로 시작」을 누른 방문입니다.</li>
        <li>이탈은 방문마다 가장 멀리 간 단계를 기준으로 셉니다.</li>
        <li>관리자 미리보기와 검수용 접속은 기록하지 않습니다. 이름·연락처 같은 개인정보는 남기지 않아요.</li>
      </ul></details>
    </div>}
  </section>;
}
