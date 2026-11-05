'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { purchaseBatchLimit, purchaseChannelLabels, purchaseChannels, purchaseHistoryChannel, purchaseRoomToken, purchaseTextBytes, purchaseTextLimits, type PurchaseChannel, type PurchaseDeliveryHistory } from '@/lib/purchase-buyer-delivery';

type Buyer = { id: string; name: string; channels: PurchaseChannel[]; delivery?: PurchaseDeliveryHistory };
type RecipientFilter = 'ready' | 'accepted' | 'pending' | 'all';
type Template = { id: string; name: string; channel: PurchaseChannel; content: string; version: string };
type Batch = { id: string; channel: PurchaseChannel; subject: string | null; content: string; count: number; scheduled_at: string; status: string; accepted_count: number; failed_count: number; skipped_count: number; unknown_count: number; pending_count: number };
type Setup = { buyers: Buyer[]; templates: Template[]; channels: Record<PurchaseChannel, boolean>; history: Batch[] };
const statuses: Record<string, string> = { scheduled: '예약 대기', sending: '처리 중', completed: '처리 완료', failed: '발송 전 확인 필요', unknown: '결과 확인 필요', cancelled: '취소됨', partially_cancelled: '남은 대상 취소됨' };
const templateChannels = ['sms', 'lms', 'alimtalk'] as const;

export function PurchaseBuyerDelivery({ cohort, productId }: { cohort: string; productId?: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [channel, setChannel] = useState<PurchaseChannel>('sms');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('ready');
  const [customCount, setCustomCount] = useState('');
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
  const [guideOpen, setGuideOpen] = useState(false);
  const requestId = useRef('');
  const requestBusy = useRef(false);
  const template = setup?.templates.find(row => row.id === templateId && row.channel === channel);
  const templateGroups = templateChannels.map(templateChannel => ({
    channel: templateChannel,
    templates: setup?.templates.filter(row => row.channel === templateChannel) ?? [],
  })).filter(group => group.templates.length > 0);
  const token = purchaseRoomToken(channel);
  const textChannel = channel === 'sms' || channel === 'lms' ? channel : null;
  const directText = Boolean(textChannel && !template);
  const textLimit = textChannel ? purchaseTextLimits[textChannel] : 0;
  const textBytes = directText ? purchaseTextBytes(textMessage.trim()) : 0;
  const needsRoom = Boolean(template?.content.includes(token));
  const recipients = setup?.buyers.map(buyer => {
    const { accepted, pending, uncertain } = buyer.delivery?.[purchaseHistoryChannel(channel)] ?? {};
    const reachable = buyer.channels.includes(channel);
    return { ...buyer, accepted, pending, uncertain, reachable, selectable: reachable && !pending && !uncertain };
  }) ?? [];
  const ready = recipients.filter(buyer => buyer.selectable && !buyer.accepted);
  const accepted = recipients.filter(buyer => buyer.accepted);
  const pending = recipients.filter(buyer => buyer.pending || buyer.uncertain);
  const availableCount = recipients.filter(buyer => buyer.selectable).length;
  const filtered = { ready, accepted, pending, all: recipients }[recipientFilter];
  const query = search.trim().toLocaleLowerCase('ko');
  const shown = filtered.filter(buyer => buyer.name.toLocaleLowerCase('ko').includes(query));
  const selectable = shown.filter(buyer => buyer.selectable);
  const requestedCount = Number(customCount);
  const validCustomCount = Number.isInteger(requestedCount) && requestedCount > 0 && requestedCount <= selectable.length;
  const selectedIds = new Set(selected);
  const selectedPreviouslySent = accepted.filter(buyer => selectedIds.has(buyer.id)).length;
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
  function chooseChannel(next: PurchaseChannel, nextTemplateId = '') {
    if (purchaseHistoryChannel(next) !== purchaseHistoryChannel(channel)) {
      setSelected([]);
      setRecipientFilter('ready');
    }
    setChannel(next);
    setVisibleCount(100);
    setTemplateId(nextTemplateId);
    edit();
  }
  function chooseRecipientFilter(next: RecipientFilter) {
    setRecipientFilter(next);
    setSelected([]);
    setVisibleCount(100);
    edit();
  }
  function chooseCount(count: number) {
    setSelected(selectable.slice(0, count).map(buyer => buyer.id));
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
          templateId: template?.id ?? '', templateVersion: template?.version, roomLink, subject, content: directText ? textMessage : content,
          scheduledAt: new Date(at).toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setNotice(cancel ? '아직 발송하지 않은 대상의 예약을 취소했습니다.' : '발송 예약을 저장했습니다.');
      edit();
      setSelected([]);
      setSetup(null);
      setReload(value => value + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : '예약 상태를 확인해 주세요.'); }
    finally { requestBusy.current = false; setBusy(false); }
  }

  return <div className="onboarding-delivery-layout">
    <aside className="onboarding-delivery-guide" aria-labelledby="buyer-delivery-guide-title">
      <div className="onboarding-delivery-guide-heading">
        <div>
          <p className="onboarding-delivery-guide-eyebrow">옆에서 보는 사용 안내</p>
          <h2 id="buyer-delivery-guide-title">두 방으로 나눠 보내기</h2>
        </div>
        <button className="btn onboarding-delivery-guide-toggle" type="button" aria-expanded={guideOpen} aria-controls="buyer-delivery-guide-content" onClick={() => setGuideOpen(open => !open)}>{guideOpen ? '안내 접기' : '안내 보기'}</button>
      </div>
      <div id="buyer-delivery-guide-content" className="onboarding-delivery-guide-content" data-open={guideOpen}>
        <p className="onboarding-delivery-guide-intro">같은 기수 · 서로 다른 링크 · 예약 2건</p>
        <ol>
          <li><strong>기수와 알림톡 선택</strong><p>위에서 안내할 기수를 고르고, ‘저장한 문자·알림톡 불러오기’에서 승인된 공지방 안내를 선택하세요.</p></li>
          <li><strong>첫 번째 그룹 예약</strong><p>구매자 검색을 비우고 ‘미발송’에서 ‘절반 선택’을 누르세요. 첫 번째 방 링크와 발송 시각을 입력한 뒤 ‘대상·문구 확인’ → ‘확인한 내용으로 발송 예약’을 누르세요.</p></li>
          <li><strong>저장 완료 후 새로고침</strong><p>‘발송 예약을 저장했습니다.’가 표시되면 ‘대상·이력 새로고침’을 누르세요.</p></li>
          <li><strong>남은 인원은 두 번째 방으로</strong><p>‘미발송’에서 ‘발송 가능한 전체 선택’을 누르세요. 두 번째 방 링크로 바꾼 뒤 발송 시각을 입력하고 다시 확인·예약하세요.</p></li>
          <li><strong>예약 두 건 확인</strong><p>아래 ‘이 기수의 예약·발송 내역’을 펼쳐 각 예약의 인원·방 링크·발송 시각을 확인하세요.</p></li>
        </ol>
        <p className="onboarding-delivery-guide-note">‘미발송’에서는 이미 발송했거나 예약·결과 확인 중인 인원이 제외됩니다. 두 그룹의 발송 시각은 같아도 됩니다.</p>
      </div>
    </aside>
    <section id="buyer-delivery" className="onboarding-panel onboarding-delivery">
    <h2>2. 구매자 공지 보내기</h2>
    <p>모집 마감 후 공지방을 정하고, 결제자 전체 또는 방별로 선택해 안내를 예약하세요.</p>
    <div className="onboarding-actions">
      <Link className="btn" href={templatesHref}>메시지 템플릿 관리</Link>
      <button className="btn" type="button" disabled={busy} onClick={() => { edit(); setSelected([]); setSetup(null); setReload(value => value + 1); }}>대상·이력 새로고침</button>
    </div>
    {setup && <>
      <fieldset className="onboarding-admin-fields" disabled={busy}>
        <legend>발송 예약</legend>
        <div className="onboarding-template-picker">
          <label>저장한 문자·알림톡 불러오기<select value={template?.id ?? ''} aria-describedby="buyer-template-help" disabled={!templateGroups.length} onChange={event => {
            const picked = setup.templates.find(item => item.id === event.target.value);
            chooseChannel(picked?.channel ?? channel, picked?.id);
          }}>
            <option value="">{templateGroups.length ? '저장한 문구를 선택하세요' : '저장된 문자·알림톡이 없습니다'}</option>
            {templateGroups.map(group => <optgroup key={group.channel} label={group.channel === 'alimtalk' ? '승인된 카카오 알림톡' : purchaseChannelLabels[group.channel]}>
              {group.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </optgroup>)}
          </select></label>
          <p className="meta" id="buyer-template-help">{templateGroups.length ? '문구를 고르면 발송 채널이 자동으로 바뀝니다. 문자와 이메일은 아래에서 직접 작성할 수도 있어요.' : '위의 메시지 템플릿 관리에서 문구를 등록하면 여기에 표시됩니다.'}</p>
        </div>
        <label>채널<select value={channel} onChange={event => chooseChannel(event.target.value as PurchaseChannel)}>
          {purchaseChannels.map(item => <option key={item} value={item}>{purchaseChannelLabels[item]}{setup.channels[item] ? '' : ' · 설정 필요'}</option>)}
        </select></label>
        {!setup.channels[channel] && <p className="meta">현재 이 채널로 예약할 수 없습니다. 발송 설정을 확인해 주세요.</p>}
        {channel === 'email' ? <>
          <label>이메일 제목<input value={subject} maxLength={120} onChange={event => { setSubject(event.target.value); edit(); }} /></label>
          <label>이메일 내용<textarea rows={5} maxLength={4000} value={content} onChange={event => { setContent(event.target.value); edit(); }} /></label>
        </> : directText && <>
          <label>문자 내용<textarea rows={5} maxLength={2000} value={textMessage} onChange={event => { setTextMessage(event.target.value); edit(); }} /></label>
          <p className="meta">{textBytes === null ? '이모지 등 문자 발송에서 지원하지 않는 문자를 지워 주세요.' : `${textBytes.toLocaleString('ko-KR')} / ${textLimit.toLocaleString('ko-KR')}바이트`}{textChannel === 'sms' && (textBytes ?? 0) > textLimit && ' · 더 긴 내용은 장문 문자를 선택해 주세요.'}</p>
          <p className="meta">수강·입장 안내처럼 결제자가 알아야 할 내용만 입력하세요. 링크도 본문에 붙여넣을 수 있습니다.</p>
        </>}
        {channel === 'alimtalk' && !template && <p className="meta">{templateGroups.some(group => group.channel === 'alimtalk') ? '위에서 승인된 카카오 알림톡 문구를 선택해 주세요.' : '사용할 수 있는 승인된 알림톡 문구가 없습니다. 위의 메시지 템플릿 관리에서 등록 상태를 확인해 주세요.'}</p>}
        {needsRoom && <label>배정할 텔레그램 공지방 링크<input type="url" value={roomLink} maxLength={500} placeholder="https://t.me/+..." onChange={event => { setRoomLink(event.target.value); edit(); }} /></label>}
        {template && <div className="onboarding-template-preview" role="region" aria-label="선택한 문구">
          <strong>선택한 문구</strong>
          <p className="onboarding-message-copy">{needsRoom ? template.content.replaceAll(token, roomLink.trim() || '[입력한 텔레그램 링크]') : template.content}</p>
        </div>}
        <p aria-live="polite">전체 결제자 <strong>{setup.buyers.length.toLocaleString('ko-KR')}명</strong> · 발송 가능 <strong>{availableCount.toLocaleString('ko-KR')}명</strong> · 선택 <strong>{selected.length.toLocaleString('ko-KR')}명</strong></p>
        <label>발송 이력<select value={recipientFilter} onChange={event => chooseRecipientFilter(event.target.value as RecipientFilter)}>
          <option value="ready">미발송 · {ready.length.toLocaleString('ko-KR')}명</option>
          <option value="accepted">발송 접수됨 · {accepted.length.toLocaleString('ko-KR')}명</option>
          <option value="pending">예약·확인 필요 · {pending.length.toLocaleString('ko-KR')}명</option>
          <option value="all">전체 결제자 · {recipients.length.toLocaleString('ko-KR')}명</option>
        </select></label>
        <p className="meta">선택한 채널의 구매자 공지 이력입니다. 문자와 장문 문자는 같은 이력으로 표시합니다. ‘발송 접수됨’은 발송 업체가 접수한 상태입니다.</p>
        <label>구매자 이름 검색<input value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(100); }} /></label>
        <div className="onboarding-recipient-actions" aria-label="빠른 인원 선택" role="group">
          <button className="btn" type="button" disabled={!selectable.length} onClick={() => chooseCount(selectable.length)}>발송 가능한 전체 선택</button>
          <button className="btn" type="button" disabled={!selectable.length} onClick={() => chooseCount(Math.ceil(selectable.length / 2))}>절반 선택</button>
          <button className="btn" type="button" disabled={!selectable.length} onClick={() => chooseCount(50)}>50명 선택</button>
          {query && <button className="btn" type="button" disabled={!selectable.length} onClick={() => { setSelected(current => [...new Set([...current, ...selectable.map(buyer => buyer.id)])]); edit(); }}>검색 결과 {selectable.length.toLocaleString('ko-KR')}명 선택</button>}
          <button className="btn" type="button" disabled={!selected.length} onClick={() => { setSelected([]); edit(); }}>선택 해제</button>
        </div>
        <div className="onboarding-recipient-actions">
          <label>선택할 인원<input type="number" min={1} max={selectable.length || 1} step={1} value={customCount} onChange={event => setCustomCount(event.target.value)} /></label>
          <button className="btn" type="button" disabled={!validCustomCount} onClick={() => chooseCount(requestedCount)}>입력한 인원 선택</button>
        </div>
        <p className="meta">빠른 선택은 현재 보기와 검색에 맞는 대상의 위에서부터 적용됩니다. 50명보다 적으면 가능한 전원을 선택합니다.</p>
        {shown.length ? <div className="onboarding-recipient-list" aria-label="발송 대상">
          {shown.slice(0, visibleCount).map(buyer => <label key={buyer.id} className="onboarding-toggle"><input type="checkbox" disabled={!buyer.selectable} checked={selectedIds.has(buyer.id)} onChange={event => {
            const checked = event.target.checked;
            setSelected(current => checked ? [...current, buyer.id] : current.filter(id => id !== buyer.id));
            edit();
          }} /><span>{buyer.name} <small>· {buyer.id.slice(-6)}</small></span><span className="onboarding-recipient-status">
            {buyer.accepted && <small data-status="accepted">발송 접수됨</small>}
            {buyer.pending ? <small data-status="pending">예약·처리 중</small> : buyer.uncertain && <small data-status="uncertain">결과 확인 필요</small>}
            {!buyer.reachable && <small>연락처 미등록·중복</small>}
          </span></label>)}
        </div> : <p className="meta">{query ? '검색에 맞는 구매자가 없습니다.' : '현재 보기에 해당하는 구매자가 없습니다.'}</p>}
        {shown.length > visibleCount && <button className="btn" type="button" onClick={() => setVisibleCount(count => count + 100)}>구매자 더 보기 · {visibleCount.toLocaleString('ko-KR')} / {shown.length.toLocaleString('ko-KR')}명</button>}
        <label>발송 시각 (현재 기기 시간)<input type="datetime-local" value={at} onChange={event => { setAt(event.target.value); edit(); }} /></label>
        <button className="btn" type="button" disabled={!setup.channels[channel] || !selected.length || !at || (needsRoom && !roomLink.trim()) || (channel === 'email' ? !subject.trim() || !content.trim() : directText ? !textBytes || textBytes > textLimit : !template)}
          onClick={() => setReview(true)}>대상·문구 확인</button>
        {review && <section className="onboarding-delivery-review" aria-label="발송 예약 미리보기">
          <h3>{purchaseChannelLabels[channel]} · {selected.length}명</h3>
          <p>{new Date(at).toLocaleString('ko-KR')}</p>
          {selectedPreviouslySent > 0 && <p>이전에 발송한 구매자 {selectedPreviouslySent.toLocaleString('ko-KR')}명이 포함돼 있습니다.</p>}
          <details><summary>선택한 구매자 확인</summary><p>{recipients.filter(buyer => selectedIds.has(buyer.id)).map(buyer => buyer.name + ' · ' + buyer.id.slice(-6)).join(', ')}</p></details>
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
    </section>
  </div>;
}
