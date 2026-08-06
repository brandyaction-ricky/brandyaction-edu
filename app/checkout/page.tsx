"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Banknote, Check, CreditCard, Landmark, ShieldCheck, Smartphone } from "lucide-react";
import { BrandHeader } from "../components/brand-header";

const methods = [
  { id: "card", label: "신용·체크카드", icon: CreditCard },
  { id: "easy", label: "카카오·네이버·토스페이", icon: Smartphone },
  { id: "transfer", label: "실시간 계좌이체", icon: Landmark },
  { id: "virtual", label: "가상계좌", icon: Banknote },
];

export default function CheckoutPage(){
  const [method,setMethod]=useState("card");
  const [agreements,setAgreements]=useState({terms:false,privacy:false,refund:false});
  const allChecked=Object.values(agreements).every(Boolean);
  const toggleAll=(checked:boolean)=>setAgreements({terms:checked,privacy:checked,refund:checked});
  return <main className="checkout-page"><BrandHeader/><section className="checkout-wrap container"><Link href="/classes/local-marketing" className="back-link"><ArrowLeft size={18}/> 클래스 상세로</Link><div className="checkout-title"><span>ORDER</span><h1>수강 신청</h1><ol><li className="active">1 주문 확인</li><li>2 결제</li><li>3 신청 완료</li></ol></div><div className="checkout-layout"><div className="checkout-form">
  <section><h2>신청자 정보</h2><div className="form-grid"><label>이름<input defaultValue="리키"/></label><label>휴대폰 번호<input defaultValue="010-1234-5678"/></label><label className="full-field">이메일<input defaultValue="ricky@brandyaction.co.kr"/></label></div><p className="form-help">휴대폰 번호는 문자 인증을 완료한 회원 정보입니다.</p></section>
  <section><h2>결제 수단</h2><div className="payment-methods payment-method-grid">{methods.map(({id,label,icon:Icon})=><button key={id} type="button" className={method===id?"active":""} onClick={()=>setMethod(id)}><Icon/>{label}{method===id&&<Check/>}</button>)}</div>{method==="virtual"&&<div className="payment-notice"><strong>가상계좌 입금기한</strong><span>발급 후 24시간과 1회차 시작 시각 중 더 빠른 시점까지 자리가 확보됩니다.</span></div>}</section>
  <section><h2>약관 동의</h2><label className="check-row"><input type="checkbox" checked={allChecked} onChange={(event)=>toggleAll(event.target.checked)}/>전체 약관에 동의합니다.</label><label className="check-row sub"><input type="checkbox" checked={agreements.terms} onChange={(event)=>setAgreements({...agreements,terms:event.target.checked})}/><span>[필수] <Link href="/policies/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.privacy} onChange={(event)=>setAgreements({...agreements,privacy:event.target.checked})}/><span>[필수] <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label className="check-row sub"><input type="checkbox" checked={agreements.refund} onChange={(event)=>setAgreements({...agreements,refund:event.target.checked})}/><span>[필수] <Link href="/policies/refund" target="_blank">상품 환불규정</Link>을 확인했습니다.</span></label></section>
 </div><aside className="order-summary"><h2>주문 상품</h2><div className="mini-product"><span>LIVE 01</span><div><strong>매출을 만드는 자영업 마케팅 실전반</strong><small>1기 · 2026.08.19 개강 · 계정당 1자리</small></div></div><dl><div><dt>정가</dt><dd>490,000원</dd></div><div><dt>기수 할인가</dt><dd className="red">-40,000원</dd></div></dl><div className="included-summary"><strong>포함 항목</strong><span>공통 VOD·자료 + 라이브 4회 + 녹화본</span><small>모든 콘텐츠는 기간 제한 없이 제공됩니다.</small></div><div className="total-row"><span>총 결제금액</span><strong>450,000원</strong></div>{allChecked?<Link href="/order-complete" className="button button-primary button-lg full">450,000원 결제하기</Link>:<button className="button button-disabled button-lg full" disabled>필수 약관에 동의해 주세요</button>}<p><ShieldCheck size={15}/>안전한 결제를 위해 정보가 암호화됩니다.</p></aside></div></section></main>}
