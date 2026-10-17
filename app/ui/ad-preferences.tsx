'use client';
import { useEffect, useState } from 'react';
import { adRejectionSaved, rejectPersonalizedAds } from '@/lib/ad-preferences';

export function AdPreferences() {
  const [state, setState] = useState<'loading' | 'available' | 'saved' | 'unsaved'>('loading');
  const [account, setAccount] = useState<'idle' | 'saving' | 'withdrawn' | 'anonymous' | 'failed'>('idle');
  useEffect(() => {
    const update = () => setState(current => adRejectionSaved() ? 'saved' : current === 'unsaved' ? 'unsaved' : 'available');
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  const syncAccount = async () => {
    setAccount('saving');
    try {
      const response = await fetch('/api/account/meta-purchase-rejection', { method: 'POST', credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok || !['withdrawn','anonymous'].includes(body.account)) throw new Error('unavailable');
      setAccount(body.account);
    } catch { setAccount('failed'); }
  };
  const reject = () => {
    setState(rejectPersonalizedAds().saved ? 'saved' : 'unsaved');
    void syncAccount();
  };
  return <section id="advertising" className="privacy-ad-settings" aria-labelledby="privacy-ad-title" tabIndex={-1}>
    <span className="privacy-eyebrow">이 브라우저의 설정</span>
    <h2 id="privacy-ad-title">맞춤형 광고 설정</h2>
    <p>Meta(페이스북·인스타그램)는 이 사이트의 방문·클릭 기록을 광고 측정과 맞춤형 광고에 사용합니다.</p>
    <p>원하지 않으면 아래 버튼을 눌러 주세요. 로그인·결제·수강은 그대로 이용할 수 있어요.</p>
    {state === 'saved' ? <p role="status" className="privacy-ad-saved">맞춤형 광고를 거부했어요. 이 브라우저에서는 Meta로 방문·클릭 기록을 보내지 않습니다.</p>
      : <button className="btn" disabled={state === 'loading'} onClick={reject}>맞춤형 광고 거부</button>}
    {state === 'unsaved' && <p role="alert">이 페이지에서는 전송을 껐지만 설정을 저장하지 못했어요. 다음에 방문하면 다시 눌러 주세요. 브라우저에서 쿠키 저장을 허용하면 설정을 저장할 수 있어요.</p>}
    {account === 'saving' && <p aria-live="polite">계정의 구매 정보 전송 중단을 저장하고 있어요.</p>}
    {account === 'withdrawn' && <p aria-live="polite">이 계정의 Meta 구매 정보 전송 동의도 철회했어요. 대기 중인 전송과 다음 구매부터 적용돼요. 이미 전송된 기록은 별도로 삭제를 요청해야 해요.</p>}
    {account === 'failed' && <p role="alert">브라우저 차단은 적용했지만 계정의 구매 정보 전송 중단을 저장하지 못했어요. <button className="btn" onClick={() => void syncAccount()}>계정 설정 다시 저장</button></p>}
    {state === 'saved' && account === 'idle' && <button className="btn" onClick={() => void syncAccount()}>이 계정의 구매 정보 전송도 중단</button>}
    {account === 'anonymous' && <p>계정의 구매 정보 전송은 로그인 후 회원 정보에서 관리할 수 있어요.</p>}
    <p className="privacy-setting-note">설정은 1년 동안 저장됩니다. 다른 기기나 브라우저에서는 다시 눌러 주세요. 카카오톡·인스타그램 안에서 연 화면도 각각 설정해야 합니다.</p>
  </section>;
}
