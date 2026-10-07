'use client';
import { useEffect, useId, useRef } from 'react';
import { type ConsentChoices, type ConsentSnapshot } from '@/lib/optional-consent';
import styles from './optional-consent.module.css';
export function OptionalConsent({ value, onChange, disabled = false, dates }: {
  value: ConsentChoices; onChange: (value: ConsentChoices) => void; disabled?: boolean; dates?: ConsentSnapshot['dates'];
}) {
  const id = useId();
  const parent = useRef<HTMLInputElement>(null);
  const all = value.marketingUse && value.kakao && value.email;
  const mixed = !all && (value.marketingUse || value.kakao || value.email);
  useEffect(() => { if (parent.current) parent.current.indeterminate = mixed; }, [mixed]);
  const dated = (kind: keyof ConsentChoices) => dates?.[kind] ? <small className={styles.date}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' }).format(new Date(dates[kind]!))} 동의</small> : null;
  return <div className={styles.block} aria-describedby={`${id}-help`}>
    <label className={styles.parent}><input ref={parent} aria-checked={mixed ? 'mixed' : all} type="checkbox" checked={all} disabled={disabled} onChange={e => onChange({ marketingUse: e.target.checked, sms: false, kakao: e.target.checked, email: e.target.checked })}/><span>[선택] 교육·할인·행사 소식 받기 (광고)</span></label>
    <p className={styles.help} id={`${id}-help`}>받지 않아도 회원가입·결제·수강을 똑같이 이용할 수 있어요.</p>
    <div className={styles.options}>
      <label><input type="checkbox" checked={value.marketingUse} disabled={disabled} onChange={e => onChange(e.target.checked ? { ...value, marketingUse: true } : { marketingUse: false, sms: false, kakao: false, email: false })}/><span>맞춤 소식에 내 정보를 사용하는 데 동의해요{dated('marketingUse')}</span></label>
      <details className={styles.details}><summary>내 정보를 어떻게 사용하나요?</summary><p>주식회사 브랜디액션(브랜디에듀)이 교육·할인·행사 안내 대상을 고르기 위해 이름, 휴대폰 번호, 이메일, 구매·수강 기록을 사용합니다. 동의를 취소하거나 탈퇴할 때까지 사용합니다. 동의하지 않아도 서비스 이용에는 제한이 없습니다.</p></details>
      <span className={styles.help}>광고 소식을 받을 방법을 골라 주세요.</span>
      <div className={styles.channels}>{(['kakao', 'email'] as const).map(kind => <label key={kind}><input type="checkbox" checked={value[kind]} disabled={disabled} onChange={e => onChange({ ...value, [kind]: e.target.checked })}/><span>{kind === 'kakao' ? '카카오톡 광고 받기' : '이메일 광고 받기'}{dated(kind)}</span></label>)}</div>
      {(value.kakao || value.email) && !value.marketingUse && <p role="alert" className={styles.help}>광고 소식을 받으려면 위의 ‘내 정보를 사용하는 데 동의해요’도 선택해 주세요.</p>}
      <details className={styles.details}><summary>어떤 소식을 보내나요?</summary><p>주식회사 브랜디액션(브랜디에듀)이 교육상품·할인·행사 광고를 선택한 방법으로 보냅니다. 카카오톡은 휴대폰 번호, 이메일은 이메일 주소를 사용합니다. 동의를 취소하거나 탈퇴할 때까지 사용하며, 동의하지 않아도 서비스 이용에는 제한이 없습니다. 이메일 광고 발송을 시작할 경우 Resend, Inc.(미국)를 이용합니다.</p></details>
    </div>
  </div>;
}
