"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ArrowLeft, Banknote, Check, CreditCard, Landmark, ShieldCheck, TicketPercent, X } from "lucide-react";
import type { CheckoutCourse } from "@/lib/checkout-data";
import { isValidPhone } from "@/lib/auth-validation";

type Method = "card" | "transfer" | "virtual";

const methods = [
  { id: "card" as const, label: "카드·간편결제", icon: CreditCard },
  { id: "transfer" as const, label: "실시간 계좌이체", icon: Landmark },
  { id: "virtual" as const, label: "가상계좌", icon: Banknote },
];

function money(value: number) { return `${value.toLocaleString("ko-KR")}원`; }
function date(value: string | null) {
  if (!value) return "일정 추후 안내";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}

export function CheckoutClient({ course, initialCohortId, customer, clientKey }: {
  course: CheckoutCourse;
  initialCohortId: string;
  customer: { id: string; name: string; email: string; phone: string };
  clientKey: string;
}) {
  const router=useRouter();
  const [cohortId, setCohortId] = useState(initialCohortId);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [method, setMethod] = useState<Method>("card");
  const [agreements, setAgreements] = useState({ terms: false, privacy: false, refund: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [couponCode,setCouponCode]=useState("");
  const [couponPending,setCouponPending]=useState(false);
  const [couponError,setCouponError]=useState("");
  const [coupon,setCoupon]=useState<{name:string;code:string;discountAmount:number;totalAmount:number}|null>(null);
  const cohort = useMemo(() => course.cohorts.find((item) => item.id === cohortId) || course.cohorts[0], [course.cohorts, cohortId]);
  const allChecked = Object.values(agreements).every(Boolean);
  const discount = Math.max(0, course.listPrice - cohort.price);
  const finalPrice=coupon?.totalAmount??cohort.price;
  const toggleAll = (checked: boolean) => setAgreements({ terms: checked, privacy: checked, refund: checked });
  const selectCohort=(id:string)=>{setCohortId(id);setCoupon(null);setCouponError("")};
  const applyCoupon=async()=>{if(!couponCode.trim())return;setCouponPending(true);setCouponError("");const response=await fetch("/api/coupons/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:couponCode,courseId:course.id,cohortId:cohort.id})});const data=await response.json();if(!response.ok){setCoupon(null);setCouponError(data.error||"쿠폰을 확인하지 못했습니다.")}else{setCoupon(data);setCouponCode(data.code)}setCouponPending(false)};

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (pending || !allChecked) return;
    if (!clientKey) { setError("결제 키가 설정되지 않았습니다. 운영자에게 문의해 주세요."); return; }
    if (!name.trim()) { setError("신청자 이름을 입력해 주세요."); return; }
    if (!isValidPhone(phone)) { setError("휴대폰 번호를 10~11자리 숫자로 입력해 주세요."); return; }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId: cohort.id, name, email: customer.email, phone, agreements, couponCode:coupon?.code||"" }),
      });
      const order = await response.json() as { error?: string; orderNumber: string; totalAmount: number; courseTitle: string; cohortName: string; free?:boolean };
      if (!response.ok) throw new Error(order.error || "주문을 만들지 못했습니다.");
      if(order.free){router.push(`/order-complete?orderId=${encodeURIComponent(order.orderNumber)}`);return}

      const toss = await loadTossPayments(clientKey);
      const payment = toss.payment({ customerKey: customer.id });
      const common = {
        amount: { currency: "KRW" as const, value: order.totalAmount },
        orderId: order.orderNumber,
        orderName: `${order.courseTitle} · ${order.cohortName}`.slice(0, 100),
        customerName: name,
        customerEmail: customer.email,
        customerMobilePhone: phone.replace(/[^0-9]/g, "") || undefined,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        windowTarget: "self" as const,
      };
      if (method === "virtual") {
        await payment.requestPayment({ ...common, method: "VIRTUAL_ACCOUNT", virtualAccount: { cashReceipt: { type: "소득공제" }, useEscrow: false, validHours: 24 } });
      } else if (method === "transfer") {
        await payment.requestPayment({ ...common, method: "TRANSFER", transfer: { cashReceipt: { type: "소득공제" }, useEscrow: false } });
      } else {
        await payment.requestPayment({ ...common, method: "CARD", card: { flowMode: "DEFAULT", useEscrow: false, useCardPoint: false, useAppCardOnly: false } });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "결제창을 열지 못했습니다.");
      setPending(false);
    }
  }

  return <form className="checkout-wrap container" onSubmit={pay}><Link href={`/classes/${course.slug}`} className="back-link"><ArrowLeft size={18}/> 클래스 상세로</Link><div className="checkout-title"><span>ORDER</span><h1>수강 신청</h1><ol><li className="active">1 주문 확인</li><li>2 결제</li><li>3 신청 완료</li></ol></div><div className="checkout-layout"><div className="checkout-form">
    <section><h2>신청자 정보</h2><div className="form-grid"><label>이름<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required/></label><label>휴대폰 번호<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" required/></label><label className="full-field">이메일<input value={customer.email} disabled/></label></div><p className="form-help">결제와 수강권은 현재 로그인한 이메일 계정에 연결됩니다.</p></section>
    {course.cohorts.length > 1 && <section><h2>기수 선택</h2><label className="checkout-cohort-select">신청 기수<select value={cohortId} onChange={(event) => selectCohort(event.target.value)}>{course.cohorts.map((item) => <option value={item.id} key={item.id}>{item.name} · {date(item.operationStartAt)} · {money(item.price)}</option>)}</select></label></section>}
    <section className="checkout-coupon"><h2><TicketPercent/>쿠폰 사용</h2><p>쿠폰 코드를 입력하면 적용 상품, 사용 수량과 기간을 확인합니다.</p>{coupon?<div className="coupon-applied"><span><Check/><strong>{coupon.name}</strong><small>{coupon.code} · -{money(coupon.discountAmount)}</small></span><button type="button" onClick={()=>{setCoupon(null);setCouponCode("")}} aria-label="쿠폰 적용 해제"><X/></button></div>:<div className="coupon-entry"><input value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,""))} placeholder="쿠폰 코드 입력"/><button type="button" onClick={applyCoupon} disabled={couponPending||!couponCode.trim()}>{couponPending?"확인 중":"쿠폰 적용"}</button></div>}{couponError&&<p className="coupon-error" role="alert">{couponError}</p>}</section>
    <section><h2>결제 수단</h2><div className="payment-methods payment-method-grid">{methods.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={method === id ? "active" : ""} onClick={() => setMethod(id)}><Icon/>{label}{method === id && <Check/>}</button>)}</div>{method === "virtual" && <div className="payment-notice"><strong>가상계좌 입금기한</strong><span>발급 후 24시간 이내에 입금해야 하며, 입금 완료 후 수강권이 자동 발급됩니다.</span></div>}</section>
    <section><h2>약관 동의</h2><label className="check-row"><input type="checkbox" checked={allChecked} onChange={(event) => toggleAll(event.target.checked)}/>전체 약관에 동의합니다.</label><label className="check-row sub"><input type="checkbox" checked={agreements.terms} onChange={(event) => setAgreements({ ...agreements, terms: event.target.checked })}/><span>[필수] <Link href="/policies/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.privacy} onChange={(event) => setAgreements({ ...agreements, privacy: event.target.checked })}/><span>[필수] <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.refund} onChange={(event) => setAgreements({ ...agreements, refund: event.target.checked })}/><span>[필수] <Link href="/policies/refund" target="_blank">상품 환불규정</Link>을 확인했습니다.</span></label></section>
  </div><aside className="order-summary"><h2>주문 상품</h2><div className="mini-product"><span>LIVE</span><div><strong>{course.title}</strong><small>{cohort.name} · {date(cohort.operationStartAt)} 개강 · 계정당 1자리</small></div></div><dl><div><dt>정가</dt><dd>{money(course.listPrice)}</dd></div>{discount > 0 && <div><dt>기수 할인가</dt><dd className="red">-{money(discount)}</dd></div>}{coupon&&<div><dt>쿠폰 할인 · {coupon.code}</dt><dd className="red">-{money(coupon.discountAmount)}</dd></div>}</dl><div className="included-summary"><strong>포함 항목</strong><span>VOD·자료 + 라이브 + 녹화본</span><small>{course.durationLabel}</small></div><div className="total-row"><span>총 결제금액</span><strong>{money(finalPrice)}</strong></div><button type="submit" className={`button button-lg full ${allChecked ? "button-primary" : "button-disabled"}`} disabled={!allChecked || pending}>{pending ? "주문 확인 중..." : allChecked ? finalPrice===0?"무료로 신청 완료":`${money(finalPrice)} 결제하기` : "필수 약관에 동의해 주세요"}</button>{error && <p className="checkout-error" role="alert">{error}</p>}<p><ShieldCheck size={15}/>쿠폰 조건과 결제 금액은 서버에서 다시 검증됩니다.</p></aside></div></form>;
}
