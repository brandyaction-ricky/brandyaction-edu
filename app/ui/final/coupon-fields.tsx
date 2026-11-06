"use client";
import { useEffect, useState } from 'react';
import { money, text as t, type Row } from '@/lib/platform';
import { couponKstInput, couponHistoryLabel, type CouponHistoryView } from '@/lib/coupon-rules';

export function CouponFields({ row, data }: { row?: Row; data: Record<string, Row[]> }) {
  const [type, setType] = useState(String(row?.discount_type || 'percentage'));
  const [scope, setScope] = useState(String(row?.product_scope || 'paid'));
  const [target, setTarget] = useState(String(row?.issue_target || 'all'));
  const [value, setValue] = useState(Number(row?.discount_value || 10));
  const [limit, setLimit] = useState(String(row?.usage_limit ?? ''));
  const [memberLimit, setMemberLimit] = useState(String(row ? row.per_user_limit ?? '' : 1));
  const [stackable, setStackable] = useState(!!row?.is_stackable);
  const [active, setActive] = useState(row?.is_active !== false);
  const [excludeFree, setExcludeFree] = useState(row?.exclude_free !== false);
  const admin = type === 'ADMIN_FREE';
  return <div className="coupon-settings-form">
    <div className="coupon-preview"><span>BRANDYACTION BENEFIT</span><strong>{admin ? '관리자 전용 · 100% 무료' : type === 'percentage' ? `${value}% 할인` : money(value) + ' 할인'}</strong><p>완료된 주문은 바뀌지 않으며 이후 적용부터 새 조건을 검증합니다.</p></div>
    <div className="grid2">
      <label className="field">쿠폰명 *<input name="name" required maxLength={100} defaultValue={t(row, 'name')} /></label>
      <label className="field">쿠폰 코드 *<input name="code" required pattern="[A-Za-z0-9_-]{3,30}" maxLength={30} defaultValue={t(row, 'code')} placeholder="영문·숫자·밑줄·하이픈 3~30자" /></label>
      <label className="field">할인 방식<select name="discount_type" value={type} onChange={e => {
        setType(e.target.value);
        if (e.target.value === 'ADMIN_FREE') { setStackable(false); setValue(100); setScope('paid'); setTarget('all'); setLimit(''); setMemberLimit(''); setActive(true); setExcludeFree(true); }
      }}><option value="percentage">정률</option><option value="fixed">정액</option><option value="ADMIN_FREE">관리자 전용 100% 무료</option></select></label>
      <label className="field">할인 수치 *<input name="discount_value" type="number" min={1} max={type === 'fixed' ? 2147483647 : 100} required readOnly={admin} value={value} onChange={e => setValue(Number(e.target.value))} /></label>
      <label className="field">최대 할인액 · 원<input name="max_discount_amount" type="number" min={0} max={2147483647} defaultValue={row?.max_discount_amount == null ? '' : Number(row.max_discount_amount)} disabled={type !== 'percentage'} /></label>
      <label className="field">최소 주문 금액 · 원<input name="minimum_order_amount" type="number" min={0} max={2147483647} defaultValue={Number(row?.minimum_order_amount || 0)} /></label>
      <label className="field">발급 대상<select name="issue_target" value={target} onChange={e => setTarget(e.target.value)}><option value="all">{admin ? '관리자만' : '전체 회원'}</option><option value="tag">고객 태그 회원</option></select></label>
      <label className="field">대상 태그<select name="target_tag_id" defaultValue={t(row, 'target_tag_id')} disabled={target !== 'tag'} required={target === 'tag'}><option value="">태그 선택</option>{(data.crm_tags || []).map(tag => <option key={tag.id} value={tag.id}>{t(tag, 'name')}</option>)}</select></label>
      <label className="field">적용 상품<select name="product_scope" value={scope} onChange={e => setScope(e.target.value)}><option value="paid">전체 유료 상품</option><option value="all">전체 상품</option><option value="specific">특정 상품</option></select></label>
    </div>
    {scope === 'specific' && <fieldset><legend>특정 상품 · 하나 이상 선택</legend>{(data.courses || []).filter(c => !c.archived_at).map(c => <label className="checkline" key={c.id}><input type="checkbox" name="applicable_course_ids" value={c.id} defaultChecked={(data.coupon_products || []).some(link => link.coupon_id === row?.id && link.course_id === c.id)} />{t(c, 'title')}</label>)}</fieldset>}
    <label className="field">쿠폰 설명<textarea name="description" maxLength={2000} defaultValue={t(row, 'description')} /></label>
    <div className="grid2">{[['issue_start_at','발급 시작'],['issue_end_at','발급 종료'],['starts_at','사용 시작'],['ends_at','사용 종료']].map(([key,label]) => <label className="field" key={key}>{label} · KST<input name={key} type="datetime-local" defaultValue={couponKstInput(row?.[key])} /></label>)}</div>
    <p className="meta">기간을 비우면 제한 없습니다. 이미 발급된 쿠폰은 사용 기간까지 사용할 수 있습니다.</p>
    <section className="coupon-limit-group"><h3>수량·사용 제한</h3><div className="grid2">
      <label className="field">총 발급 수량<input name="usage_limit" type="number" min={1} max={2147483647} value={limit} onChange={e => setLimit(e.target.value)} placeholder="제한 없음" /></label>
      <label className="field">회원별 사용 횟수<input name="per_user_limit" type="number" min={1} max={2147483647} value={memberLimit} onChange={e => setMemberLimit(e.target.value)} placeholder="제한 없음" /></label>
    </div><p className="meta">빈 값은 제한 없음입니다. 결제 대기 수량은 잠시 예약하고 완료 후 사용 횟수에 반영합니다.</p></section>
    <section className="coupon-limit-group"><h3>다른 쿠폰과 함께 쓰기</h3>
      <label className="checkline"><input name="is_stackable" type="checkbox" checked={!admin && stackable} disabled={admin} onChange={e => setStackable(e.target.checked)} />다른 쿠폰과 중복 적용 가능</label>
      <p className="meta">체크하면 일반 쿠폰 한 장에 이 쿠폰을 추가할 수 있습니다. 중복 가능 쿠폰끼리도 함께 쓸 수 있으며 한 주문에 최대 10장입니다. 할인 합계는 상품 금액을 넘지 않습니다. 기존 라이브·당첨 쿠폰 조합도 유지됩니다.</p>
      <p className="meta">체크하지 않은 일반 쿠폰끼리는 함께 쓸 수 없습니다. 같은 쿠폰을 여러 주문에서 반복 사용하려면 위 ‘회원별 사용 횟수’를 비워 두세요. 사용 기간·상품·대상 조건은 그대로 적용됩니다. 관리자 전용 무료 쿠폰은 중복 적용할 수 없습니다.</p>
    </section>
    <label className="checkline"><input name="is_alumni" type="checkbox" defaultChecked={!!row?.is_alumni} />기존 수강생 전용 쿠폰 · 이후 주문의 유입을 ‘동문’으로 기록</label>
    <p className="meta">실제로 기존 수강생에게 주는 쿠폰에만 선택해 주세요. 기존 주문의 유입은 바뀌지 않습니다.</p>
    <label className="checkline"><input name="is_draft" type="checkbox" defaultChecked={!!row?.is_draft} />임시 저장 · 발급 및 사용 차단</label>
    <label className="checkline"><input name="is_active" type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />쿠폰 사용 활성화</label>
    <label className="checkline"><input name="exclude_free" type="checkbox" checked={excludeFree} onChange={e => setExcludeFree(e.target.checked)} disabled={admin} />무료 상품 적용 제외</label>
    {row && <CouponHistory id={row.id} />}
  </div>;
}

function CouponHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [view, setView] = useState<CouponHistoryView>('usage');
  const [result, setResult] = useState<{ rows: Row[]; count: number; counts?: Record<CouponHistoryView, number> } | null>(null), [error, setError] = useState('');
  const [counts, setCounts] = useState<Partial<Record<CouponHistoryView, number>>>({});
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coupons?history=${id}&page=${page}&view=${view}`, { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw Error(body.error); return body;
    }).then(body => { if (!controller.signal.aborted) { setResult(body); setCounts(body.counts || {[view]: body.count}); setError(''); } }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [id, page, revision, view]);
  function changeView(next: CouponHistoryView) { setResult(null); setError(''); setPage(1); setView(next); }
  async function cancel(orderId: string) {
    if (!window.confirm('0원 주문을 취소하고 이 주문의 수강권을 회수할까요? 쿠폰은 다시 사용할 수 있습니다.')) return;
    setPending(true);
    try {
      const response = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel-zero', orderId }) });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      setRevision(n => n + 1);
    } catch (cause) { setError((cause as Error).message); } finally { setPending(false); }
  }
  return <section className="coupon-history"><h3>쿠폰 사용 내역</h3>
    <div className="status-tabs" role="group" aria-label="쿠폰 내역 보기">{([['usage','실제 사용·복원'],['attempts','결제 미완료 시도'],['pending','결제 대기']] as const).map(([key,label]) => <button type="button" key={key} className={`tab${view===key?' active':''}`} aria-pressed={view===key} onClick={() => {if(view!==key)changeView(key);}}>{label}{counts[key] != null ? ` ${counts[key]}건` : ''}</button>)}</div>
    <p className="meta">실제 사용·복원 기록만 기본으로 표시합니다. 결제 미완료 시도와 예약은 사용 횟수에 포함되지 않습니다.</p>
    {error ? <p role="alert">{error} <button type="button" className="btn small" onClick={() => {setError('');setRevision(n=>n+1);}}>다시 불러오기</button></p> : !result ? <p role="status">내역을 불러오는 중…</p> : !result.rows.length ? <p>{view==='usage'?'실제 사용·복원 내역이 없습니다.':view==='attempts'?'결제 미완료 시도가 없습니다.':'결제 대기 내역이 없습니다.'}</p> : <>
    <div className="table-wrap"><table aria-label="쿠폰 사용 내역"><thead><tr>{['회원·주문·상품·상태','상품금액','할인','최종금액'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(r => {
      const order = r.orders as Row; const profile = r.profiles as Row; const items = (order?.order_items || []) as Row[];
      const original = Number(r.original_amount ?? items.reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity || 1), 0));
      const actual = r.status === 'used' || r.status === 'cancelled';
      const date = new Date(String(r.used_at || r.created_at || ''));
      const when = Number.isFinite(date.getTime()) ? `${r.used_at?'사용':'시도'} ${date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST` : '일시 미기록';
      return <tr key={r.id} className={actual?'':'coupon-history-attempt'}><td><strong>{t(profile,'full_name') || '탈퇴 회원'}</strong><span className="coupon-history-status">{couponHistoryLabel(r,order)}</span><small>{t(order,'order_number')}</small><small>{items.map(i => t(i,'item_name')).join(', ')}</small><small>{when}</small>{order?.status === 'paid' && Number(order.total_amount) === 0 && <button type="button" className="btn small" disabled={pending} onClick={() => void cancel(String(r.order_id))}>0원 주문 취소</button>}</td><td data-label="상품금액">{money(original)}</td><td data-label="할인">{actual?money(Number(r.discount_amount)):'—'}</td><td data-label="최종금액">{actual?money(Number(r.final_amount ?? order?.total_amount)):'—'}</td></tr>;
    })}</tbody></table></div><div className="actions"><button type="button" className="btn" disabled={page===1} onClick={() => {setResult(null);setPage(n=>n-1);}}>이전 내역</button><span>{page} 페이지 · {result.count}건</span><button type="button" className="btn" disabled={page*30>=result.count} onClick={() => {setResult(null);setPage(n=>n+1);}}>다음 내역</button></div>
  </>}</section>;
}
