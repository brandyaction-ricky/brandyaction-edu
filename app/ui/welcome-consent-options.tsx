'use client';
import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { WelcomeChoices, WelcomeSnapshot, ConsentScope } from '@/lib/welcome-consent';
import styles from './welcome-consent.module.css';
function Item({ label, description, checked, mixed, disabled, onChange, coupon, children }: {
  label:string; description:string; checked:boolean; mixed?:boolean; disabled:boolean; onChange:(on:boolean)=>void; coupon?:boolean; children:ReactNode;
}) {
  const id=useId(), [open,setOpen]=useState(false);
  return <div className={styles.item}><div className={styles.row}><label className={styles.check}>
    <input type="checkbox" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`} aria-checked={mixed ? 'mixed' : checked} ref={n=>{if(n)n.indeterminate=!!mixed;}} checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/>
    <span className={`${styles.dot} ${checked || mixed ? styles.on : ''}`} aria-hidden="true">{(checked || mixed) && <Check size={13} strokeWidth={3}/>}</span>
    <span className={styles.copy}><span id={`${id}-label`}>[선택] {label}{coupon && <> </>}{coupon && <em className={styles.badge}>쿠폰</em>}</span><span id={`${id}-description`} className={styles.summary}>{description}</span></span>
  </label><button className={styles.more} type="button" aria-label={`${label} 자세히`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><ChevronRight size={17}/></button></div>{open && <div id={id} className={styles.detail}>{children}</div>}</div>;
}
export function WelcomeConsentOptions({ snapshot:s, value:v, onChange, disabled=false }: {
  snapshot:WelcomeSnapshot; value:WelcomeChoices; onChange:(value:WelcomeChoices,scope:ConsentScope)=>void; disabled?:boolean;
}) {
  const set=(scope:ConsentScope,patch:Partial<WelcomeChoices>)=>onChange({...v,...patch},scope);
  return <div className={styles.options}>
    <Item label="마케팅 정보 수신 (이메일·카카오)" description="할인·새 진단 소식을 보내드려요. 언제든지 수신 거부할 수 있어요." checked={v.email && v.kakao} mixed={v.email!==v.kakao} coupon disabled={disabled || !s.accepting.marketing && !v.email && !v.kakao} onChange={on=>set('marketing',{email:on,kakao:on})}>
      <p>체크하면 이메일과 카카오로 받아요. 한쪽만 받으려면 아래에서 고르세요.</p>
      <div className={styles.channels}><label><input type="checkbox" checked={v.email} disabled={disabled || !s.accepting.marketing && !v.email} onChange={e=>set('marketing',{email:e.target.checked})}/>이메일</label><label><input type="checkbox" checked={v.kakao} disabled={disabled || !s.accepting.marketing && !v.kakao} onChange={e=>set('marketing',{kakao:e.target.checked})}/>카카오</label></div>
      <dl><dt>목적·항목</dt><dd>클래스·무료강의·할인·행사 소식 발송. 선택한 채널의 이메일 주소·휴대전화번호를 사용해요.</dd><dt>보유 기간</dt><dd>동의 철회 또는 탈퇴 시까지. 2년마다 동의 여부를 확인해요.</dd><dt>거부·철회</dt><dd>선택하지 않아도 가입·결제·수강에 영향이 없어요. 회원 정보와 받은 소식의 수신거부 방법으로 언제든 끌 수 있어요.</dd></dl>
      <p>쿠폰은 마케팅 정보 수신만 동의해도 받아요. 이메일 또는 카카오 한 채널만 선택해도 되며 맞춤 추천·해외 분석·Meta 동의는 필요하지 않아요.</p>
    </Item>
    <Item label="맞춤 추천" description="구매·이용 기록으로 맞는 콘텐츠를 추천드려요." checked={v.analysis} disabled={disabled || !s.accepting.personal && !v.analysis} onChange={on=>set('analysis',{analysis:on})}>
      <p>{s.personal.terms?.analysis ?? '맞춤 추천 안내를 준비 중이에요. 지금은 새 동의를 받지 않아요.'}</p><p>해외 분석 서버에도 동의한 경우에만 회원별 맞춤 분석을 해요. 광고 수신·쿠폰과는 별개예요.</p>
    </Item>
    <Item label="해외 분석 서버 (맞춤 추천용, 미국 이전)" description="비슷한 사용자 추천 분석을 위해 서버에 보관해요." checked={v.overseas} disabled={disabled || !s.accepting.personal && !v.overseas} onChange={on=>set('overseas',{overseas:on})}>
      <p>{s.personal.terms?.overseas ?? 'Modal Labs, Inc.(미국)의 분석 서버 이용 안내를 준비 중이에요. 고지 확정 전 새 동의를 받지 않아요.'}</p>
    </Item>
    <Item label="Meta 구매 정보 전송 (광고 성과 측정, 미국 이전)" description="광고의 성과를 측정하기 위해 구매 기록을 Meta에 보관해요." checked={v.meta} disabled={disabled || !s.accepting.meta && !v.meta} onChange={on=>set('meta',{meta:on})}>
      {s.meta.terms ? <dl>{([['받는 곳',s.meta.terms.recipient],['이전 국가',s.meta.terms.country],['보내는 것',s.meta.terms.items],['언제·어떻게',s.meta.terms.transfer],['목적',s.meta.terms.purpose],['보유 기간',s.meta.terms.retention],['거부·철회',s.meta.terms.refusal],['문의',s.meta.terms.contact]] as const).map(([label,text])=><div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl> : <p>보내는 항목과 국외 이전 안내를 준비 중이에요. 지금은 새 동의를 받지 않아요.</p>}
      <p>선택하지 않아도 결제·수강과 1만원 쿠폰 발급에는 영향이 없어요.</p>
    </Item>
  </div>;
}
