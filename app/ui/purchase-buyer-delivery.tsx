'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { purchaseBatchLimit, purchaseChannelLabels, purchaseChannels, purchaseRoomToken, type PurchaseChannel } from '@/lib/purchase-buyer-delivery';

type Buyer = { id: string; name: string; channels: PurchaseChannel[] };
type Template = { id: string; name: string; channel: PurchaseChannel; content: string; version: string };
type Batch = { id: string; channel: PurchaseChannel; subject: string | null; content: string; count: number; scheduled_at: string; status: string; accepted_count: number; failed_count: number; skipped_count: number; unknown_count: number };
type Setup = { buyers: Buyer[]; templates: Template[]; channels: Record<PurchaseChannel, boolean>; history: Batch[] };
const statuses: Record<string, string> = { scheduled: '예약 대기', sending: '처리 중', completed: '처리 완료', failed: '발송 전 확인 필요', unknown: '결과 확인 필요', cancelled: '취소됨' };

export function PurchaseBuyerDelivery({ cohort }: { cohort: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [channel, setChannel] = useState<PurchaseChannel>('sms');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roomLink, setRoomLink] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [at, setAt] = useState('');
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const requestId = useRef('');
  const requestBusy = useRef(false);
  const template = setup?.templates.find(row => row.id === templateId && row.channel === channel);
  const token = purchaseRoomToken(channel);
  const needsRoom = Boolean(template?.content.includes(token));
  const available = setup?.buyers.filter(buyer => buyer.channels.includes(channel)) ?? [];
  const shown = available.filter(buyer => buyer.name.toLocaleLowerCase('ko').includes(search.trim().toLocaleLowerCase('ko')));
  const endpoint = '/api/admin/purchase-onboarding/delivery';

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint + '?cohort=' + encodeURIComponent(cohort), { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw Error(result?.error || '구매자와 발송 내역을 불러오지 못했습니다.');
        if (!controller.signal.aborted) setSetup(result);
      }).catch(error => { if (!controller.signal.aborted) setNotice(error.message); });
    return () => controller.abort();
  }, [cohort, reload]);

  function edit() { setReview(false); requestId.current = ''; }
  async function submit(cancel?: string) {
    if (requestBusy.current) return;
    if (!cancel && !requestId.current) requestId.current = crypto.randomUUID();
    requestBusy.current = true;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cancel ? { action: 'cancel', cohort, id: cancel } : {
          action: 'schedule', cohort, id: requestId.current, channel, recipients: selected,
          templateId, templateVersion: template?.version, roomLink, subject, content,
          scheduledAt: new Date(at).toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setNotice(cancel ? '예약을 취소했습니다.' : '발송 예약을 저장했습니다.');
      edit();
      if (!cancel) setSelected([]);
      setReload(value => value + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : '예약 상태를 확인해 주세요.'); }
    finally { requestBusy.current = false; setBusy(false); }
  }

  return <section id="buyer-delivery" className="onboarding-panel onboarding-delivery">
    <h2>2. 구매자 공지 보내기</h2>
    <p>모집 마감 후 공지방을 정하고, 결제자 전체 또는 방별로 선택해 안내를 예약하세요.</p>
    <p className="meta">선택한 채널로 예약 한 건을 만듭니다. 채널별로 따로 예약할 수 있습니다. 문자·알림톡 문구는 메시지 템플릿에서 관리합니다.</p>
    <div className="onboarding-actions">
      <Link className="btn" href="/admin/templates">메시지 템플릿 관리</Link>
      <button className="btn" type="button" disabled={busy} onClick={() => { edit(); setSelected([]); setSetup(null); setReload(value => value + 1); }}>대상·이력 새로고침</button>
    </div>
    {setup && <>
      <fieldset className="onboarding-admin-fields" disabled={busy}>
        <legend>발송 예약</legend>
        <label>채널<select value={channel} onChange={event => { setChannel(event.target.value as PurchaseChannel); setSelected([]); setTemplateId(''); edit(); }}>
          {purchaseChannels.map(item => <option key={item} value={item}>{purchaseChannelLabels[item]}{setup.channels[item] ? '' : ' · 설정 필요'}</option>)}
        </select></label>
        {!setup.channels[channel] && <p className="meta">현재 이 채널로 예약할 수 없습니다. 발송 설정을 확인해 주세요.</p>}
        {channel === 'email' ? <>
          <label>이메일 제목<input value={subject} maxLength={120} onChange={event => { setSubject(event.target.value); edit(); }} /></label>
          <label>이메일 내용<textarea rows={5} maxLength={4000} value={content} onChange={event => { setContent(event.target.value); edit(); }} /></label>
        </> : <label>정보성 메시지 템플릿<select value={templateId} onChange={event => { setTemplateId(event.target.value); edit(); }}>
          <option value="">템플릿 선택</option>
          {setup.templates.filter(item => item.channel === channel).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {needsRoom && <label>배정할 텔레그램 공지방 링크<input type="url" value={roomLink} maxLength={500} placeholder="https://t.me/+..." onChange={event => { setRoomLink(event.target.value); edit(); }} /></label>}
        <p>결제 확인 {setup.buyers.length}명 · 채널 발송 가능 {available.length}명 · 선택 {selected.length}명</p>
        <p className="meta">연락처가 없거나 같은 연락처를 여러 구매자가 공유하면 대상에서 제외합니다. 한 예약은 최대 {purchaseBatchLimit}명입니다.</p>
        <label>구매자 이름 검색<input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="onboarding-actions">
          <button className="btn" type="button" disabled={!available.length || available.length > purchaseBatchLimit} onClick={() => { setSelected(available.map(buyer => buyer.id)); edit(); }}>발송 가능한 전체 선택</button>
          <button className="btn" type="button" onClick={() => { setSelected([]); edit(); }}>선택 해제</button>
        </div>
        {shown.length > 0 && <div className="onboarding-recipient-list" aria-label="발송 대상">
          {shown.map(buyer => <label key={buyer.id} className="onboarding-toggle"><input type="checkbox" checked={selected.includes(buyer.id)} disabled={selected.length >= purchaseBatchLimit && !selected.includes(buyer.id)} onChange={event => {
            setSelected(current => event.target.checked ? [...current, buyer.id] : current.filter(id => id !== buyer.id));
            edit();
          }} />{buyer.name} <small>· {buyer.id.slice(-6)}</small></label>)}
        </div>}
        <label>발송 시각 (현재 기기 시간)<input type="datetime-local" value={at} onChange={event => { setAt(event.target.value); edit(); }} /></label>
        <button className="btn" type="button" disabled={!setup.channels[channel] || !selected.length || !at || (needsRoom && !roomLink.trim()) || (channel === 'email' ? !subject.trim() || !content.trim() : !template)}
          onClick={() => setReview(true)}>대상·문구 확인</button>
        {review && <div className="onboarding-delivery-review">
          <h3>{purchaseChannelLabels[channel]} · {selected.length}명</h3>
          <p>{new Date(at).toLocaleString('ko-KR')}</p>
          <details><summary>선택한 구매자 확인</summary><p>{available.filter(buyer => selected.includes(buyer.id)).map(buyer => buyer.name + ' · ' + buyer.id.slice(-6)).join(', ')}</p></details>
          {channel === 'email' && <strong>{subject}</strong>}
          <p className="onboarding-message-copy">{channel === 'email' ? content : template?.content.replaceAll(token, roomLink.trim())}</p>
          <p className="meta">예약 시각에 결제와 수강권이 유효한 사람에게 발송합니다.</p>
          <button className="btn primary" type="button" onClick={() => void submit()}>확인한 내용으로 발송 예약</button>
        </div>}
      </fieldset>
      <h3>이 기수의 예약·발송 내역</h3>
      {!setup.history.length && <p>아직 예약 내역이 없습니다.</p>}
      {setup.history.map(batch => <details key={batch.id} className="onboarding-delivery-history">
        <summary>{purchaseChannelLabels[batch.channel]} · {batch.count}명 · {statuses[batch.status] ?? batch.status} · {new Date(batch.scheduled_at).toLocaleString('ko-KR')}</summary>
        {batch.subject && <p>{batch.subject}</p>}
        <p className="onboarding-message-copy">{batch.content}</p>
        <p>업체 접수 {batch.accepted_count} · 실패 {batch.failed_count} · 제외 {batch.skipped_count} · 확인 필요 {batch.unknown_count}</p>
        {batch.status === 'scheduled' && <button className="btn" type="button" disabled={busy} onClick={() => void submit(batch.id)}>이 예약 취소</button>}
      </details>)}
    </>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>;
}
