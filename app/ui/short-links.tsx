'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Copy } from 'lucide-react';
import {
  AdminAlert, AdminButton, AdminDataTable, AdminDialogBody, AdminDialogFooter, AdminEmptyState, AdminErrorState,
  AdminGrid, AdminInput, AdminLoadingState, AdminModal, AdminSection, AdminStatusBadge, AdminSummaryCard,
} from '@/features/admin-ui';
import type { ShortLink } from '@/lib/short-links';

const api = '/api/admin/short-links';
async function call(method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const response = await fetch(api, { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || '단축 링크를 처리하지 못했어요.');
  return json;
}
const count = (value: number) => value.toLocaleString('ko-KR');
const when = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '아직 없음';
const short = (url: string) => url.replace(/^https:\/\//, '');
const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => true, () => false);

export function ShortLinks() {
  const [items, setItems] = useState<ShortLink[] | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false), [retry, setRetry] = useState(0), [editing, setEditing] = useState<ShortLink | null>(null);
  const [made, setMade] = useState<ShortLink | null>(null);
  useEffect(() => { call('GET').then(json => setItems(json.items), e => setError(e.message)); }, [retry]);

  const run = async (method: 'POST' | 'PATCH', body: unknown, done: string) => {
    setPending(true); setMessage(null);
    try {
      const { item, created } = await call(method, body) as { item: ShortLink; created?: boolean };
      setItems(list => list?.some(l => l.key === item.key) ? list.map(l => l.key === item.key ? item : l) : [item, ...(list || [])]);
      setMessage({ tone: 'success', text: created === false ? '같은 주소로 이미 만든 단축 링크예요. 그 주소를 그대로 쓰면 됩니다.' : done }); return { item, created };
    } catch (e) { setMessage({ tone: 'error', text: (e as Error).message }); return null; }
    finally { setPending(false); }
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, result = await run('POST', Object.fromEntries(new FormData(form)), '단축 링크를 만들었어요.');
    if (!result) return;
    form.reset(); setMade(result.item);
    if (await copyText(result.item.url)) setMessage({ tone: 'success', text: `${result.created === false ? '같은 주소로 이미 만든 단축 링크예요.' : '단축 링크를 만들었어요.'} 주소를 복사해 두었으니 바로 붙여 넣으면 됩니다.` });
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await run('PATCH', { key: editing!.key, ...Object.fromEntries(new FormData(event.currentTarget)) }, '바꿨어요. 이 주소를 누르면 이제 새 도착지로 갑니다.')) setEditing(null);
  };
  const toggle = (link: ShortLink) => {
    if (link.active && !window.confirm(`「${link.label || short(link.url)}」 링크를 끌까요? 끄는 동안 이 주소를 누른 사람은 사이트 첫 화면으로 갑니다.`)) return;
    void run('PATCH', { key: link.key, active: !link.active }, link.active ? '링크를 껐어요.' : '링크를 다시 켰어요.');
  };
  const copy = async (link: ShortLink) => setMessage(await copyText(link.url)
    ? { tone: 'success', text: '주소를 복사했어요.' } : { tone: 'error', text: '복사하지 못했어요. 주소를 직접 선택해 복사하세요.' });

  if (error) return <AdminErrorState title="단축 링크를 불러오지 못했어요." onRetry={() => { setError(''); setRetry(retry + 1); }}>{error}</AdminErrorState>;
  if (!items) return <AdminLoadingState title="단축 링크를 불러오는 중이에요." />;
  const channels = [...new Set(items.map(l => l.channel).filter(Boolean))];
  return <>
    {message && <AdminAlert tone={message.tone}>{message.text}</AdminAlert>}
    <AdminSection bordered title="단축 링크 만들기" description="UTM 링크나 사이트 주소를 짧게 줄여요. 만든 뒤에도 도착지만 바꿀 수 있어서 고정 링크로도 씁니다.">
      <form onSubmit={create}>
        <AdminInput name="target" label="줄일 주소" required type="url" maxLength={2000} placeholder="https://" helper="https:// 로 시작하는 전체 주소를 붙여 넣으세요. UTM이 붙은 긴 주소도 됩니다." />
        <div style={{ marginTop: 12 }}><AdminGrid columns={3}>
          <AdminInput name="label" label="이름 (선택)" maxLength={80} placeholder="예: 무료 강의 카톡방" helper="목록에서 알아볼 이름이에요." />
          <AdminInput name="channel" label="쓰는 곳 (선택)" maxLength={40} list="short-link-channels" placeholder="예: 유튜브, 인스타, 카톡" helper="적으면 쓰는 곳별 클릭 수를 모아 봐요." />
          <datalist id="short-link-channels">{channels.map(c => <option key={c} value={c} />)}</datalist>
          <AdminInput name="key" label="주소 끝부분 (선택)" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{0,38}[a-z0-9]" placeholder="예: free-class" helper="비우면 짧은 글자를 자동으로 붙여요. 영어 소문자·숫자·- 만 됩니다." />
        </AdminGrid></div>
        <div style={{ marginTop: 16 }}><AdminButton type="submit" variant="primary" loading={pending} disabled={pending}>단축 링크 만들기</AdminButton></div>
      </form>
      {made && <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>{short(made.url)}</strong>
        <AdminButton size="sm" variant="outline" onClick={() => copy(made)}><Copy size={14} aria-hidden="true" />복사</AdminButton>
        <small className="meta" style={{ wordBreak: 'break-all' }}>→ {made.target}</small>
      </div>}
    </AdminSection>
    {channels.length > 0 && <AdminGrid columns={Math.min(channels.length, 4)}>
      {channels.map(c => { const links = items.filter(l => l.channel === c); return <AdminSummaryCard key={c} label={c} value={`클릭 ${count(links.reduce((sum, l) => sum + l.clicks, 0))}회`} note={`링크 ${links.length}개`} compact />; })}
    </AdminGrid>}
    <AdminDataTable<ShortLink> label="단축 링크 목록" rows={items} getRowId={l => l.key} rowLabel={l => l.label || short(l.url)}
      empty={<AdminEmptyState title="아직 만든 단축 링크가 없어요." />}
      columns={[
        { id: 'url', header: '단축 주소', render: l => <div><AdminButton size="sm" variant="ghost" onClick={() => copy(l)} title="주소 복사"><Copy size={14} aria-hidden="true" />{short(l.url)}</AdminButton> {!l.active && <AdminStatusBadge status="paused" label="꺼짐" />}
          {(l.label || l.channel) && <small className="meta" style={{ display: 'block' }}>{[l.label, l.channel].filter(Boolean).join(' · ')}</small>}</div> },
        { id: 'target', header: '지금 도착지', render: l => <a href={l.target} target="_blank" rel="noopener noreferrer" title={l.target} style={{ display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.target}</a> },
        { id: 'clicks', header: '클릭', align: 'number', sortable: true, value: l => l.clicks, render: l => <div>{count(l.clicks)}회<small className="meta" style={{ display: 'block' }}>마지막 {when(l.lastClickedAt)}</small></div> },
        { id: 'action', header: '관리', align: 'action', render: l => <div style={{ display: 'flex', gap: 6 }}>
          <AdminButton size="sm" variant="outline" disabled={pending} onClick={() => { setMessage(null); setEditing(l); }}>도착지 바꾸기</AdminButton>
          <AdminButton size="sm" variant={l.active ? 'ghost' : 'outline'} disabled={pending} onClick={() => toggle(l)}>{l.active ? '끄기' : '켜기'}</AdminButton>
        </div> },
      ]} />
    <p className="meta">클릭은 사람이 실제로 누른 횟수예요. 카톡 미리보기·검색 로봇은 세지 않아요. 같은 사람이 여러 번 누르면 여러 번 셉니다.</p>
    {editing && <AdminModal title="도착지 바꾸기" onClose={() => setEditing(null)}>
      <form onSubmit={save}>
        <AdminDialogBody>
          <p>단축 주소 <strong>{editing.url}</strong> 는 그대로예요. 누르면 갈 곳만 바뀝니다.</p>
          <AdminInput name="target" label="새 도착 주소" required type="url" maxLength={2000} defaultValue={editing.target} />
          <AdminInput name="label" label="이름 (선택)" maxLength={80} defaultValue={editing.label} />
          <AdminInput name="channel" label="쓰는 곳 (선택)" maxLength={40} list="short-link-channels" defaultValue={editing.channel} />
        </AdminDialogBody>
        <AdminDialogFooter><AdminButton onClick={() => setEditing(null)}>취소</AdminButton><AdminButton type="submit" variant="primary" loading={pending} disabled={pending}>저장하기</AdminButton></AdminDialogFooter>
      </form>
    </AdminModal>}
  </>;
}
