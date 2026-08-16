"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, Filter, RefreshCw, Search } from "lucide-react";

type Relation<T> = T | T[] | null;
type Item = { id: string; course_id: string; cohort_id: string; item_name: string; courses: Relation<{ id: string; title: string }>; cohorts: Relation<{ id: string; name: string }> };
type Payment = { provider_payment_key: string | null; method: string | null; status: string; approved_amount: number; cancelled_amount: number; receipt_url: string | null };
type Order = { id: string; order_number: string; status: string; total_amount: number; customer_name: string; customer_email: string; customer_phone: string | null; paid_at: string | null; expires_at: string | null; created_at: string; order_items: Item[]; payments: Payment[] };
const one = <T,>(value: Relation<T>) => Array.isArray(value) ? value[0] || null : value;
const label: Record<string, string> = { pending: "입금·승인 대기", paid: "결제 완료", payment_failed: "결제 실패", cancelled: "주문 취소", partially_refunded: "부분 환불", refunded: "환불 완료" };
const today = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offset * 86_400_000));
const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const csv = (value: unknown) => { const text = String(value ?? ""); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };

async function loadOrders() {
  const response = await fetch("/api/admin/orders", { cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { orders?: Order[]; error?: string };
  if (!response.ok) throw new Error(result.error || "주문을 불러오지 못했습니다.");
  return result.orders || [];
}

export function AdminOrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(today(-30));
  const [end, setEnd] = useState(today());
  const [courseId, setCourseId] = useState("all");
  const [cohortId, setCohortId] = useState("all");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailTarget, setDetailTarget] = useState<Order | null>(null);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundCompleted, setRefundCompleted] = useState(false);
  const [refund, setRefund] = useState({ amount: "", reason: "", bank: "", accountNumber: "", holderName: "", requestId: "" });
  const load = async () => { setError(""); try { setOrders(await loadOrders()); } catch (reason) { setError(reason instanceof Error ? reason.message : "주문을 불러오지 못했습니다."); } finally { setLoading(false); } };
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const courses = useMemo(() => { const map = new Map<string, string>(); orders.forEach((order) => order.order_items.forEach((item) => map.set(item.course_id, one(item.courses)?.title || item.item_name))); return [...map].map(([id, title]) => ({ id, title })); }, [orders]);
  const cohorts = useMemo(() => { const map = new Map<string, { id: string; name: string; courseId: string }>(); orders.forEach((order) => order.order_items.forEach((item) => map.set(item.cohort_id, { id: item.cohort_id, name: one(item.cohorts)?.name || "기수", courseId: item.course_id }))); return [...map.values()].filter((cohort) => courseId === "all" || cohort.courseId === courseId); }, [orders, courseId]);
  const methods = useMemo(() => [...new Set(orders.map((order) => order.payments[0]?.method).filter(Boolean))] as string[], [orders]);
  const visible = useMemo(() => orders.filter((order) => {
    const item = order.order_items[0]; const payment = order.payments[0]; const day = order.created_at.slice(0, 10); const needle = query.toLowerCase();
    return day >= start && day <= end && (courseId === "all" || item?.course_id === courseId) && (cohortId === "all" || item?.cohort_id === cohortId) && (status === "all" || order.status === status) && (method === "all" || payment?.method === method) && [order.order_number, order.customer_name, order.customer_email, order.customer_phone || "", item?.item_name || ""].some((value) => value.toLowerCase().includes(needle));
  }), [orders, query, start, end, courseId, cohortId, status, method]);
  const approved = visible.reduce((sum, order) => sum + (order.payments[0]?.approved_amount || 0), 0);
  const cancelled = visible.reduce((sum, order) => sum + (order.payments[0]?.cancelled_amount || 0), 0);
  const openRefund = (order: Order) => { const payment = order.payments[0]; setRefundTarget(order); setRefund({ amount: String((payment?.approved_amount || order.total_amount) - (payment?.cancelled_amount || 0)), reason: "", bank: "", accountNumber: "", holderName: "", requestId: crypto.randomUUID() }); };
  const executeRefund = async () => {
    if (!refundTarget) return; setRefunding(true); setError("");
    try {
      const isVirtual = refundTarget.payments[0]?.method === "가상계좌";
      const response = await fetch("/api/admin/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: refundTarget.order_number, amount: Number(refund.amount.replace(/[^0-9]/g, "")), reason: refund.reason, requestId: refund.requestId, ...(isVirtual ? { refundReceiveAccount: { bank: refund.bank, accountNumber: refund.accountNumber, holderName: refund.holderName } } : {}) }) });
      const result = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(result.error || "환불하지 못했습니다."); setRefundTarget(null); await load(); setRefundCompleted(true); window.setTimeout(() => setRefundCompleted(false), 2200);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "환불하지 못했습니다."); } finally { setRefunding(false); }
  };
  const exportCsv = () => {
    const rows = [["주문번호", "주문일", "주문자", "이메일", "휴대폰", "상품", "기수", "결제수단", "승인금액", "취소금액", "상태"], ...visible.map((order) => { const item = order.order_items[0]; const payment = order.payments[0]; return [order.order_number, order.created_at, order.customer_name, order.customer_email, order.customer_phone || "", one(item?.courses || null)?.title || item?.item_name || "", one(item?.cohorts || null)?.name || "", payment?.method || "", payment?.approved_amount || 0, payment?.cancelled_amount || 0, label[order.status] || order.status]; })];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `orders-${start}-${end}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  if (loading) return <section className="admin-panel admin-loading-state"><RefreshCw className="spin"/><strong>프론트 결제 데이터를 불러오는 중입니다.</strong></section>;
  return <div className="order-ops-page">
    <section className="order-metrics"><article><span>조회 주문</span><strong>{visible.length}건</strong></article><article><span>승인 금액</span><strong>{approved.toLocaleString()}원</strong></article><article><span>취소·환불</span><strong>{cancelled.toLocaleString()}원</strong></article><article><span>실결제액</span><strong>{Math.max(0, approved - cancelled).toLocaleString()}원</strong></article></section>
    <section className="admin-panel order-filter-console"><header><div><Filter/><span><strong>결제 데이터 조회</strong><small>프론트 주문·토스 승인·수강권 발급과 동일한 데이터입니다.</small></span></div><button onClick={() => { setQuery(""); setCourseId("all"); setCohortId("all"); setStatus("all"); setMethod("all"); }}>필터 초기화</button></header><div>
      <label>시작일<input type="date" value={start} onChange={(event) => setStart(event.target.value)}/></label><label>종료일<input type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></label>
      <label>상품<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setCohortId("all"); }}><option value="all">전체 상품</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label>기수<select value={cohortId} onChange={(event) => setCohortId(event.target.value)}><option value="all">전체 기수</option>{cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</select></label>
      <label>결제 상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option>{Object.entries(label).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>결제 수단<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">전체 수단</option>{methods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="order-keyword"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="주문번호·고객·상품 검색"/></div>
    </div></section>
    <section className="admin-panel order-live-table"><header><div><strong>주문·결제 내역</strong><span>{visible.length}건</span></div><div><button className="admin-outline" onClick={() => void load()}><RefreshCw/>새로고침</button><button className="admin-outline" onClick={exportCsv}><Download/>CSV</button></div></header><div className="order-live-head"><span>주문</span><span>고객</span><span>상품·기수</span><span>결제</span><span>상태</span><span>운영</span></div>
      {visible.map((order) => { const item = order.order_items[0]; const payment = order.payments[0]; return <article key={order.id}><div><strong>{order.order_number}</strong><small>{date(order.created_at)}</small></div><div><strong>{order.customer_name}</strong><small>{order.customer_email}</small><small>{order.customer_phone || "휴대폰 미입력"}</small></div><div><strong>{one(item?.courses || null)?.title || item?.item_name || "상품"}</strong><small>{one(item?.cohorts || null)?.name || "기수 정보 없음"}</small></div><div><strong>{order.total_amount.toLocaleString()}원</strong><small>{payment?.method || "미승인"}{payment?.cancelled_amount ? ` · 취소 ${payment.cancelled_amount.toLocaleString()}원` : ""}</small></div><span className={`status-label ${order.status === "paid" ? "success" : order.status.includes("refund") ? "refund" : "planned"}`}>{label[order.status] || order.status}</span><div className="order-row-actions"><button onClick={() => setDetailTarget(order)}>주문 상세</button></div></article>; })}
      {!visible.length && <div className="order-empty-state"><Search/><strong>조건에 맞는 결제 데이터가 없습니다.</strong><span>프론트 결제가 완료되면 이 화면에 즉시 표시됩니다.</span></div>}
    </section>
    {detailTarget && (()=>{const payment=detailTarget.payments[0];const available=Math.max(0,(payment?.approved_amount||detailTarget.total_amount)-(payment?.cancelled_amount||0));const refundable=["paid","partially_refunded"].includes(detailTarget.status)&&available>0;return <div className="admin-modal-backdrop" onMouseDown={()=>setDetailTarget(null)}><section className="admin-modal order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" onMouseDown={(event)=>event.stopPropagation()}><header><div><span>ORDER DETAIL</span><h2 id="order-detail-title">주문 상세내역</h2><p>{detailTarget.order_number}</p></div><span className={`status-label ${detailTarget.status==="paid"?"success":detailTarget.status.includes("refund")?"refund":"planned"}`}>{label[detailTarget.status]||detailTarget.status}</span></header><section><h3>결제 정보</h3><dl><div><dt>주문자</dt><dd>{detailTarget.customer_name}<small>{detailTarget.customer_email}</small></dd></div><div><dt>결제 수단</dt><dd>{payment?.method||"미승인"}</dd></div><div><dt>결제 일시</dt><dd>{detailTarget.paid_at?date(detailTarget.paid_at):"결제 전"}</dd></div></dl></section><section><h3>상품 정보</h3>{detailTarget.order_items.map((item)=><article key={item.id}><div><strong>{one(item.courses)?.title||item.item_name}</strong><small>{one(item.cohorts)?.name||"기수 정보 없음"}</small></div></article>)}</section><section className="order-detail-amount"><div className="order-detail-amount-head"><h3>결제 금액</h3>{refundable&&<button className="order-refund-button" onClick={()=>{setDetailTarget(null);openRefund(detailTarget);}}>환불하기</button>}</div><dl><div><dt>승인 금액</dt><dd>{(payment?.approved_amount||detailTarget.total_amount).toLocaleString()}원</dd></div>{Boolean(payment?.cancelled_amount)&&<div><dt>취소 금액</dt><dd>-{payment.cancelled_amount.toLocaleString()}원</dd></div>}<div className="total"><dt>취소 가능 금액</dt><dd>{available.toLocaleString()}원</dd></div></dl></section><footer>{payment?.receipt_url&&<a className="admin-outline" href={payment.receipt_url} target="_blank" rel="noreferrer"><ExternalLink/>영수증</a>}<span/><button className="admin-outline" onClick={()=>setDetailTarget(null)}>닫기</button></footer></section></div>})()}
    {refundTarget && <div className="admin-modal-backdrop" onMouseDown={() => setRefundTarget(null)}><section className="admin-modal refund-modal" onMouseDown={(event) => event.stopPropagation()}><h2>결제 환불 처리</h2><p>{refundTarget.order_number} · 토스 취소 성공 후 주문 상태와 수강권이 함께 반영됩니다.</p><label>환불 금액<input inputMode="numeric" value={refund.amount} onChange={(event) => setRefund({ ...refund, amount: event.target.value })}/></label><label>환불 사유<textarea value={refund.reason} onChange={(event) => setRefund({ ...refund, reason: event.target.value })}/></label>{refundTarget.payments[0]?.method === "가상계좌" && <><label>은행 코드<input value={refund.bank} onChange={(event) => setRefund({ ...refund, bank: event.target.value })}/></label><label>계좌번호<input value={refund.accountNumber} onChange={(event) => setRefund({ ...refund, accountNumber: event.target.value })}/></label><label>예금주<input value={refund.holderName} onChange={(event) => setRefund({ ...refund, holderName: event.target.value })}/></label></>}<div><button onClick={() => setRefundTarget(null)}>취소</button><button className="admin-primary" onClick={() => void executeRefund()} disabled={!refund.reason.trim() || refunding}>{refunding ? "처리 중..." : "환불 실행"}</button></div></section></div>}
    {error && <p className="admin-save-error" role="alert">{error}</p>}
    <div className={`admin-toast ${refundCompleted ? "show" : ""}`} role="status" aria-live="polite"><Check/> 환불이 완료되어 주문 상태와 수강권이 반영되었습니다.</div>
  </div>;
}
