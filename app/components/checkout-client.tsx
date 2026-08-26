"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ArrowLeft, Banknote, Check, CreditCard, Landmark, ShieldCheck, TicketPercent, X } from "lucide-react";
import type { CheckoutCourse } from "@/lib/checkout-data";
import { isValidPhone } from "@/lib/auth-validation";
import type { TossKeyMode } from "@/lib/payment-config";

type Method = "card" | "transfer" | "virtual";
type AppliedCoupon = { name: string; code: string; discountAmount: number; totalAmount: number };
type WalletCoupon = AppliedCoupon & { walletId: string; id: string; description: string | null; expiresAt: string | null };

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

export function CheckoutClient({ course, initialCohortId, customer, clientKey, paymentMode, paymentReady, paymentConfigError }: {
  course: CheckoutCourse;
  initialCohortId: string;
  customer: { id: string; name: string; email: string; phone: string };
  clientKey: string;
  paymentMode: TossKeyMode;
  paymentReady: boolean;
  paymentConfigError: string;
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
  const [coupon,setCoupon]=useState<AppliedCoupon|null>(null);
  const [walletCoupons,setWalletCoupons]=useState<WalletCoupon[]>([]);
  const [walletOpen,setWalletOpen]=useState(false);
  const [walletPending,setWalletPending]=useState(false);
  const [walletLoaded,setWalletLoaded]=useState(false);
  const cohort = useMemo(() => course.cohorts.find((item) => item.id === cohortId) || course.cohorts[0], [course.cohorts, cohortId]);
  const allChecked = Object.values(agreements).every(Boolean);
  const discount = Math.max(0, course.listPrice - cohort.price);
  const finalPrice=coupon?.totalAmount??cohort.price;
  const toggleAll = (checked: boolean) => setAgreements({ terms: checked, privacy: checked, refund: checked });
  const selectCohort=(id:string)=>{setCohortId(id);setCoupon(null);setCouponError("");setWalletCoupons([]);setWalletLoaded(false);setWalletOpen(false)};
  const applyCoupon=async(code=couponCode)=>{if(!code.trim())return;setCouponPending(true);setCouponError("");try{const response=await fetch("/api/coupons/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,courseId:course.id,cohortId:cohort.id})});const data=await response.json();if(!response.ok){setCoupon(null);setCouponError(data.error||"쿠폰을 확인하지 못했습니다.")}else{setCoupon(data);setCouponCode(data.code);setWalletOpen(false)}}catch{setCouponError("쿠폰을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.")}finally{setCouponPending(false)}};
  const lookupWalletCoupons=async()=>{if(walletOpen){setWalletOpen(false);return}setWalletOpen(true);if(walletLoaded)return;setWalletPending(true);setCouponError("");try{const response=await fetch(`/api/coupons/available?courseId=${encodeURIComponent(course.id)}&cohortId=${encodeURIComponent(cohort.id)}`);const data=await response.json();if(!response.ok)throw new Error(data.error||"보유 쿠폰을 불러오지 못했습니다.");setWalletCoupons(data.coupons||[]);setWalletLoaded(true)}catch(reason){setWalletOpen(false);setCouponError(reason instanceof Error?reason.message:"보유 쿠폰을 불러오지 못했습니다.")}finally{setWalletPending(false)}};

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (pending || !allChecked) return;
    if (finalPrice > 0 && !paymentReady) { setError(`${paymentConfigError || "결제 설정이 완료되지 않았습니다."} 운영자에게 문의해 주세요.`); return; }
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
    {cohort.price > 0 && <><section><h2>결제 수단</h2><div className="payment-methods payment-method-grid">{methods.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={method === id ? "active" : ""} onClick={() => setMethod(id)}><Icon/>{label}{method === id && <Check/>}</button>)}</div>{method === "virtual" && <div className="payment-notice"><strong>가상계좌 입금기한</strong><span>발급 후 24시간 이내에 입금해야 하며, 입금 완료 후 수강권이 자동 발급됩니다.</span></div>}</section>
    <section className="checkout-coupon"><div className="coupon-heading"><div><h2><TicketPercent/>쿠폰 사용</h2><p>보유 쿠폰을 선택하거나 쿠폰 코드를 직접 입력할 수 있습니다.</p></div>{!coupon&&<button type="button" className="coupon-wallet-toggle" onClick={lookupWalletCoupons} disabled={walletPending}>{walletPending?"조회 중...":walletOpen?"목록 닫기":"보유 쿠폰 조회"}</button>}</div>{walletOpen&&!coupon&&<div className="coupon-wallet" aria-live="polite">{walletCoupons.length?<ul>{walletCoupons.map(item=><li key={item.walletId}><div><strong>{item.name}</strong><span>{item.description||`${item.code} 쿠폰`}</span><small>-{money(item.discountAmount)}{item.expiresAt?` · ${date(item.expiresAt)}까지`:" · 사용기한 제한 없음"}</small></div><button type="button" onClick={()=>applyCoupon(item.code)} disabled={couponPending}>{couponPending?"적용 중":"적용"}</button></li>)}</ul>:<p>이 상품에 사용할 수 있는 보유 쿠폰이 없습니다.</p>}</div>}{coupon?<div className="coupon-applied"><span><Check/><strong>{coupon.name}</strong><small>{coupon.code} · -{money(coupon.discountAmount)}</small></span><button type="button" onClick={()=>{setCoupon(null);setCouponCode("")}} aria-label="쿠폰 적용 해제"><X/></button></div>:<><div className="coupon-divider"><span>또는 쿠폰 코드 입력</span></div><div className="coupon-entry"><input value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,""))} placeholder="쿠폰 코드 입력"/><button type="button" onClick={()=>applyCoupon()} disabled={couponPending||!couponCode.trim()}>{couponPending?"확인 중":"쿠폰 적용"}</button></div></>}{couponError&&<p className="coupon-error" role="alert">{couponError}</p>}</section></>}
    <section><h2>약관 동의</h2><label className="check-row"><input type="checkbox" checked={allChecked} onChange={(event) => toggleAll(event.target.checked)}/>전체 약관에 동의합니다.</label><label className="check-row sub"><input type="checkbox" checked={agreements.terms} onChange={(event) => setAgreements({ ...agreements, terms: event.target.checked })}/><span>[필수] <Link href="/policies/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.privacy} onChange={(event) => setAgreements({ ...agreements, privacy: event.target.checked })}/><span>[필수] <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.refund} onChange={(event) => setAgreements({ ...agreements, refund: event.target.checked })}/><span>[필수] <Link href="/policies/refund" target="_blank">상품 환불규정</Link>을 확인했습니다.</span></label></section>
  </div><aside className="order-summary"><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}><h2 style={{margin:0}}>주문 상품</h2>{paymentMode === "test" && <span style={{display:"inline-flex",alignItems:"center",minHeight:26,padding:"0 9px",border:"1px solid #e9b84a",background:"#fff7dd",color:"#8a5a00",fontSize:11,fontWeight:800,letterSpacing:".04em"}}>TEST 결제</span>}</div><div className="mini-product"><span>LIVE</span><div><strong>{course.title}</strong><small>{cohort.name} · {date(cohort.operationStartAt)} 개강 · 계정당 1자리</small></div></div><dl><div><dt>정가</dt><dd>{money(course.listPrice)}</dd></div>{discount > 0 && <div><dt>기수 할인가</dt><dd className="red">-{money(discount)}</dd></div>}{coupon&&<div><dt>쿠폰 할인 · {coupon.code}</dt><dd className="red">-{money(coupon.discountAmount)}</dd></div>}</dl><div className="included-summary"><strong>포함 항목</strong><span>VOD·자료 + 라이브 + 녹화본</span><small>{course.durationLabel}</small></div><div className="total-row"><span>총 결제금액</span><strong>{money(finalPrice)}</strong></div><button type="submit" className={`button button-lg full ${allChecked && (finalPrice === 0 || paymentReady) ? "button-primary" : "button-disabled"}`} disabled={!allChecked || pending || (finalPrice > 0 && !paymentReady)}>{pending ? "주문 확인 중..." : finalPrice > 0 && !paymentReady ? "결제 설정 확인 필요" : allChecked ? finalPrice===0?"무료로 신청 완료":`${money(finalPrice)} 결제하기` : "필수 약관에 동의해 주세요"}</button>{finalPrice > 0 && !paymentReady && <p className="checkout-error" role="alert">{paymentConfigError || "결제 설정이 완료되지 않았습니다."}</p>}{error && <p className="checkout-error" role="alert">{error}</p>}<p><ShieldCheck size={15}/>{paymentMode === "test" ? "테스트 결제이며 실제 청구되지 않습니다." : "쿠폰 조건과 결제 금액은 서버에서 다시 검증됩니다."}</p></aside></div></form>;
}
