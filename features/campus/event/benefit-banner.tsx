'use client';
import {useEffect,useState} from 'react';
import {isCouponQuote,type CouponQuote} from '@/features/commerce/domain/coupon';
export function EventBenefitBanner({cohortIds,signedIn}:{cohortIds:string[];signedIn:boolean}){
 const [benefit,setBenefit]=useState<{key:string;quote:CouponQuote}|null>(null);const key=cohortIds.join(',');
 useEffect(()=>{let alive=true;if(!signedIn||!key)return;void Promise.all(key.split(',').map(async cohortId=>{const r=await fetch('/api/coupons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'event-benefits',cohortId})});if(!r.ok)return null;const d=await r.json();return isCouponQuote(d.quote)?d.quote:null;})).then(rows=>{if(!alive)return;const quote=rows.filter((v):v is CouponQuote=>!!v).sort((a,b)=>b.couponDiscount-a.couponDiscount)[0];if(quote)setBenefit({key,quote});}).catch(()=>{});return()=>{alive=false;};},[key,signedIn]);
 if(!signedIn||benefit?.key!==key||!benefit.quote.couponDiscount)return null;
 return <aside role="status" style={{maxWidth:1120,margin:'20px auto',padding:20,background:'#eef5ff',border:'1px solid #aec9ef',borderRadius:14,color:'#153a65'}}><strong>내 이벤트 혜택 · {benefit.quote.couponDiscount.toLocaleString('ko-KR')}원 할인</strong><p style={{margin:'6px 0 0'}}>해당 교육 기수 결제 시 보유한 쿠폰을 자동 적용합니다. {benefit.quote.coupons?.length===2?'라이브 쿠폰과 당첨 쿠폰 중복 적용 혜택입니다.':''}</p></aside>;
}
