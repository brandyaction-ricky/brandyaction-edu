'use client';
import { useEffect, useRef, useState } from 'react';
import { Award } from 'lucide-react';
import { DEFAULT_MVP_COLOR, mvpColor, mvpSelection, type MemberMvp, type MvpSettings } from '@/lib/member-mvp';
import { useUnsavedWarning } from '@/features/admin-ui/components/use-unsaved-warning';
import './member-mvp.css';
const endpoint = '/api/admin/member-mvp', changed = 'edu-member-mvp-changed';
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000), ...init });
  const data = await response.json(); if (!response.ok) throw Error(data.error || '우수 수강생 설정을 확인하지 못했습니다.'); return data;
}
export function MvpBadge({ color = DEFAULT_MVP_COLOR }: { color?: string }) {
  return <span className="member-mvp-badge" style={{ borderColor: mvpColor(color) }}><Award size={14} aria-hidden="true"/>우수 수강생</span>;
}
export function useMemberMvps(ids: string[], enabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true') {
  const key = enabled ? [...new Set(ids)].sort().join(',') : '';
  const [result, setResult] = useState<{ key: string; members: Record<string, MemberMvp>; color: string; error: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort(); const active = new AbortController(); controller = active;
      const timeout = setTimeout(() => active.abort(), 10_000), ids = key.split(',');
      const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
      void Promise.all(chunks.map(group => api(endpoint + '?members=' + group.join(','), { signal: active.signal })))
        .then(pages => { if (!active.signal.aborted) setResult({ key, members: Object.fromEntries(pages.flatMap(page => page.members.map((item: MemberMvp) => [item.member, item]))), color: mvpColor(pages[0].defaultColor), error: '' }); })
        .catch(cause => { if (controller === active) setResult({ key, members: {}, color: DEFAULT_MVP_COLOR, error: active.signal.aborted ? '우수 수강생 표시 조회 시간이 초과됐습니다.' : cause.message }); })
        .finally(() => clearTimeout(timeout));
    };
    refresh(); window.addEventListener(changed, refresh);
    return () => { const previous = controller; controller = null; previous?.abort(); window.removeEventListener(changed, refresh); };
  }, [key]);
  return result?.key === key ? result : { members: {} as Record<string, MemberMvp>, color: DEFAULT_MVP_COLOR, error: '' };
}
export function MvpEditor({ member, name = '회원' }: { member?: string; name?: string }) {
  const [stored, setStored] = useState<(MvpSettings | MemberMvp) | null>(null), [canManage, setCanManage] = useState(false);
  const [selected, setSelected] = useState(false), [custom, setCustom] = useState(false), [color, setColor] = useState(DEFAULT_MVP_COLOR), [defaultColor, setDefaultColor] = useState(DEFAULT_MVP_COLOR);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false), pending = useRef<Record<string, unknown> | null>(null);
  const colorValue = member ? selected && custom ? color.toUpperCase() : null : color.toUpperCase();
  const dirty = stored !== null && (stored.color !== colorValue || (!!member && 'isMvp' in stored && stored.isMvp !== selected));
  useUnsavedWarning(dirty || busy);
  function adopt(value: MvpSettings | MemberMvp, fallback: string) {
    setStored(value); setSelected('isMvp' in value ? value.isMvp : true); setCustom(value.color !== null); setColor(value.color || fallback); setDefaultColor(fallback);
  }
  useEffect(() => {
    let disposed = false; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    void api(endpoint + (member ? '?members=' + member : '?settings=true'), { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      const value = member ? data.members?.find((row: MemberMvp) => row.member === member) : data.settings;
      if (!value) throw Error('회원이 없거나 탈퇴한 회원입니다.');
      adopt(value, member ? mvpColor(data.defaultColor) : mvpColor(value.color)); setCanManage(data.canManage === true); setError('');
    }).catch(cause => { if (!disposed) setError(controller.signal.aborted ? '설정 조회 시간이 초과됐습니다.' : cause.message); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [member, attempt]);
  function reload() {
    if (inFlight.current || (dirty && !window.confirm('작성 중인 우수 수강생 설정을 버리고 다시 불러올까요?'))) return;
    setStored(null); setError(''); setStatus(''); pending.current = null; setAttempt(value => value + 1);
  }
  async function save() {
    if (!stored || !canManage || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const content = member ? { kind: 'member', member, ...mvpSelection(selected, colorValue) } : { kind: 'settings', color: mvpColor(color) };
      const same = pending.current && Object.entries(content).every(([key, value]) => pending.current![key] === value);
      const packet = same ? pending.current! : { ...content, expectedRevision: stored.revision, requestId: crypto.randomUUID() }; pending.current = packet;
      const data = await api(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet) });
      adopt(data.value, member ? defaultColor : data.value.color); pending.current = null;
      setStatus(member ? data.value.isMvp ? '우수 수강생으로 저장했습니다.' : '우수 수강생 표시를 해제했습니다.' : '기본 색상을 저장했습니다.'); window.dispatchEvent(new Event(changed));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '설정을 저장하지 못했습니다.'); } finally { inFlight.current = false; setBusy(false); }
  }
  const previewColor = /^#[0-9a-f]{6}$/i.test(color) && (!member || custom) ? color : defaultColor;
  return <section className="panel pad member-mvp-editor" aria-label={member ? '우수 수강생 설정' : '우수 수강생 기본 색상'}>
    <h3>{member ? '우수 수강생 표시' : '우수 수강생 기본 색상'}</h3><p className="meta">{member ? '관리자가 직접 선정합니다. 선정해도 수강권·회원 권한·결제 혜택은 바뀌지 않습니다.' : '개인 색상을 따로 정하지 않은 우수 수강생에게 적용됩니다.'}</p>
    {stored && <div className="member-mvp-preview"><span className="avatar" style={selected ? { border: `3px solid ${previewColor}` } : undefined}>{name.slice(0, 1)}</span><span>{name}</span>{selected && <MvpBadge color={previewColor}/>}</div>}
    {stored && canManage && <fieldset disabled={busy} className="member-mvp-fields">
      {member && <><label className="checkline"><input type="checkbox" checked={selected} onChange={event => setSelected(event.target.checked)}/>우수 수강생으로 선정</label><label className="checkline"><input type="checkbox" checked={custom} disabled={!selected} onChange={event => setCustom(event.target.checked)}/>개인 표시 색상 사용</label></>}
      <div className="member-mvp-colors"><label className="field"><span>표시 색상</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_MVP_COLOR} disabled={!!member && (!selected || !custom)} onChange={event => setColor(event.target.value)}/></label><label className="field"><span>색상 코드</span><input maxLength={7} value={color} disabled={!!member && (!selected || !custom)} onChange={event => setColor(event.target.value)}/></label></div>
    </fieldset>}
    {stored && !canManage && <p className="meta">선정·해제와 색상 변경은 관리자만 할 수 있습니다.</p>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{!stored && !error && <p role="status">설정을 불러오는 중입니다.</p>}
    <div className="member-mvp-actions">{canManage && <button className="btn primary small" type="button" disabled={!stored || busy || !dirty} onClick={() => void save()}>{busy ? '저장 중…' : member ? '우수 수강생 저장' : '기본 색상 저장'}</button>}<button type="button" className="btn small" disabled={busy || (!stored && !error)} onClick={reload}>저장된 설정 다시 불러오기</button></div>
  </section>;
}
