"use client";
import { useEffect, useState } from 'react';
import { money, text as t, type Row } from '@/lib/platform';
import { couponKstInput } from '@/lib/coupon-rules';

export function CouponFields({ row, data }: { row?: Row; data: Record<string, Row[]> }) {
  const [type, setType] = useState(String(row?.discount_type || 'percentage'));
  const [scope, setScope] = useState(String(row?.product_scope || 'paid'));
  const [target, setTarget] = useState(String(row?.issue_target || 'all'));
  const [value, setValue] = useState(Number(row?.discount_value || 10));
  const [limit, setLimit] = useState(String(row?.usage_limit ?? ''));
  const [memberLimit, setMemberLimit] = useState(String(row ? row.per_user_limit ?? '' : 1));
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
        if (e.target.value === 'ADMIN_FREE') { setValue(100); setScope('paid'); setTarget('all'); setLimit(''); setMemberLimit(''); setActive(true); setExcludeFree(true); }
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
  const [result, setResult] = useState<{ rows: Row[]; count: number } | null>(null), [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coupons?history=${id}&page=${page}`, { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw Error(body.error); return body;
    }).then(body => { setResult(body); setError(''); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [id, page, revision]);
  async function cancel(orderId: string) {
    if (!window.confirm('0원 주문을 취소하고 이 주문의 수강권을 회수할까요? 쿠폰은 다시 사용할 수 있습니다.')) return;
    setPending(true);
    try {
      const response = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel-zero', orderId }) });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      setRevision(n => n + 1);
    } catch (cause) { setError((cause as Error).message); } finally { setPending(false); }
  }
  return <section><h3>쿠폰 사용 내역</h3>{error ? <p role="alert">{error}</p> : !result ? <p>내역을 불러오는 중…</p> : !result.rows.length ? <p>사용 내역이 없습니다.</p> : <>
    <div className="table-wrap"><table><thead><tr>{['회원·주문·상품','상품금액','할인','최종금액','사용일·상태'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(r => {
      const order = r.orders as Row; const profile = r.profiles as Row; const items = (order?.order_items || []) as Row[];
      const original = Number(r.original_amount ?? items.reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity || 1), 0));
      return <tr key={r.id}><td>{t(profile,'full_name') || '탈퇴 회원'}<small>{t(order,'order_number')}</small><small>{items.map(i => t(i,'item_name')).join(', ')}</small></td><td>{money(original)}</td><td>{money(Number(r.discount_amount))}</td><td>{money(Number(r.final_amount ?? order?.total_amount))}</td><td>{r.used_at ? new Date(String(r.used_at)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '—'}<small>{{used:'사용 완료',cancelled:'취소·복원',reserved:'결제 대기',released:'미사용'}[String(r.status)] || String(r.status)}</small>{order?.status === 'paid' && Number(order.total_amount) === 0 && <button type="button" className="btn" disabled={pending} onClick={() => void cancel(String(r.order_id))}>0원 주문 취소</button>}</td></tr>;
    })}</tbody></table></div><div className="actions"><button type="button" className="btn" disabled={page===1} onClick={() => {setResult(null);setPage(n=>n-1);}}>이전 내역</button><span>{page} 페이지 · {result.count}건</span><button type="button" className="btn" disabled={page*30>=result.count} onClick={() => {setResult(null);setPage(n=>n+1);}}>다음 내역</button></div>
  </>}</section>;
}
