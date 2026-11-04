'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { purchaseBatchLimit, purchaseChannelLabels, purchaseChannels, purchaseRoomToken, purchaseTextBytes, purchaseTextLimits, type PurchaseChannel } from '@/lib/purchase-buyer-delivery';

type Buyer = { id: string; name: string; channels: PurchaseChannel[] };
type Template = { id: string; name: string; channel: PurchaseChannel; content: string; version: string };
type Batch = { id: string; channel: PurchaseChannel; subject: string | null; content: string; count: number; scheduled_at: string; status: string; accepted_count: number; failed_count: number; skipped_count: number; unknown_count: number; pending_count: number };
type Setup = { buyers: Buyer[]; templates: Template[]; channels: Record<PurchaseChannel, boolean>; history: Batch[] };
const statuses: Record<string, string> = { scheduled: '예약 대기', sending: '처리 중', completed: '처리 완료', failed: '발송 전 확인 필요', unknown: '결과 확인 필요', cancelled: '취소됨', partially_cancelled: '남은 대상 취소됨' };

export function PurchaseBuyerDelivery({ cohort, productId }: { cohort: string; productId?: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [channel, setChannel] = useState<PurchaseChannel>('sms');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const [templateId, setTemplateId] = useState('');
  const [roomLink, setRoomLink] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [at, setAt] = useState('');
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const requestId = useRef('');
  const requestBusy = useRef(false);
  const template = setup?.templates.find(row => row.id === templateId && row.channel === channel);
  const token = purchaseRoomToken(channel);
  const textChannel = channel === 'sms' || channel === 'lms' ? channel : null;
  const directText = Boolean(textChannel && !templateId);
  const textLimit = textChannel ? purchaseTextLimits[textChannel] : 0;
  const textBytes = directText ? purchaseTextBytes(textMessage.trim()) : 0;
  const needsRoom = Boolean(template?.content.includes(token));
  const available = setup?.buyers.filter(buyer => buyer.channels.includes(channel)) ?? [];
  const shown = available.filter(buyer => buyer.name.toLocaleLowerCase('ko').includes(search.trim().toLocaleLowerCase('ko')));
  const selectedIds = new Set(selected);
  const templateReturn = new URLSearchParams({ cohort });
  if (productId) templateReturn.set('product', productId);
  const templatesHref = '/admin/templates?' + new URLSearchParams({
    returnTo: '/admin/purchase-onboarding?' + templateReturn + '#buyer-delivery',
  });
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
  function chooseChannel(next: PurchaseChannel) {
    if (!(textChannel && (next === 'sms' || next === 'lms'))) setSelected([]);
    setChannel(next);
    setVisibleCount(100);
    setTemplateId('');
    edit();
  }
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
          templateId, templateVersion: template?.version, roomLink, subject, content: directText ? textMessage : content,
          scheduledAt: new Date(at).toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setNotice(cancel ? '아직 발송하지 않은 대상의 예약을 취소했습니다.' : '발송 예약을 저장했습니다.');
      edit();
      if (!cancel) setSelected([]);
      setReload(value => value + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : '예약 상태를 확인해 주세요.'); }
    finally { requestBusy.current = false; setBusy(false); }
  }

  return <section id="buyer-delivery" className="onboarding-panel onboarding-delivery">
    <h2>2. 구매자 공지 보내기</h2>
    <p>모집 마감 후 공지방을 정하고, 결제자 전체 또는 방별로 선택해 안내를 예약하세요.</p>
    <p className="meta">채널별로 예약할 수 있습니다. 문자는 바로 작성하거나 저장한 문구를 고르고, 알림톡은 승인된 문구를 사용합니다.</p>
    <div className="onboarding-actions">
      <Link className="btn" href={templatesHref}>메시지 템플릿 관리</Link>
      <button className="btn" type="button" disabled={busy} onClick={() => { edit(); setSelected([]); setSetup(null); setReload(value => value + 1); }}>대상·이력 새로고침</button>
    </div>
    {setup && <>
      <fieldset className="onboarding-admin-fields" disabled={busy}>
        <legend>발송 예약</legend>
        <label>채널<select value={channel} onChange={event => chooseChannel(event.target.value as PurchaseChannel)}>
          {purchaseChannels.map(item => <option key={item} value={item}>{purchaseChannelLabels[item]}{setup.channels[item] ? '' : ' · 설정 필요'}</option>)}
        </select></label>
        {!setup.channels[channel] && <p className="meta">현재 이 채널로 예약할 수 없습니다. 발송 설정을 확인해 주세요.</p>}
        {channel === 'email' ? <>
          <label>이메일 제목<input value={subject} maxLength={120} onChange={event => { setSubject(event.target.value); edit(); }} /></label>
          <label>이메일 내용<textarea rows={5} maxLength={4000} value={content} onChange={event => { setContent(event.target.value); edit(); }} /></label>
        </> : <>
          <label>정보성 메시지 템플릿<select value={templateId} onChange={event => { setTemplateId(event.target.value); edit(); }}>
            <option value="">{textChannel ? '직접 작성' : '승인된 템플릿 선택'}</option>
            {setup.templates.filter(item => item.channel === channel).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {directText && <>
            <label>문자 내용<textarea rows={5} maxLength={2000} value={textMessage} onChange={event => { setTextMessage(event.target.value); edit(); }} /></label>
            <p className="meta">{textBytes === null ? '이모지 등 문자 발송에서 지원하지 않는 문자를 지워 주세요.' : `${textBytes.toLocaleString('ko-KR')} / ${textLimit.toLocaleString('ko-KR')}바이트`}{textChannel === 'sms' && (textBytes ?? 0) > textLimit && ' · 더 긴 내용은 장문 문자를 선택해 주세요.'}</p>
            <p className="meta">수강·입장 안내처럼 결제자가 알아야 할 내용만 입력하세요. 링크도 본문에 붙여넣을 수 있습니다.</p>
          </>}
        </>}
        {needsRoom && <label>배정할 텔레그램 공지방 링크<input type="url" value={roomLink} maxLength={500} placeholder="https://t.me/+..." onChange={event => { setRoomLink(event.target.value); edit(); }} /></label>}
        <p aria-live="polite">전체 결제자 <strong>{setup.buyers.length.toLocaleString('ko-KR')}명</strong> · 발송 가능 <strong>{available.length.toLocaleString('ko-KR')}명</strong> · 선택 <strong>{selected.length.toLocaleString('ko-KR')}명</strong></p>
        <p className="meta">전체 결제자는 유효한 수강권이 있는 결제자 기준입니다. 미등록·중복 연락처는 발송 대상에서 제외합니다.</p>
        <label>구매자 이름 검색<input value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(100); }} /></label>
        <div className="onboarding-actions">
          <button className="btn" type="button" disabled={!available.length} onClick={() => { setSelected(available.map(buyer => buyer.id)); edit(); }}>발송 가능한 전체 선택</button>
          {search.trim() && <button className="btn" type="button" disabled={!shown.length} onClick={() => { setSelected(current => [...new Set([...current, ...shown.map(buyer => buyer.id)])]); edit(); }}>검색 결과 {shown.length.toLocaleString('ko-KR')}명 선택</button>}
          <button className="btn" type="button" disabled={!selected.length} onClick={() => { setSelected([]); edit(); }}>선택 해제</button>
        </div>
        {shown.length ? <div className="onboarding-recipient-list" aria-label="발송 대상">
          {shown.slice(0, visibleCount).map(buyer => <label key={buyer.id} className="onboarding-toggle"><input type="checkbox" checked={selectedIds.has(buyer.id)} onChange={event => {
            const checked = event.target.checked;
            setSelected(current => checked ? [...current, buyer.id] : current.filter(id => id !== buyer.id));
            edit();
          }} />{buyer.name} <small>· {buyer.id.slice(-6)}</small></label>)}
        </div> : <p className="meta">{search.trim() ? '검색에 맞는 구매자가 없습니다.' : '이 채널로 발송할 수 있는 구매자가 없습니다.'}</p>}
        {shown.length > visibleCount && <button className="btn" type="button" onClick={() => setVisibleCount(count => count + 100)}>구매자 더 보기 · {visibleCount.toLocaleString('ko-KR')} / {shown.length.toLocaleString('ko-KR')}명</button>}
        <label>발송 시각 (현재 기기 시간)<input type="datetime-local" value={at} onChange={event => { setAt(event.target.value); edit(); }} /></label>
        <button className="btn" type="button" disabled={!setup.channels[channel] || !selected.length || !at || (needsRoom && !roomLink.trim()) || (channel === 'email' ? !subject.trim() || !content.trim() : directText ? !textBytes || textBytes > textLimit : !template)}
          onClick={() => setReview(true)}>대상·문구 확인</button>
        {review && <section className="onboarding-delivery-review" aria-label="발송 예약 미리보기">
          <h3>{purchaseChannelLabels[channel]} · {selected.length}명</h3>
          <p>{new Date(at).toLocaleString('ko-KR')}</p>
          <details><summary>선택한 구매자 확인</summary><p>{available.filter(buyer => selectedIds.has(buyer.id)).map(buyer => buyer.name + ' · ' + buyer.id.slice(-6)).join(', ')}</p></details>
          {channel === 'email' && <strong>{subject}</strong>}
          <p className="onboarding-message-copy">{channel === 'email' ? content : directText ? textMessage.trim() : template?.content.replaceAll(token, roomLink.trim())}</p>
          <p className="meta">예약 시각에 결제와 수강권이 유효한 사람에게 발송합니다.{selected.length > purchaseBatchLimit && ' 대상이 많으면 여러 묶음으로 순차 발송합니다.'}</p>
          <button className="btn primary" type="button" onClick={() => void submit()}>확인한 내용으로 발송 예약</button>
        </section>}
      </fieldset>
      <h3>이 기수의 예약·발송 내역</h3>
      {!setup.history.length && <p>아직 예약 내역이 없습니다.</p>}
      {setup.history.map(batch => <details key={batch.id} className="onboarding-delivery-history">
        <summary>{purchaseChannelLabels[batch.channel]} · {batch.count}명 · {statuses[batch.status] ?? batch.status} · {new Date(batch.scheduled_at).toLocaleString('ko-KR')}</summary>
        {batch.subject && <p>{batch.subject}</p>}
        <p className="onboarding-message-copy">{batch.content}</p>
        <p>업체 접수 {batch.accepted_count} · 실패 {batch.failed_count} · 제외 {batch.skipped_count} · 확인 필요 {batch.unknown_count}</p>
        {(batch.pending_count > 0 || batch.status === 'scheduled') && <button className="btn" type="button" disabled={busy} onClick={() => void submit(batch.id)}>{batch.status === 'scheduled' ? '이 예약 취소' : `남은 ${batch.pending_count.toLocaleString('ko-KR')}명 취소`}</button>}
      </details>)}
    </>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>;
}
